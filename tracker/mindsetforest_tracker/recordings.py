"""Knowledge OS intake: recordings in a folder become raw transcripts and Obsidian notes.

Every minute the tracker looks at ``recordings_dir`` (Bandicam's folder by
default). A new MP3 that has stopped growing is:

1. hashed (the original is only ever read, never moved or changed);
2. cut into chunks of a few minutes at MP3 frame boundaries and sent to the
   ``kos-transcribe`` Edge Function (Whisper large-v3-turbo, segment
   timestamps); the chunks' segments are joined with their offsets;
3. stored in ``kos_recordings`` exactly as transcribed;
4. written into the Obsidian vault (``vault_dir``) as a recording note with
   one line per segment, each with a timestamp block id (``^t0750`` = 12:30),
   and added to its session note.

Recordings that start within ``session_gap_minutes`` of the previous one's
end belong to the same session (a lecture recorded in parts). The session
note carries ``status: new`` until the Claude routine has processed it; a new
part sets it back to ``new``.

The vault path is a setting: change ``vault_dir`` in config.json and new notes
go there (links inside the vault are relative, so a moved vault keeps working).
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable

import requests

from .auth import AuthRequired, SupabaseAuth
from .sync import SyncError, SyncRejected

log = logging.getLogger(__name__)

CHUNK_SECONDS = 480
SETTLE_SECONDS = 60
AUDIO_SUFFIXES = {".mp3"}

# -- MP3 frames ----------------------------------------------------------------

_BITRATES = {
    # (version, layer) -> kbps table index 1..14
    (1, 3): [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    (2, 3): [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
_RATES = {1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000]}


@dataclass
class Frame:
    offset: int
    length: int
    seconds: float


def _id3_size(data: bytes) -> int:
    if data[:3] == b"ID3" and len(data) >= 10:
        size = (data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9]
        return 10 + size + (10 if data[5] & 0x10 else 0)
    return 0


def _frame_at(data: bytes, i: int) -> Frame | None:
    if i + 4 > len(data) or data[i] != 0xFF or (data[i + 1] & 0xE0) != 0xE0:
        return None
    b1, b2, b3 = data[i + 1], data[i + 2], data[i + 3]
    ver_bits = (b1 >> 3) & 3
    version = {3: 1, 2: 2, 0: 25}.get(ver_bits)
    if version is None or ((b1 >> 1) & 3) != 1:  # Layer III only
        return None
    br_idx, sr_idx = b2 >> 4, (b2 >> 2) & 3
    if br_idx in (0, 15) or sr_idx == 3:
        return None
    bitrate = _BITRATES[(1 if version == 1 else 2, 3)][br_idx - 1] * 1000
    rate = _RATES[version][sr_idx]
    padding = (b2 >> 1) & 1
    samples = 1152 if version == 1 else 576
    length = (samples // 8 * bitrate) // rate + padding
    if length < 4:
        return None
    return Frame(i, length, samples / rate)


def mp3_frames(data: bytes) -> list[Frame]:
    """Every audio frame in order (tags and junk between frames are skipped)."""
    frames: list[Frame] = []
    i = _id3_size(data)
    while i + 4 <= len(data):
        f = _frame_at(data, i)
        if f is None or f.offset + f.length > len(data) + 1:
            i += 1
            continue
        frames.append(f)
        i += f.length
    return frames


def mp3_duration(frames: list[Frame]) -> float:
    return sum(f.seconds for f in frames)


def mp3_chunks(data: bytes, frames: list[Frame], max_seconds: float = CHUNK_SECONDS) -> list[tuple[float, bytes]]:
    """(start offset in seconds, bytes) pieces cut at frame boundaries."""
    out: list[tuple[float, bytes]] = []
    start_t, t, first = 0.0, 0.0, 0
    for idx, f in enumerate(frames):
        if t - start_t >= max_seconds and idx > first:
            out.append((start_t, data[frames[first].offset:f.offset]))
            first, start_t = idx, t
        t += f.seconds
    if frames and first < len(frames):
        last = frames[-1]
        out.append((start_t, data[frames[first].offset:last.offset + last.length]))
    return out


# -- names, sessions, notes ---------------------------------------------------------

_BANDICAM = re.compile(r"(\d{4})-(\d{2})-(\d{2})[ _](\d{2})-(\d{2})-(\d{2})")


def recorded_at(path: Path, duration: float, mtime: float) -> datetime:
    """Start time: from Bandicam's file name, else the file's last write minus its length."""
    m = _BANDICAM.search(path.stem)
    if m:
        y, mo, d, h, mi, s = map(int, m.groups())
        return datetime(y, mo, d, h, mi, s)
    return datetime.fromtimestamp(mtime) - timedelta(seconds=duration)


@dataclass
class Known:
    """A recording already processed, as remembered in the state file."""
    sha256: str
    start: datetime
    end: datetime
    session: str
    part: int
    note: str


def assign_session(start: datetime, known: list[Known], gap_minutes: float) -> tuple[str, int]:
    """Join the session of the recording that ended within the gap before this one, else start a new one."""
    before = [k for k in known if k.end <= start + timedelta(seconds=5)]
    if before:
        prev = max(before, key=lambda k: k.end)
        if start - prev.end <= timedelta(minutes=gap_minutes):
            parts = [k.part for k in known if k.session == prev.session]
            return prev.session, max(parts) + 1
    return start.strftime("%Y-%m-%d %H-%M"), 1


def ts(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"


def recording_note(name: str, session: str, part: int, start: datetime, duration: float, path: Path,
                   sha256: str, model: str, language: str | None, recording_id: str | None,
                   segments: list[dict]) -> str:
    lines = [
        "---",
        "type: recording",
        f'session: "[[Sessions/{session}]]"',
        f"part: {part}",
        f"recorded_at: {start.isoformat(timespec='seconds')}",
        f"duration: {ts(duration)}",
        f"file: {json.dumps(str(path), ensure_ascii=False)}",
        f"sha256: {sha256}",
        f"model: {model}",
        f"language: {language or 'unknown'}",
        f"recording_id: {recording_id or ''}",
        "---",
        "",
        f"# {name}",
        "",
        "Raw transcript, exactly as transcribed. Do not edit: knowledge notes link to the timestamps below.",
        "",
    ]
    for s in segments:
        text = str(s.get("text", "")).strip()
        if text:
            lines.append(f"**[{ts(s['start'])}]** {text} ^t{int(s['start']):04d}")
            lines.append("")
    return "\n".join(lines)


PARTS_START, PARTS_END = "<!-- kos:parts -->", "<!-- /kos:parts -->"


def session_note(existing: str | None, session: str, parts: list[tuple[int, str]]) -> str:
    """The session note with its parts list rewritten and status set back to new; the rest is kept."""
    listing = "\n".join(f"- Part {p}: [[Recordings/{n}]]" for p, n in sorted(parts))
    block = f"{PARTS_START}\n{listing}\n{PARTS_END}"
    if not existing:
        return "\n".join([
            "---", "type: session", "status: new", f"started: {session}", f"parts: {len(parts)}", "---", "",
            f"# Session {session}", "", "## Recordings", block, "",
            "## Knowledge", "", "_The Claude routine fills this in and sets `status: processed`._", "",
        ])
    text = existing
    if PARTS_START in text and PARTS_END in text:
        a, b = text.index(PARTS_START), text.index(PARTS_END) + len(PARTS_END)
        text = text[:a] + block + text[b:]
    else:
        text = text.rstrip() + "\n\n## Recordings\n" + block + "\n"
    text = re.sub(r"(?m)^status:.*$", "status: new", text, count=1)
    text = re.sub(r"(?m)^parts:.*$", f"parts: {len(parts)}", text, count=1)
    return text


RULES = """# Processing rules for the Claude routine

You turn raw recordings into atomic, linked knowledge notes. **Everything you write is in English**
(quotes stay verbatim in the language they were spoken).

## What to process
Notes in `Sessions/` with `status: new` in their frontmatter. Read every part listed under
"Recordings" (the files in `Recordings/`). Never edit files in `Recordings/`: they are the raw source.

## What to create
Atomic notes in `Knowledge/`, one meaningful piece of knowledge per note (not a paragraph, not a summary).
Frontmatter:
```
type: concept | claim | principle | definition | model | example | observation | question | decision | contradiction | assumption
sources: ["[[Recordings/<note>#^t0750]]"]   # every unit cites the exact segment(s)
confidence: high | medium | low              # how firmly it was stated / how well supported
created: YYYY-MM-DD
```
Body: the statement in your own words (1-4 sentences), then a `> quote` copied verbatim from the transcript
with its link, then `Related:` with [[links]] to other Knowledge notes and the relation in words
(supports, refines, contradicts, example of, part of, depends on).

## Rules
1. **No quote, no note.** Every note must quote the transcript and link the segment (`#^tNNNN`).
2. **Search before creating.** Look for existing notes on the same idea. If it is the same, add the new
   source and quote to that note instead of creating a duplicate. If it is similar but different,
   create a separate note and link both, saying what the difference is. Never merge just because
   things sound alike.
3. **Contradictions:** do not resolve them. Create a `contradiction` note linking both sides with quotes.
4. **Uncertainty stays:** "I think", "maybe" -> `confidence: low` and say so.
5. **Do not summarise the recording.** In the session note, under "## Knowledge", list the notes you
   created or extended, one line each, then set `status: processed`.
6. **Continuations:** if the session clearly continues an earlier one (same lecture, same topic picked up
   again), add `continues: "[[Sessions/<earlier>]]"` to its frontmatter and link them; never merge files.
7. Concept hubs: when several notes share a concept, keep or create a `concept` note that links them
   (a map, not a merged text). Repetition from different recordings is evidence: keep every source.
"""

ROUTINE = """# Claude routine prompt

Paste this as the routine's instruction in Claude Desktop (with access to this vault folder):

> Open my Obsidian vault. Read `_SYSTEM/processing-rules.md` and follow it exactly.
> Process every note in `Sessions/` whose frontmatter has `status: new`, oldest first.
> When done, reply with a short list of what you created or extended.
"""


# -- the uploader ------------------------------------------------------------------


class KosClient:
    """Transcription through the Edge Function and storage in kos_recordings, with the tracker's login."""

    def __init__(self, supabase_url: str, anon_key: str, auth: SupabaseAuth, http: Any | None = None) -> None:
        base = supabase_url.rstrip("/")
        self.fn_url = f"{base}/functions/v1/kos-transcribe"
        self.table_url = f"{base}/rest/v1/kos_recordings"
        self.anon_key = anon_key
        self.auth = auth
        self.http = http or requests.Session()

    def _post(self, url: str, body: dict, extra: dict | None = None, timeout: float = 240) -> Any:
        for attempt in (1, 2):
            headers = {**self.auth.headers(), "Content-Type": "application/json", **(extra or {})}
            try:
                resp = self.http.post(url, headers=headers, json=body, timeout=timeout)
            except requests.RequestException as exc:
                raise SyncError(f"network error: {exc}") from exc
            if resp.status_code in (200, 201):
                return resp.json() if resp.text else None
            if resp.status_code == 401 and attempt == 1:
                self.auth.refresh()
                continue
            if resp.status_code == 401:
                raise AuthRequired("token rejected twice")
            if resp.status_code == 409:
                return None
            if resp.status_code != 429 and 400 <= resp.status_code < 500:
                raise SyncRejected(resp.status_code, resp.text)
            raise SyncError(f"HTTP {resp.status_code}: {resp.text[:300]}")
        return None  # pragma: no cover

    def transcribe(self, chunk: bytes) -> dict:
        return self._post(self.fn_url, {"audio": base64.b64encode(chunk).decode("ascii"), "format": "mp3"})

    def store(self, row: dict) -> str | None:
        got = self._post(f"{self.table_url}?select=id", {**row, "user_id": self.auth.user_id},
                         {"Prefer": "return=representation"}, timeout=60)
        return got[0]["id"] if isinstance(got, list) and got else None


def transcribe_file(client: KosClient, data: bytes) -> tuple[list[dict], str, str | None, float]:
    """Segments with offsets across all chunks, the model, a language, and the duration."""
    frames = mp3_frames(data)
    if not frames:
        raise ValueError("no MP3 audio frames found")
    segments: list[dict] = []
    model, language = "", None
    for offset, chunk in mp3_chunks(data, frames):
        res = client.transcribe(chunk)
        model = res.get("model") or model
        language = language or res.get("language")
        segs = res.get("segments") or []
        if not segs and res.get("text"):
            segs = [{"start": 0, "end": res.get("duration") or 0, "text": res["text"]}]
        for s in segs:
            segments.append({"start": round(offset + float(s["start"]), 2), "end": round(offset + float(s["end"]), 2),
                             "text": str(s["text"]).strip()})
    return segments, model, language, mp3_duration(frames)


@dataclass
class IntakeState:
    """What the PC has already processed (sha256 -> Known), kept in a JSON file in the data folder."""
    path: Path
    known: dict[str, Known] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path) -> "IntakeState":
        st = cls(path)
        try:
            for k in json.loads(path.read_text(encoding="utf-8")):
                st.known[k["sha256"]] = Known(k["sha256"], datetime.fromisoformat(k["start"]),
                                              datetime.fromisoformat(k["end"]), k["session"], k["part"], k["note"])
        except (OSError, ValueError, KeyError):
            pass
        return st

    def add(self, k: Known) -> None:
        self.known[k.sha256] = k
        data = [{"sha256": v.sha256, "start": v.start.isoformat(), "end": v.end.isoformat(),
                 "session": v.session, "part": v.part, "note": v.note} for v in self.known.values()]
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=1), encoding="utf-8")
        tmp.replace(self.path)


def ensure_system_notes(vault: Path) -> None:
    """The rules and the routine prompt, written once; the user may edit them afterwards."""
    sysdir = vault / "_SYSTEM"
    sysdir.mkdir(parents=True, exist_ok=True)
    for name, text in (("processing-rules.md", RULES), ("routine-prompt.md", ROUTINE)):
        p = sysdir / name
        if not p.exists():
            p.write_text(text, encoding="utf-8")


def process_file(path: Path, client: KosClient, state: IntakeState, vault: Path, gap_minutes: float) -> str:
    """One recording end to end; returns its note name. The audio file is only read."""
    data = path.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    if sha in state.known:
        return state.known[sha].note
    segments, model, language, duration = transcribe_file(client, data)
    start = recorded_at(path, duration, path.stat().st_mtime)
    session, part = assign_session(start, list(state.known.values()), gap_minutes)
    note = f"{start.strftime('%Y-%m-%d %H-%M-%S')} {path.stem}".replace("/", "-")
    rec_id = client.store({
        "sha256": sha, "file_name": path.name, "recorded_at": start.astimezone().isoformat(),
        "duration_seconds": round(duration, 2), "session_key": session, "part": part, "model": model,
        "language": language, "segments": segments, "raw_text": " ".join(s["text"] for s in segments),
    })
    ensure_system_notes(vault)
    (vault / "Recordings").mkdir(parents=True, exist_ok=True)
    (vault / "Sessions").mkdir(parents=True, exist_ok=True)
    (vault / "Recordings" / f"{note}.md").write_text(
        recording_note(note, session, part, start, duration, path, sha, model, language, rec_id, segments), encoding="utf-8")
    parts = [(k.part, k.note) for k in state.known.values() if k.session == session] + [(part, note)]
    snote = vault / "Sessions" / f"{session}.md"
    snote.write_text(session_note(snote.read_text(encoding="utf-8") if snote.exists() else None, session, parts),
                     encoding="utf-8")
    state.add(Known(sha, start, start + timedelta(seconds=duration), session, part, note))
    return note


class IntakeWorker(threading.Thread):  # pragma: no cover - thread wrapper around tested functions
    """Scans the folder every minute; processes files that stopped growing, oldest first."""

    def __init__(self, folder: Path, vault: Path, gap_minutes: float, client: KosClient, state: IntakeState,
                 notify: Callable[[str], None] | None = None, interval: float = 60) -> None:
        super().__init__(name="mf-recordings", daemon=True)
        self.folder, self.vault, self.gap = folder, vault, gap_minutes
        self.client, self.state, self.notify, self.interval = client, state, notify, interval
        self._sizes: dict[Path, int] = {}
        self._retry_after: dict[Path, float] = {}
        self._done: set[tuple[Path, int]] = set()
        self._stop = threading.Event()

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        import time
        while not self._stop.is_set():
            try:
                self.scan(time.time())
            except Exception:
                log.exception("recordings scan failed")
            self._stop.wait(self.interval)

    def scan(self, now: float) -> None:
        if not self.folder.is_dir() or not self.client.auth.user_id:
            return
        ready = []
        for p in self.folder.iterdir():
            if p.suffix.lower() not in AUDIO_SUFFIXES or not p.is_file():
                continue
            st = p.stat()
            stable = self._sizes.get(p) == st.st_size and now - st.st_mtime >= SETTLE_SECONDS
            self._sizes[p] = st.st_size
            if stable and now >= self._retry_after.get(p, 0) and not self._seen(p, st.st_size):
                ready.append((st.st_mtime, p))
        for _, p in sorted(ready):
            try:
                note = process_file(p, self.client, self.state, self.vault, self.gap)
                self._done.add((p, p.stat().st_size))
                log.info("Recording %s -> %s", p.name, note)
                if self.notify:
                    self.notify(f"Transcribed: {p.name}")
            except AuthRequired:
                return
            except Exception as exc:
                log.warning("Recording %s failed (%s); retrying in 10 min", p.name, exc)
                self._retry_after[p] = now + 600

    def _seen(self, p: Path, size: int) -> bool:
        return (p, size) in self._done
