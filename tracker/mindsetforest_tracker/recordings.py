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

The vault's own notes travel the other way: every minute ``VaultMirror``
copies the .md files under ``Knowledge/`` and ``Sessions/`` into
``kos_vault_files`` as plain text (changed files only, deleted files are
deleted), so the dashboard shows the knowledge notes and each session's status.

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
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote

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
   created or extended, one line each, add `topic: <3-8 words naming what was discussed>` to its
   frontmatter, then set `status: processed`.
6. **Continuations:** if the session clearly continues an earlier one (same lecture, same topic picked up
   again), add `continues: "[[Sessions/<earlier>]]"` to its frontmatter and link them; never merge files.
7. Concept hubs: when several notes share a concept, keep or create a `concept` note that links them
   (a map, not a merged text). Repetition from different recordings is evidence: keep every source.
"""

ROUTINE = """# Knowledge OS routine

<!-- The scheduled task in Claude Desktop only says: read this file and do what it says.
     Edit this file to change how runs work; the task itself never needs changing. -->

This folder is my Obsidian vault. Recordings arrive as raw transcripts; you turn them into atomic,
linked knowledge notes. Write everything in English; quotes stay verbatim in the language spoken.

You only write files here. Nothing has to be sent anywhere: the MindsetForest tracker on this PC
copies `Knowledge/` and `Sessions/` to my dashboard within a minute of any change.

## 0. Start
1. Read `_SYSTEM/processing-rules.md`: my standing rules for good notes. This file is the procedure.
   If the two disagree on note format, keep the format in step 4 (the dashboard reads it).
2. If `_SYSTEM/routine.lock` exists and holds a time less than 3 hours ago, another run is going:
   reply "Already running" and stop. Otherwise write the current date and time into it.
   Delete it when you finish, also when you stop early.

## 1. Pick the work
- Notes in `Sessions/` with `status: new` in their frontmatter, oldest first (by file name).
  At most 3 sessions per run; the rest wait for the next run.
- The parts are listed between `<!-- kos:parts -->` and `<!-- /kos:parts -->`. If the frontmatter has
  `processed_parts: [1, 2]`, only the other parts are new (a session reopens when a new part is
  recorded); read the processed parts only for context.
- Nothing new: do only step 5.

## 2. Read and extract
- Read the new parts in order as one continuous text. Each line is `**[hh:mm:ss]** text ^tNNNN`,
  where NNNN is that segment's start in seconds.
- Whisper mishears words. Fix obvious mistakes in your own wording, never inside a quote. If a key
  term stays unclear, say so and use `confidence: low`.
- List candidate units, one idea each: concept, claim, principle, definition, model, example,
  observation, question, decision, contradiction, assumption. Skip small talk, logistics, repeats that
  add nothing, and private talk about other people. An hour of lecture is usually 5-20 units, not 50.
- No knowledge in the session at all (silence, music, a phone call): set `status: skipped`, write one
  line why under "## Knowledge", add its parts to `processed_parts`, move on.

## 3. Search before writing
For each unit, search the whole vault except `Recordings/` and `_SYSTEM/` (titles and text, with
synonyms), then:
- **Same idea already in `Knowledge/`**: extend that note. Add the source to `sources`, add the quote,
  add one line on what the new recording adds. Change its statement only if it was wrong, and say so.
- **Similar but different**: a new note; link both ways, saying how they differ.
- **Conflicts with a note**: a `contradiction` note linking both sides, each with its quote. Do not
  decide who is right.
- **My own notes elsewhere in the vault**: link to them; never edit them.

## 4. Write
One file per unit in `Knowledge/` (subfolders are fine), exactly in this shape:

    ---
    type: principle
    sources: ["[[Recordings/<recording note name>#^t0750]]"]
    confidence: high
    created: YYYY-MM-DD
    ---
    # Reciprocity

    One to four sentences in your own words.

    > "Verbatim words from the transcript." ([[Recordings/<recording note name>#^t0750]])

    Related: supports [[Commitment]]; example of [[Influence]].

- File name = the title: short, unique, English, only letters, digits, spaces, hyphens, commas,
  apostrophes and parentheses.
- Every `^tNNNN` you cite must exist in that recording file: copy it from the line, never compute it.
- `sources` is a list of quoted strings and the frontmatter must stay valid YAML.
- When 3 or more notes share a concept, keep a `concept` hub note linking them, one line each on how
  it relates (a map, not merged text).
- A session that continues an earlier one (same course, same topic picked up again) gets
  `continues: "[[Sessions/<earlier session>]]"` in its frontmatter.

Then update the session note:
- under "## Knowledge" one line per note: `- [[Note]] (new)` or `- [[Note]] (extended)`;
- in the frontmatter: `topic: <3-8 words>`, `processed_parts: [<every part done>]`, `status: processed`.
Never change the `<!-- kos:parts -->` block or anything in `Recordings/`.

## 5. Gardening (every run, keep it short)
Only notes created or changed in the last 7 days:
- add missing links between them (same concept, cause and effect, example of, part of);
- a duplicate made by mistake (truly the same idea, not just similar): merge into one note keeping
  every source and quote, point links at the kept note, and move the other file to
  `_SYSTEM/merged/` with one line `Merged into [[Kept note]]`. Never delete files;
- an open `question` that a newer recording answers: link the answer and add
  `answered_by: "[[Answer note]]"` to the question's frontmatter.

## 6. Check, log, reply
- Check every file you wrote: the frontmatter parses, each cited `^tNNNN` exists in its recording, every
  `[[link]]` points to a note that exists, nothing in `Recordings/` changed. Fix what fails.
- Append to `_SYSTEM/routine-log.md`: date and time, sessions processed, notes new / extended,
  anything that went wrong.
- Reply briefly: sessions (topic), notes created and extended (names), contradictions found, and
  anything you were unsure about.
"""


# -- the uploader ------------------------------------------------------------------


class KosClient:
    """Transcription through the Edge Function and storage in kos_recordings, with the tracker's login."""

    def __init__(self, supabase_url: str, anon_key: str, auth: SupabaseAuth, http: Any | None = None) -> None:
        base = supabase_url.rstrip("/")
        self.fn_url = f"{base}/functions/v1/kos-transcribe"
        self.table_url = f"{base}/rest/v1/kos_recordings"
        self.vault_url = f"{base}/rest/v1/kos_vault_files"
        self.anon_key = anon_key
        self.auth = auth
        self.http = http or requests.Session()

    def _post(self, url: str, body: Any, extra: dict | None = None, timeout: float = 240) -> Any:
        return self._request("POST", url, body, extra, timeout)

    def _request(self, method: str, url: str, body: Any = None, extra: dict | None = None,
                 timeout: float = 240) -> Any:
        for attempt in (1, 2):
            headers = {**self.auth.headers(), "Content-Type": "application/json", **(extra or {})}
            try:
                resp = self.http.request(method, url, headers=headers, json=body, timeout=timeout)
            except requests.RequestException as exc:
                raise SyncError(f"network error: {exc}") from exc
            if resp.status_code in (200, 201, 204):
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

    def list_vault_files(self) -> dict[str, tuple[str, str]]:
        """What the server holds of the vault: path -> (sha256, vault name)."""
        out: dict[str, tuple[str, str]] = {}
        offset, page = 0, 1000
        while True:
            rows = self._request("GET", f"{self.vault_url}?select=path,sha256,vault&order=path&limit={page}"
                                        f"&offset={offset}", timeout=60) or []
            for r in rows:
                out[r["path"]] = (r["sha256"], r["vault"])
            if len(rows) < page:
                return out
            offset += page

    def upsert_vault_files(self, rows: list[dict]) -> None:
        self._post(f"{self.vault_url}?on_conflict=user_id,path",
                   [{**r, "user_id": self.auth.user_id} for r in rows],
                   {"Prefer": "resolution=merge-duplicates,return=minimal"}, timeout=60)

    def delete_vault_file(self, path: str) -> None:
        self._request("DELETE", f"{self.vault_url}?path=eq.{quote(path, safe='')}", timeout=60)


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
        "sha256": sha, "file_name": path.name, "note_name": note, "recorded_at": start.astimezone().isoformat(),
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


# -- the vault mirror ---------------------------------------------------------------

MIRROR_FOLDERS = ("Knowledge", "Sessions")
MAX_NOTE_BYTES = 256_000
RELOAD_SECONDS = 3600


def vault_notes(vault: Path) -> dict[str, Path]:
    """The notes the dashboard shows: every .md under Knowledge/ and Sessions/, by vault-relative path."""
    out: dict[str, Path] = {}
    for folder in MIRROR_FOLDERS:
        base = vault / folder
        if not base.is_dir():
            continue
        for p in base.rglob("*.md"):
            rel = p.relative_to(vault)
            if p.is_file() and not any(part.startswith(".") for part in rel.parts):
                out[rel.as_posix()] = p
    return out


class VaultMirror:
    """Keeps kos_vault_files equal to the vault's Knowledge/ and Sessions/ notes, one way: vault -> database.

    The server's list (path -> sha256) is the state, read at start and again every hour, so
    nothing is kept on disk and a lost row is sent again. A file is hashed only when its size
    or modification time changed. A vault folder that is missing (a drive not mounted yet)
    changes nothing on the server.
    """

    def __init__(self, vault: Path, client: KosClient) -> None:
        self.vault, self.client = vault, client
        self.remote: dict[str, tuple[str, str]] | None = None
        self._loaded_at = 0.0
        self._hashes: dict[str, tuple[tuple[int, int], str]] = {}
        self._refused: dict[str, str] = {}

    def sync(self, now: float) -> tuple[int, int]:
        """(files sent, files deleted)."""
        if not self.vault.is_dir():
            return 0, 0
        if self.remote is None or now - self._loaded_at >= RELOAD_SECONDS:
            self.remote = self.client.list_vault_files()
            self._loaded_at = now
        name = self.vault.name
        changed: list[dict] = []
        local: set[str] = set()
        for rel, p in vault_notes(self.vault).items():
            try:
                st = p.stat()
                if st.st_size > MAX_NOTE_BYTES:
                    continue
                key = (st.st_mtime_ns, st.st_size)
                cached = self._hashes.get(rel)
                data = None
                if cached is None or cached[0] != key:
                    data = p.read_bytes()
                    self._hashes[rel] = (key, hashlib.sha256(data).hexdigest())
                sha = self._hashes[rel][1]
                local.add(rel)
                if self.remote.get(rel) == (sha, name) or self._refused.get(rel) == sha:
                    continue
                if data is None:
                    data = p.read_bytes()
                    sha = hashlib.sha256(data).hexdigest()
                text = data.decode("utf-8", errors="replace").lstrip("\ufeff").replace("\x00", "")
                changed.append({"vault": name, "path": rel, "content": text, "sha256": sha,
                                "modified_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()})
            except OSError:
                continue
        for i in range(0, len(changed), 50):
            self._send(changed[i:i + 50])
        gone = [rel for rel in self.remote if rel not in local]
        for rel in gone:
            self.client.delete_vault_file(rel)
            del self.remote[rel]
        return len(changed), len(gone)

    def _send(self, rows: list[dict]) -> None:
        try:
            self.client.upsert_vault_files(rows)
        except SyncRejected:
            if len(rows) > 1:  # one bad note must not hold back the rest
                for r in rows:
                    self._send([r])
                return
            log.warning("Vault note %s refused by the server; skipped until it changes", rows[0]["path"])
            self._refused[rows[0]["path"]] = rows[0]["sha256"]
            return
        for r in rows:
            self.remote[r["path"]] = (r["sha256"], r["vault"])  # type: ignore[index]


class IntakeWorker(threading.Thread):  # pragma: no cover - thread wrapper around tested functions
    """Every minute: transcribes recordings that stopped growing (oldest first), then mirrors the vault."""

    def __init__(self, folder: Path | None, vault: Path, gap_minutes: float, client: KosClient, state: IntakeState,
                 notify: Callable[[str], None] | None = None, interval: float = 60,
                 mirror: VaultMirror | None = None) -> None:
        super().__init__(name="mf-recordings", daemon=True)
        self.folder, self.vault, self.gap = folder, vault, gap_minutes
        self.client, self.state, self.notify, self.interval = client, state, notify, interval
        self.mirror = mirror
        self._sizes: dict[Path, int] = {}
        self._retry_after: dict[Path, float] = {}
        self._done: set[tuple[Path, int]] = set()
        self._stop = threading.Event()

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        while not self._stop.is_set():
            try:
                self.scan(time.time())
            except Exception:
                log.exception("recordings scan failed")
            try:
                self.mirror_vault(time.time())
            except AuthRequired:
                pass
            except SyncError as exc:
                log.warning("Vault mirror: %s", exc)
            except Exception:
                log.exception("vault mirror failed")
            self._stop.wait(self.interval)

    def mirror_vault(self, now: float) -> None:
        if self.mirror is None or not self.client.auth.user_id:
            return
        sent, deleted = self.mirror.sync(now)
        if sent or deleted:
            log.info("Vault mirror: %d note(s) sent, %d deleted", sent, deleted)

    def scan(self, now: float) -> None:
        if self.folder is None or not self.folder.is_dir() or not self.client.auth.user_id:
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
