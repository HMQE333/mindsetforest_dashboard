"""Knowledge OS intake: recordings in a folder become raw transcripts and Obsidian notes.

Every minute the tracker looks at ``recordings_dir`` (Bandicam's folder by
default) and its subfolders up to ``MAX_DEPTH`` levels down (Bandicam can file
audio under "Audios" or a date folder). When the folder was chosen with "only
new recordings", files older than ``recordings_since`` are left alone. A new
MP3 that has stopped growing is:

1. hashed (the original is only ever read, never moved or changed);
2. cut into chunks of a few minutes at MP3 frame boundaries and sent to the
   ``kos-transcribe`` Edge Function (Whisper large-v3-turbo, segment
   timestamps); the chunks' segments are joined with their offsets;
3. stored in ``kos_recordings`` exactly as transcribed;
4. written into the Obsidian vault (``vault_dir``) as a recording note with
   one line per segment, each with a timestamp block id (``^t0750`` = 12:30),
   and added to its session note.

Transcripts downloaded by hand (a lecture platform, a course, YouTube
captions) come in through ``<vault>/Import/`` instead; ``imports.py`` turns
them into the same kind of session.

The vault's own notes travel the other way: every minute ``VaultMirror``
copies the .md files under ``Lectures/``, ``Knowledge/`` and ``Sessions/``,
plus ``_SYSTEM/routine-log.md``, into ``kos_vault_files`` as plain text
(changed files only, deleted files are deleted), so the dashboard shows the
lecture summaries, the knowledge notes, each session's status and the
routine's last run.

The Claude routine's instructions live in the vault (``_SYSTEM/``), written
by ``ensure_system_notes``: an older tracker's text is upgraded to the
current format, and a copy the user edited is saved beside it first. Beside
them, ``write_study_prompts`` keeps a copy of the study prompts the user set
in the dashboard (how to teach them, the primer for course textbooks).

Recordings that start within ``session_gap_minutes`` of the previous one's
end belong to the same session (a lecture recorded in parts). The session
note carries ``status: new`` until the Claude routine has processed it; a new
part sets it back to ``new``.

The vault path is a setting: change ``vault_dir`` in config.json and new notes
go there (links inside the vault are relative, so a moved vault keeps working).

Without the routine nothing turns transcripts into knowledge notes, and the
user may not notice, so a session left at ``status: new`` for more than a day
brings a reminder notification (at most once a day).

The state file (``recordings.json``) remembers every processed recording by
its sha256 and also each file's path, size and modification time, so after a
restart a known file is recognised without being read again and only a fresh
transcription brings a "Transcribed" notification.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterator, Protocol
from urllib.parse import quote

import requests

from . import __version__
from .auth import AuthRequired, SupabaseAuth
from .sync import SyncError, SyncRejected

log = logging.getLogger(__name__)

CHUNK_SECONDS = 480
SETTLE_SECONDS = 60
AUDIO_SUFFIXES = {".mp3"}
STALE_SESSION_SECONDS = 24 * 3600
REMINDER_SECONDS = 24 * 3600  # at most one routine reminder a day
REMINDER_CHECK_SECONDS = 3600  # how often the Sessions/ folder is looked at for it
REMINDER_START_DELAY = 300  # the tray icon must exist before a reminder can be shown
MAX_DEPTH = 3  # subfolder levels below recordings_dir that are scanned

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


# -- the routine's instructions, kept in the vault ---------------------------------

# The routine writes vault format 2: one summary per session in Lectures/, atomic notes in the source's
# language. The marker below tells a copy of this text (edited or not) from an older tracker's text.
FORMAT_VERSION = 2
FORMAT_MARKER = re.compile(r"kos-format:\s*(\d+)")

RULES = r"""# Processing rules for the Claude routine
<!-- kos-format: 2. The procedure and the exact formats are in _SYSTEM/routine-prompt.md; this file holds
     my standing rules. Edit it freely: the MindsetForest tracker never overwrites an edited copy. -->

If you were sent to this file first, read `_SYSTEM/routine-prompt.md` and follow it: that is the procedure.

## What I want
- For every lecture, course part or long video: **one summary** in `Lectures/<Course>/` that I read instead
  of re-listening, and a few atomic notes in `Knowledge/` that link what I learn across lectures.
- **One note, one language: the language of the source.** A Polish lecture gives Polish notes, titles and
  headings included; an English course gives English ones. The other language appears only in the folded
  glossary and in `aliases`.

## Rules
1. **The source is the truth.** A summary follows what was said, in that order. Anything you add yourself
   goes only into a folded "Dla zrozumienia (AI)" / "For understanding (AI)" callout, at most 2 per section.
2. **No quote, no note.** Every atomic note quotes the transcript verbatim and links its exact anchor
   (`#^tNNNN` or `#^pNNNN`), copied from the line, never computed.
3. **Search before creating.** Same idea, same language: extend that note instead of writing a duplicate.
   Similar but different: a separate note, linked both ways, saying how they differ. Never merge just
   because things sound alike.
4. **Contradictions:** do not resolve them. A `contradiction` note links both sides with their quotes; in
   the summary they go under "Do wyjaśnienia" / "To clarify".
5. **Uncertainty stays:** "chyba", "maybe" -> `confidence: low`, and say so.
6. **What the lecturer stressed is never compressed away:** repeated points, "to ważne", anything about the
   exam or a test.
7. **Few notes, well linked:** at most 15 new notes per hour of real lecture and at most 5 for a source
   under 15 minutes. Never write a `[[link]]` to a note that does not exist.
8. **The institution's summary only cross-checks.** It never replaces the transcript as a source.
9. **Never delete, never edit sources.** `Recordings/` and `Import/` stay as they are; a retired note moves
   to `_SYSTEM/merged/`.
10. **Continuations:** a session that picks up an earlier one gets `continues:`; files are never merged.
11. **Concept hubs:** when 3 or more notes share a concept, keep a `concept` note linking them (a map, not
    merged text). Repetition across lectures is evidence: keep every source.

## My own rules
(Add yours here.)
"""

ROUTINE = r"""# Knowledge OS routine
<!-- kos-format: 2. The scheduled task in Claude Desktop only says: read this file and do what it says.
     Edit this file to change how runs work; the task itself never changes. The MindsetForest tracker
     never overwrites an edited copy; an unedited one follows the tracker's newer default. -->

This folder is my Obsidian vault. I am a student. Lectures, online courses and long videos arrive here as
raw transcripts. For each one you write **one lecture summary**, which I read instead of re-listening, and
a few **atomic notes** in `Knowledge/`, which link what I learn across lectures in Obsidian's graph. Once a
course has a few lectures, you also keep its **textbook**: the whole course as one compact model (step 6).

You only write files here; nothing has to be sent anywhere. The MindsetForest tracker on this PC copies
`Lectures/`, `Knowledge/`, `Sessions/` and `_SYSTEM/routine-log.md` to my dashboard within a minute.

## The four rules that matter most
1. **One note, one language: the language of the source.** A Polish lecture gives a Polish summary and
   Polish notes, titles and headings included. An English course gives English ones. Never mix languages
   inside a text. The other language appears only in the folded glossary and in `aliases`.
2. **Follow what was said.** A summary is the lecture compressed, in its order, not your own essay on the
   topic. Anything that was not in the source goes only into a folded "Dla zrozumienia (AI)" callout.
3. **Cite exactly.** Every anchor (`^tNNNN`, `^pNNNN`) is copied from its line in the transcript, never
   computed or guessed. Every quote is verbatim.
4. **Never delete, never edit sources.** Change nothing in `Recordings/` or `Import/`. A note you retire
   moves to `_SYSTEM/merged/`.

## 0. Start
1. Read `_SYSTEM/processing-rules.md`: my standing rules. If it disagrees with this file on a format, this
   file wins (the dashboard reads these formats).
2. If `_SYSTEM/routine.lock` exists and holds a time less than 3 hours ago, another run is going: reply
   "Already running" and stop. Otherwise write the current date and time into it. Delete it when you
   finish, also when you stop early or something fails.

## 1. Pick the work
- Notes in `Sessions/` whose frontmatter has `status: new`, oldest first (by file name). At most 2
  sessions per run: a long lecture is a lot of reading and quality comes first. The rest wait.
- The parts are listed between `<!-- kos:parts -->` and `<!-- /kos:parts -->`. If the frontmatter has
  `processed_parts: [1, 2]`, only the other parts are new (a session reopens when a new part arrives):
  read the processed parts for context and **update** the session's existing summary, never write a
  second one. If every part is already in `processed_parts`, I set `status: new` back by hand because I
  want the session redone: treat all parts as new.
- `source: import` (or `youtube`) in the session note: the transcript comes from a file I downloaded (the
  university's platform, a course, YouTube captions). Its "## Imported with it" list may name:
  - **the institution's summary** (`... (podsumowanie uczelni)`): the platform's own AI summary. Use it only
    to check that you missed nothing important. **The transcript is the truth**: never take a statement
    from the institution's summary that the transcript does not support, and never cite it. If it
    mentions something the transcript lacks, say so under "Do wyjaśnienia".
  - **materials** (`... (materiały)`): slides or handouts. Use them to spell names, terms and formulas
    correctly and to follow the structure. Something that is only on a slide was not "said".
  - "No transcript came with it": the parts are the institution's summary or the materials. Write the
    summary from them all the same, and say under "Do wyjaśnienia" that there was no transcript.
- Nothing new: do only steps 6, 7 and 8.

## 2. Read
- Read the new parts in order as one text. A transcript line is either `**[hh:mm:ss]** text ^tNNNN`
  (NNNN = the segment's start in seconds) or, for a file without times, `**[¶N]** text ^pNNNN`
  (paragraph N).
- The language is the language the transcript is spoken in: `pl` or `en`. Not the language of the
  institution's summary, not the language of older notes.
- Speech recognition mishears words. Fix obvious mistakes in your own wording (the materials and the
  context help), never inside a quote. A key term that stays unclear goes under "Do wyjaśnienia".
- The course: an existing folder in `Lectures/` when it is the same course (same subject, same lecturer,
  a continuation); else from the session's `original_name`, the file name or what is said ("na
  dzisiejszych zajęciach z logiki"); else `Inne` (pl) / `Other` (en). Short, in the note's language, the
  same spelling every time.
- No knowledge at all (silence, music, a private call): set `status: skipped`, write one line why under
  "## Knowledge", add its parts to `processed_parts`, and move on.

## 3. Write the lecture summary
One file per session: `Lectures/<Course>/<YYYY-MM-DD> <Topic>.md`. The date is the session's (the start of
`started`); the topic is 3-8 words in the note's language. File and folder names use only letters,
digits, spaces, hyphens, commas and parentheses. First search `Lectures/` for a summary whose `sessions`
already lists this session: if there is one, update that file instead of creating another.

The frontmatter, exactly these fields:

    ---
    type: lecture-summary
    course: "Logika"
    topic: "Zdania logiczne i zbiory"
    date: 2026-10-11
    language: pl
    sessions: ["[[Sessions/2026-10-11 13-32]]"]
    source: recording
    ---

- `language`: `pl` or `en`, the language of the whole note.
- `sessions`: every session this summary covers, as quoted links.
- `source`: `recording` when the session note has no `source`; otherwise the session note's `source`
  (`import` or `youtube`).

The body, in this order. Polish headings are shown; an English note uses the English ones in brackets.
1. `## W skrócie` [`## In short`]: 3-5 sentences: what the lecture was about and what to take from it.
2. `## Mapa wykładu` [`## Lecture map`]: the map comes before the details. One `mermaid` block, not in a
   callout: a `flowchart` of the lecture's main parts (usually the numbered sections below) and how they
   lead into or depend on each other, or a `mindmap` when they are branches of one topic. At most 15
   nodes, short labels in the note's language. In a flowchart, node ids are plain letters and labels are
   quoted (`ZL["Zdanie logiczne"]`), a label on an arrow is `A -->|odpowiada| B`; in a mindmap the
   indentation sets the levels under `root((Logika))`. Under the block at most 2 lines: what ties the
   parts together.
3. Numbered topic sections in lecture order: `## 1. <section>`. End each heading with a link to the
   moment it starts: `[[Recordings/<note>#^t0754|12:34]]` (the label is that anchor as m:ss or h:mm:ss) or,
   without times, `[[Recordings/<note>#^p0012|¶12]]`. The body is what was said, compressed but faithful:
   definitions as given, the lecturer's reasoning, examples and formulas. Short paragraphs, lists, a table
   where the lecturer built one. Usually 3-8 sections for an hour.
4. `## Na co prowadzący kładł nacisk` [`## What the lecturer stressed`]: one bullet per point the lecturer
   repeated, called important ("to ważne", "proszę zapamiętać") or tied to the exam or a test ("będzie na
   egzaminie", "na kolokwium"), plus dates and requirements given. Each bullet ends with its anchor link.
   Never drop or merge these: this is what I revise from.
5. `## Do wyjaśnienia` [`## To clarify`]: unclear audio, terms you could not make out, contradictions
   (also with the institution's summary), what I should check. "Brak." [`None.`] when there is nothing.
6. `## Pojęcia` [`## Concepts`]: one `[[link]]` per line to the Knowledge notes of this lecture, only notes
   that exist or that you write in this run.
7. `> [!important]- Do zapamiętania` [`> [!important]- To memorise`], right after the concept links: only
   what cannot be worked out from understanding the lecture and has to be learnt as it is: names, symbols
   and notation, constants, dates, definitions to know word for word, classifications and lists the
   lecturer gave. One line each, ending with its anchor link. Whatever follows from the reasoning does not
   belong here. Leave the callout out when nothing qualifies.
8. The glossary, last: `> [!note]- Słowniczek PL ↔ EN` [`> [!note]- Glossary EN ↔ PL`], one line per key
   term: `> - **term in the note's language**: term in the other language`. The only place the other
   language appears in a summary.

Callouts use Obsidian's syntax, folded by default (`-` right after the type); every line inside starts
with `> `:
- `> [!example]- Przykład` [`> [!example]- Example`]: an example from the source, worked as it was given.
- `> [!tip]- Dla zrozumienia (AI)` [`> [!tip]- For understanding (AI)`]: the **only** place for anything
  that was not in the source: background, an intuition, a simpler example, a common mistake. At most 2 per
  section; plain, correct and short (2-5 sentences). Never put the lecture's own content here, and never
  put your own additions anywhere else.
- `> [!abstract]- Wizualizacja` [`> [!abstract]- Visualisation`]: one diagram or plot, only when a picture
  explains better than words: the shape of a function, a relation between sets, a process, a hierarchy.
  Most lectures need 0-2 in total (the lecture map apart).

Math is LaTeX: `$...$` inline, `$$...$$` on lines of its own, standard commands only (it is rendered with
KaTeX).

A visualisation callout holds exactly one of these blocks (inside the callout, so every line starts with
`> `):
- a `mermaid` block (`flowchart`, `sequenceDiagram`, `classDiagram`, `stateDiagram-v2`, `mindmap`,
  `timeline`); put labels with special characters in quotes: `A["x ∈ A"]`;
- a `plot` block, one JSON object (it may span lines):

      ```plot
      {"title": "sin i cos", "x": [-6.28, 6.28], "y": [-1.5, 1.5],
       "functions": [{"expr": "sin(x)", "label": "sin x"}, {"expr": "cos(x)"}],
       "points": [{"x": 0, "y": 0, "label": "0"}]}
      ```

  `x` is the [min, max] of the horizontal axis, `y` (optional) of the vertical one; `functions` is a list
  of `{"expr": ..., "label": ...}` (label optional); `points` is optional.
- a `plot3d` block, one JSON object **per line**: a surface, points, vectors:

      ```plot3d
      {"title": "Siodło", "kind": "surface", "expr": "x^2 - y^2", "x": [-2, 2], "y": [-2, 2]}
      {"kind": "points", "points": [{"x": 1, "y": 2, "z": 3, "label": "A"}]}
      {"kind": "vectors", "vectors": [{"from": [0,0,0], "to": [1,2,3], "label": "v"}]}
      ```

The JSON is strict: double quotes, no comments, no trailing commas, numbers as numbers. An expression uses
only numbers, `x`, `y`, `pi`, `e`, `+ - * / ^`, parentheses, unary minus and the functions `sin cos tan
asin acos atan sqrt abs exp ln log floor ceil`. Write every multiplication (`2*x`, not `2x`) and powers
with `^` (`x^2`, not `x²`). Titles and labels are in the note's language.

## 4. Atomic notes in Knowledge/
The summary is what I read; atomic notes are what links lectures together. Write few, good ones.
- **Limit:** at most 15 new notes per hour of real lecture and at most 5 for a source under 15 minutes.
  Without times, count about 150 words as one minute. Small talk, logistics and repetition give none.
- **Search first,** in the whole vault except `Recordings/`, `Import/` and `_SYSTEM/`: titles, `aliases`
  and text, in both languages.
  - Same idea, note in the same language: extend it. Add the source to `sources`, add the quote, add one
    line on what this lecture adds. Change its statement only if it was wrong, and say so.
  - Same idea, note in the other language: do not mix languages inside it. Write the note in this language,
    with the other note's term in `aliases`, and link the two.
  - Similar but different: a new note; link both ways, saying how they differ.
  - In conflict with a note: a `contradiction` note linking both sides, each with its quote. Do not decide
    who is right.
  - My own notes elsewhere in the vault: link to them, never edit them.
- Older notes may have English titles for Polish lectures: leave them as they are and do not rename them
  (links point at them).

One file per note, exactly in this shape (for an English lecture, the same with English words):

    ---
    type: definition
    course: "Logika"
    aliases: ["proposition"]
    sources: ["[[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t0754]]"]
    confidence: high
    created: 2026-10-11
    ---
    # Zdanie logiczne

    Jedno do czterech zdań własnymi słowami, w języku źródła.

    > "Zdanie logiczne to zdanie oznajmujące, o którym możemy powiedzieć, czy jest prawdziwe, czy fałszywe." ([[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t0754]])

    Powiązane: część [[Spójniki logiczne]]; przykład: [[Tabela prawdy]].

- `type` is one of: concept, claim, principle, definition, model, example, observation, question,
  decision, contradiction, assumption. Frontmatter keys and `type` values stay in English: the dashboard
  reads them.
- `aliases`: the term in the other language (and common synonyms). `course`: as in the summary.
- The file name is the title, in the note's language: short, unique, only letters, digits, spaces,
  hyphens, commas, apostrophes and parentheses.
- No quote, no note: every note quotes the transcript verbatim with its anchor link. Uncertainty stays
  ("chyba", "maybe" -> `confidence: low`, and say so).
- `sources` is a list of quoted strings; the frontmatter must stay valid YAML.
- The last line names the relation in the note's language: `Powiązane:` (wspiera, doprecyzowuje,
  przeczy, przykład, część, zależy od) / `Related:` (supports, refines, contradicts, example of, part of,
  depends on).
- When 3 or more notes share a concept, keep a `concept` hub note linking them, one line each on how it
  relates (a map, not merged text).
- Never write a `[[link]]` to a note that does not exist and that you are not writing in this run.

## 5. Update the session note
- Under "## Knowledge", one line per file: `- [[Lectures/<Course>/<YYYY-MM-DD> <Topic>]] (summary)`, then
  `- [[Note]] (new)` or `- [[Note]] (extended)`.
- In the frontmatter: `topic: <3-8 words, the note's language>`, `course: "<Course>"`,
  `summary: "[[Lectures/<Course>/<YYYY-MM-DD> <Topic>]]"`, `processed_parts: [<every part done>]`.
- A session that continues an earlier one (same course, same topic picked up again) also gets
  `continues: "[[Sessions/<earlier session>]]"`.
- Set `status: processed` last, after every other file is written, so a run that stops halfway is redone
  next time, not lost (search first and you will update, not duplicate).
- Never change the `<!-- kos:parts -->` block, the "## Imported with it" list or anything in `Recordings/`.

## 6. The course textbook (at most one per run)
A textbook turns a course's lectures into one compact model I can learn from: the map first, then the
mechanisms that produce the rest, then what is left to memorise. It sits beside the summaries:
`Lectures/<Course>/_Podręcznik.md` (an English course: `Lectures/<Course>/_Textbook.md`). It is rewritten
as a whole each time; my own notes on a course live in other files.

- **Which course.** One whose folder in `Lectures/` holds at least 2 summaries (`type: lecture-summary`)
  and no textbook yet, or whose textbook's `summaries` does not list every summary in the folder. Never
  `Inne` / `Other`: that is not a course. When several qualify, take the one with the newest summary. If
  this run already wrote 2 summaries, leave the textbook for the next run. None qualifies: skip this step.
- **What it is built from.** Only that course's summaries and the Knowledge notes they list under
  "Pojęcia" / "Concepts". Not the transcripts and not your general knowledge: what the material lacks
  goes only into a folded "Dla zrozumienia (AI)" callout, as in a summary. The structure is your work:
  the map, which mechanisms produce the rest, what can be derived, the compression and the questions.
  Show where a part comes from with a link to its summary, labelled with its date:
  `([[Lectures/Logika/2026-10-11 Zdania logiczne i zbiory|2026-10-11]])`.
- **How.** If `_SYSTEM/primer-prompt.md` exists, it is my own prompt for a primer: follow its approach
  and priorities, with [SUBJECT] = the course, my level = a student taking this course, my purpose =
  understanding the course and passing its exam. Its parts go into the sections below; its length, its
  tutor mode and anything that needs material beyond the course's notes do not apply here. Without that
  file, write the sections below as described.
- **Language and length.** The course's language (that of its summaries), and one language only, as in a
  summary. About 2500-5000 words; shorter while the course has little material: never pad.

The frontmatter, exactly these fields:

    ---
    type: course-textbook
    course: "Logika"
    language: pl
    updated: 2026-10-15
    summaries: ["[[Lectures/Logika/2026-10-11 Zdania logiczne i zbiory]]", "[[Lectures/Logika/2026-10-18 Kwantyfikatory]]"]
    ---

`updated` is today; `summaries` lists every summary it was built from, oldest first, as quoted links.

The body, in this order (English headings in brackets):
1. `## W skrócie` [`## In short`]: 3-5 sentences: what the course is about so far and the thread through
   its lectures.
2. `## Mapa przedmiotu` [`## Course map`]: one `mermaid` block, not in a callout, at most 20 nodes: the
   parts of the subject and how they connect. Then a few lines: what problem the subject deals with, what
   exists in it, what changes, what acts on what, and which lecture covers which part.
3. `## Mechanizmy` [`## Mechanisms`]: the 5-10 mechanisms or principles that produce most of the rest. For
   each: what goes in, what happens, what comes out, what it explains and where it stops working. Show
   how things relate before you name them. Examples from the lectures in folded "Przykład" callouts, a
   diagram or plot in a folded "Wizualizacja" callout where a picture helps.
4. `## Ograniczenia` [`## Constraints`]: what the subject rules out, and what follows from that even
   without details.
5. `## Co zapamiętać, a co wyprowadzić` [`## Memorise or derive`]: four short lists: `### Wynika z modelu`
   [`### Follows from the model`], `### Łatwo odtworzyć` [`### Easy to reconstruct`], `### Do zapamiętania`
   [`### To memorise`] (names, symbols, constants, dates, definitions word for word, classifications; the
   summaries' "Do zapamiętania" callouts are a start) and `### Na razie pomiń` [`### Skip for now`].
6. `## Cały przedmiot na jednej stronie` [`## The course on one page`]: the compression: the 5 most
   important ideas, the key mechanisms, the constraints and the exceptions: the page to keep if I keep one.
7. `## Pytania sprawdzające` [`## Diagnostic questions`]: 8-12 numbered questions that test whether I can
   use the model, not recall words: what happens if X changes, which mechanism produces Y, why it is not
   done another way, where the model fails. Questions only here, at the end: none in the sections above.

Math, callouts, `mermaid`, `plot` and `plot3d` follow the same rules as in a summary. Link only summaries
and Knowledge notes that exist; no time anchors (those belong to the summaries).

## 7. Gardening (every run, keep it short)
Only notes created or changed in the last 7 days:
- add missing links between them (same concept, cause and effect, example of, part of);
- a duplicate made by mistake (truly the same idea, not just similar): merge into one note keeping every
  source and quote, point links at the kept note, and move the other file to `_SYSTEM/merged/` with one
  line `Merged into [[Kept note]]`. Never delete files;
- an open `question` that a newer lecture answers: link the answer and add `answered_by: "[[Answer note]]"`
  to the question's frontmatter.
Older summaries in `Sessions/Summary *.md` stay where they are.

## 8. Check, log, reply
Check every file you wrote or changed, and fix what fails:
- the frontmatter parses as YAML and has every field above;
- every `^tNNNN` / `^pNNNN` you cite exists in that transcript file, and every quote is verbatim;
- every `[[link]]` points to a note that exists;
- each `plot` block is one valid JSON object, each line of a `plot3d` block is one, and expressions use
  only the allowed names; each mermaid block is valid, and a lecture map has at most 15 nodes;
- "Do zapamiętania" holds only what has to be learnt as it is, not what follows from the lecture;
- a textbook's `summaries` lists every summary in its course folder, and its questions come only at the
  end;
- every callout is folded (`-`), and your own additions are only in "Dla zrozumienia (AI)" / "For
  understanding (AI)";
- each note is in one language (the glossary and `aliases` apart);
- nothing in `Recordings/` or `Import/` changed and nothing was deleted.

Then `_SYSTEM/routine-log.md` (create it if it is missing; never remove lines from it):
- every run, also one with nothing to do: set `last_run: YYYY-MM-DD HH:MM` (local time) in its frontmatter;
  add the frontmatter at the very top if the file has none;
- a run that processed or skipped a session, wrote a textbook, or hit a problem: append one entry at the
  end, exactly:

      ## 2026-10-11 15:05
      - sessions: 2026-10-11 13-32 (Logika: Zdania logiczne i zbiory)
      - summaries: 1 new, 0 updated
      - notes: 6 new, 2 extended
      - textbook: none
      - problems: none

  `sessions:` is `none` in a run that only wrote a textbook. `textbook:` names the course whose textbook
  you wrote, with `(new)` or `(updated)`, else `none`. `problems:` names anything that went wrong or that
  you were unsure about, else `none`.

Reply briefly: the sessions (course: topic), the summaries, notes and textbook written, contradictions
found, and anything you were unsure about. Finally delete `_SYSTEM/routine.lock`.

## Worked example: a complete summary of a Polish lecture
The file `Lectures/Logika/2026-10-11 Zdania logiczne i zbiory.md`, written from the session
`Sessions/2026-10-11 13-32.md` with one part, `Recordings/2026-10-11 13-32-05 Logika wykład 2.md`:

````markdown
---
type: lecture-summary
course: "Logika"
topic: "Zdania logiczne i zbiory"
date: 2026-10-11
language: pl
sessions: ["[[Sessions/2026-10-11 13-32]]"]
source: recording
---
## W skrócie
Wykład wprowadził zdanie logiczne i pięć spójników, z których buduje się zdania złożone. Prowadzący omówił tabele prawdy, najdłużej implikację. Potem przeszedł do zbiorów i pokazał, że działania na zbiorach odpowiadają spójnikom. Na koniec omówił funkcję zdaniową i jej zbiór spełnienia.

## Mapa wykładu
```mermaid
flowchart LR
  ZL["Zdanie logiczne"] --> SP["Spójniki i tabele prawdy"]
  ZL --> FZ["Funkcja zdaniowa"]
  ZB["Zbiory"] --> DZ["Działania na zbiorach"]
  SP -->|odpowiadają| DZ
  FZ --> ZS["Zbiór spełnienia"]
  ZB --> ZS
```
Spójniki budują zdania złożone, a każdemu z nich odpowiada działanie na zbiorach. Funkcja zdaniowa łączy obie części: jej zbiór spełnienia jest zbiorem.

## 1. Zdanie logiczne [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t0754|12:34]]
Zdanie logiczne to zdanie oznajmujące, o którym można jednoznacznie powiedzieć, czy jest prawdziwe, czy fałszywe. Prawdzie przypisujemy wartość $1$, fałszowi $0$.
Pytania, polecenia i wyrażenia ze zmienną, takie jak $x > 3$, zdaniami logicznymi nie są.

> [!example]- Przykład
> „Warszawa jest stolicą Polski” to zdanie prawdziwe, „$2 + 2 = 5$” to zdanie fałszywe, a „Zamknij okno” w ogóle nie jest zdaniem logicznym.

## 2. Spójniki i tabele prawdy [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t1310|21:50]]
Pięć spójników: negacja $\neg p$, koniunkcja $p \land q$, alternatywa $p \lor q$, implikacja $p \Rightarrow q$ i równoważność $p \Leftrightarrow q$. Wartość zdania złożonego zależy tylko od wartości zdań, z których je zbudowano.

| $p$ | $q$ | $p \land q$ | $p \lor q$ | $p \Rightarrow q$ | $p \Leftrightarrow q$ |
|---|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 1 | 1 |
| 1 | 0 | 0 | 1 | 0 | 0 |
| 0 | 1 | 0 | 1 | 1 | 0 |
| 0 | 0 | 0 | 0 | 1 | 1 |

Implikacja jest fałszywa tylko wtedy, gdy z prawdy wynika fałsz. Gdy poprzednik jest fałszywy, cała implikacja jest prawdziwa.

> [!tip]- Dla zrozumienia (AI)
> Implikację można czytać jak obietnicę: „jeśli zdasz egzamin, dostaniesz nagrodę”. Obietnica jest złamana tylko wtedy, gdy egzamin zdasz, a nagrody nie dostaniesz. Jeśli egzaminu nie zdasz, obietnica nie została złamana, cokolwiek się stanie.

## 3. Zbiory i działania na zbiorach [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t2655|44:15]]
Zbiór jest pojęciem pierwotnym: nie definiujemy go, tylko wskazujemy jego elementy. Zapis $x \in A$ czytamy „$x$ należy do $A$”.
- suma: $A \cup B = \{x : x \in A \lor x \in B\}$,
- iloczyn (część wspólna): $A \cap B = \{x : x \in A \land x \in B\}$,
- różnica: $A \setminus B = \{x : x \in A \land x \notin B\}$.

Każde działanie odpowiada spójnikowi: suma alternatywie, iloczyn koniunkcji. Jako przykład zawierania zbiorów prowadzący podał $\mathbb{N} \subset \mathbb{Z} \subset \mathbb{Q} \subset \mathbb{R}$.

> [!abstract]- Wizualizacja
> ```mermaid
> flowchart LR
>   N["ℕ: liczby naturalne"] --> Z["ℤ: liczby całkowite"] --> Q["ℚ: liczby wymierne"] --> R["ℝ: liczby rzeczywiste"]
> ```

## 4. Funkcja zdaniowa i zbiór spełnienia [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t3920|1:05:20]]
Funkcja zdaniowa to wyrażenie ze zmienną, które staje się zdaniem logicznym po podstawieniu za zmienną konkretnej wartości. Zbiór spełnienia to zbiór tych wartości, dla których powstaje zdanie prawdziwe.
Przykład z wykładu: dla $x^2 < 4$ w liczbach rzeczywistych zbiorem spełnienia jest przedział $(-2, 2)$.

> [!abstract]- Wizualizacja
> ```plot
> {"title": "x^2 < 4", "x": [-3, 3], "y": [-1, 6],
>  "functions": [{"expr": "x^2", "label": "y = x^2"}, {"expr": "4", "label": "y = 4"}],
>  "points": [{"x": -2, "y": 4, "label": "-2"}, {"x": 2, "y": 4, "label": "2"}]}
> ```

> [!tip]- Dla zrozumienia (AI)
> Na wykresie zbiór spełnienia to te $x$, dla których parabola leży poniżej prostej $y = 4$. Końce $-2$ i $2$ do niego nie należą, bo nierówność jest ostra.

## Na co prowadzący kładł nacisk
- Implikacja z fałszywym poprzednikiem jest zawsze prawdziwa: powtórzył to trzy razy i zapowiedział takie zadanie na kolokwium. [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t1580|26:20]]
- Tabele prawdy wszystkich pięciu spójników trzeba umieć napisać z pamięci. [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t1702|28:22]]
- „To jest ważne”: działania na zbiorach zapisujemy przez spójniki, a nie samym rysunkiem. [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t3012|50:12]]
- Kolokwium z rozdziałów 1-2 będzie na zjeździe 8 listopada. [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t5410|1:30:10]]

## Do wyjaśnienia
- Około 52:40 nagranie jest niewyraźne; chyba chodzi o różnicę symetryczną zbiorów. Warto sprawdzić w materiałach. [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t3160|52:40]]

## Pojęcia
- [[Zdanie logiczne]]
- [[Implikacja]]
- [[Działania na zbiorach]]
- [[Funkcja zdaniowa]]

> [!important]- Do zapamiętania
> - Symbole spójników: $\neg$ negacja, $\land$ koniunkcja, $\lor$ alternatywa, $\Rightarrow$ implikacja, $\Leftrightarrow$ równoważność. [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t1310|21:50]]
> - Implikacja $p \Rightarrow q$ jest fałszywa tylko dla $p = 1$ i $q = 0$. [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t1580|26:20]]
> - Zbiory liczb: $\mathbb{N}$ naturalne, $\mathbb{Z}$ całkowite, $\mathbb{Q}$ wymierne, $\mathbb{R}$ rzeczywiste. [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t2655|44:15]]
> - Kolokwium z rozdziałów 1-2: zjazd 8 listopada. [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t5410|1:30:10]]

> [!note]- Słowniczek PL ↔ EN
> - **zdanie logiczne**: proposition
> - **koniunkcja**: conjunction
> - **alternatywa**: disjunction
> - **implikacja**: implication
> - **równoważność**: equivalence
> - **zbiór**: set
> - **suma zbiorów**: union
> - **iloczyn zbiorów**: intersection
> - **funkcja zdaniowa**: propositional function
> - **zbiór spełnienia**: solution set
````
"""

# sha256 of each text an older tracker wrote, after _normalise_text: such a file is the tracker's own and
# is replaced by the current text without a copy, also in a vault already at the current format (an
# unedited default follows the new default; an edited one stays the user's). 1.0 (the first Knowledge
# OS build), then 1.1-1.2 (format 1), then the first format-2 routine prompt (1.3.0 builds before the
# lecture map, "Do zapamiętania" and the course textbook).
SHIPPED_TEXTS = {
    "processing-rules.md": frozenset({
        "984b771d69e6a53669a119ab124cfec43a5ed582102ab74e5c94d4a46a4ca6a9",
        "43c4ad13d0b018a212d507b527c7098405170c5a44e5ec654169f0d732e1f994",
    }),
    "routine-prompt.md": frozenset({
        "39a59146783d997ded5f304f12b9f12a3a83eb586be5cd5736afca436246504e",
        "d41bce98a2ea5ffbc70fa40a48db9b7ee9c2388579e7c9111bf271a865ed128b",
        "36d667b46fa0f5723451abcfc763562dba506804d2a92fcdf1acdd39bf58485a",
    }),
}
ROUTINE_LOG = "routine-log.md"
# Remembers in the vault itself that its _SYSTEM notes reached a format, so a later edit that drops the
# format comment (or rewrites the whole prompt) is never taken for an old text and replaced.
FORMAT_STAMP = ".kos-format"
IMPORT_DIR = "Import"
IMPORT_README = "_jak to działa.md"
IMPORT_README_TEXT = """# Import

Wrzuć tu pobrane pliki z wykładu, kursu albo filmu: transkrypcję (.txt, .md, .vtt, .srt, .docx, .pdf).

- Jeden plik to jeden wykład. Kilka plików jednego wykładu włóż razem do podfolderu.
- W podfolderze plik z „podsumowanie” albo „summary” w nazwie to podsumowanie z platformy: rutyna tylko
  sprawdza nim, czy nic nie umknęło. Inne pliki .pdf i .docx obok transkrypcji to materiały (slajdy).
- Data w nazwie (np. „Logika 2026-10-11 13-30”) to data wykładu; bez niej liczy się data pliku.
- Po minucie bez zmian tracker robi z tego sesję dla rutyny Claude i przenosi pliki do `_done`.
  Niczego nie usuwa, a tego samego pliku drugi raz nie zaimportuje.
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

    def find_recording(self, sha256: str) -> dict | None:
        """The stored recording with this audio hash, or None.

        Asked before transcribing, so a PC whose local state was lost (a
        reinstall, a new data folder) never pays to transcribe a file twice.
        """
        got = self._request("GET", f"{self.table_url}?select=note_name,file_name,recorded_at,duration_seconds,"
                                   f"session_key,part&sha256=eq.{sha256}&limit=1", timeout=60)
        return got[0] if isinstance(got, list) and got else None

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
    """What the PC has already processed, kept in JSON files in the data folder.

    ``known`` maps sha256 -> Known and is saved in ``recordings.json`` as the
    plain list every tracker version reads, so starting an older tracker on the
    same data never breaks. ``files`` maps a file's path key -> (size,
    mtime_ns, sha256), saved beside it in ``recordings-index.json``: with it a
    known recording is recognised after a restart without reading the whole MP3
    again. Losing the index only costs one more read of each file.
    """
    path: Path
    known: dict[str, Known] = field(default_factory=dict)
    files: dict[str, tuple[int, int, str]] = field(default_factory=dict)
    dirty: bool = field(default=False, repr=False, compare=False)  # index entries not saved yet

    @property
    def index_path(self) -> Path:
        return self.path.with_name(self.path.stem + "-index.json")

    @classmethod
    def load(cls, path: Path) -> "IntakeState":
        st = cls(path)
        try:
            files = json.loads(st.index_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            files = {}
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return st
        if isinstance(raw, list):
            entries = raw
        elif isinstance(raw, dict):  # a development build wrote both in one file
            entries, files = raw.get("known") or [], files or raw.get("files") or {}
        else:
            return st
        for k in entries if isinstance(entries, list) else []:
            try:  # one damaged entry must not make every recording look new (and be sent again)
                st.known[k["sha256"]] = Known(k["sha256"], datetime.fromisoformat(k["start"]),
                                              datetime.fromisoformat(k["end"]), k["session"], k["part"], k["note"])
            except (TypeError, ValueError, KeyError):
                continue
        for key, v in files.items() if isinstance(files, dict) else []:
            try:
                size, mtime_ns, sha = v
                st.files[key] = (int(size), int(mtime_ns), str(sha))
            except (TypeError, ValueError):
                continue
        return st

    def recognise(self, key: str, size: int, mtime_ns: int) -> Known | None:
        """The known recording at ``key`` when the file has not changed since it was hashed."""
        entry = self.files.get(key)
        if entry is None or entry[:2] != (size, mtime_ns):
            return None
        return self.known.get(entry[2])

    def remember(self, key: str, size: int, mtime_ns: int, sha256: str) -> None:
        if self.files.get(key) != (size, mtime_ns, sha256):
            self.files[key] = (size, mtime_ns, sha256)
            self.dirty = True

    def add(self, k: Known) -> None:
        self.known[k.sha256] = k
        self.save()

    def save(self) -> None:
        known = [{"sha256": v.sha256, "start": v.start.isoformat(), "end": v.end.isoformat(),
                  "session": v.session, "part": v.part, "note": v.note} for v in self.known.values()]
        for target, data in ((self.path, known), (self.index_path, {key: list(v) for key, v in self.files.items()})):
            tmp = target.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, indent=1), encoding="utf-8")
            tmp.replace(target)
        self.dirty = False

    def flush(self) -> None:
        """Write pending index entries; a failure only costs one more read of those files later."""
        if not self.dirty:
            return
        try:
            self.save()
        except OSError as exc:
            log.warning("Could not save %s: %s", self.path.name, exc)


def _normalise_text(text: str) -> str:
    """The text as compared with what a tracker shipped: no BOM, LF line ends, no trailing spaces."""
    text = text.lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(line.rstrip() for line in text.split("\n")).strip("\n")


def text_hash(text: str) -> str:
    return hashlib.sha256(_normalise_text(text).encode("utf-8")).hexdigest()


def _write_atomic(path: Path, text: str) -> None:
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def _keep_copy(path: Path, data: bytes, day: date) -> Path:
    """``data`` saved as "<name> (moja wersja <day>).md" beside ``path``, never over another file.

    An identical copy saved earlier (an upgrade that failed halfway) is reused.
    """
    base = f"{path.stem} (moja wersja {day.isoformat()})"
    for n in range(1, 100):
        copy = path.with_name(f"{base}{'' if n == 1 else f' ({n})'}{path.suffix}")
        try:
            with copy.open("xb") as fh:
                fh.write(data)
            return copy
        except FileExistsError:
            try:
                if copy.read_bytes() == data:
                    return copy
            except OSError:
                pass
    raise OSError(f"no free name for a copy of {path}")


def _upgrade_note(path: Path, text: str, day: date, stamped: bool) -> Path | None | bool:
    """Bring one _SYSTEM note to the current text.

    False: nothing to do (the current text, or the user's own at the current format). None: replaced,
    it was a text a tracker shipped. A path: replaced after the user's edited copy of an older format
    was saved there. ``stamped``: the vault was brought to the current format before, so whatever is
    not a shipped text is the user's.
    """
    data = path.read_bytes()
    current = data.decode("utf-8", errors="replace")
    digest = text_hash(current)
    if digest == text_hash(text):
        return False
    if digest in SHIPPED_TEXTS.get(path.name, ()):
        _write_atomic(path, text)  # an unedited default: the new default replaces it
        return None
    if stamped:
        return False
    marker = FORMAT_MARKER.search(current)
    if marker and int(marker.group(1)) >= FORMAT_VERSION:
        return False
    if not marker and "Lectures/" in current:
        return False  # the user's own edit of a format-2 note that lost the comment: theirs, not old
    copy = _keep_copy(path, data, day)
    _write_atomic(path, text)
    return copy


def _note_upgrade(sysdir: Path, names: list[str], copies: list[Path], when: datetime) -> None:
    """One line in routine-log.md, so the user (and the routine) see the new format and the kept copies."""
    line = (f"> [!info] Tracker {__version__}, {when:%Y-%m-%d %H:%M}: nowa wersja instrukcji rutyny "
            f"(podsumowania wykładów w Lectures/ z mapą wykładu i „Do zapamiętania”, notatki w języku wykładu, "
            f"podręcznik przedmiotu). Zaktualizowane: {', '.join(names)}.")
    if copies:
        links = ", ".join(f"[[_SYSTEM/{c.stem}]]" for c in copies)
        line += f" Twoja poprzednia wersja: {links}. Co chcesz z niej zachować, przenieś do nowego pliku."
    logfile = sysdir / ROUTINE_LOG
    try:
        old = logfile.read_bytes() if logfile.exists() else None
        head = "# Routine log\n" if old is None else ("\n" if old and not old.endswith(b"\n") else "")
        with logfile.open("a", encoding="utf-8") as fh:
            fh.write(f"{head}\n{line}\n")
    except OSError as exc:
        log.warning("Could not note the routine upgrade in %s: %s", logfile, exc)


def _vault_format(sysdir: Path) -> int:
    """The format this vault's _SYSTEM notes were last brought to (0 when never stamped)."""
    try:
        return int((sysdir / FORMAT_STAMP).read_text(encoding="utf-8").strip() or 0)
    except (OSError, ValueError):
        return 0


def ensure_import_folder(vault: Path) -> Path:
    """``<vault>/Import/``, with a short how-to the first time it is made (never written again)."""
    folder = vault / IMPORT_DIR
    if not folder.exists():
        folder.mkdir(parents=True, exist_ok=True)
        (folder / IMPORT_README).write_text(IMPORT_README_TEXT, encoding="utf-8")
    return folder


def ensure_system_notes(vault: Path, now: datetime | None = None) -> list[str]:
    """The rules and the routine prompt in ``_SYSTEM/`` at the current text; returns the notes upgraded.

    A missing note is written. A text a tracker shipped (``SHIPPED_TEXTS``, an unedited default) is
    replaced by the current one, whatever its format. Any other note from an older format is replaced
    after a copy to "<name> (moja wersja <date>).md", so the user's text is never lost. Any other note
    at the current format belongs to the user and is never touched. An upgrade is logged once and
    noted in routine-log.md. Also makes the Import/ folder.
    """
    now = now or datetime.now()
    sysdir = vault / "_SYSTEM"
    sysdir.mkdir(parents=True, exist_ok=True)
    upgraded: list[str] = []
    copies: list[Path] = []
    stamped = _vault_format(sysdir) >= FORMAT_VERSION
    for name, text in (("processing-rules.md", RULES), ("routine-prompt.md", ROUTINE)):
        p = sysdir / name
        if not p.exists():
            p.write_text(text, encoding="utf-8")
            continue
        try:
            result = _upgrade_note(p, text, now.date(), stamped)
        except OSError as exc:  # a locked or unreadable note must not stop transcription
            log.warning("Could not bring %s to format %d: %s", p, FORMAT_VERSION, exc)
            continue
        if result is False:
            continue
        upgraded.append(name)
        if isinstance(result, Path):
            copies.append(result)
    if not stamped:
        try:
            (sysdir / FORMAT_STAMP).write_text(f"{FORMAT_VERSION}\n", encoding="utf-8")
        except OSError as exc:
            log.warning("Could not stamp %s: %s", sysdir / FORMAT_STAMP, exc)
    if upgraded:
        log.info("Routine notes upgraded to format %d: %s%s", FORMAT_VERSION, ", ".join(upgraded),
                 f" (edited copies kept: {', '.join(c.name for c in copies)})" if copies else "")
        _note_upgrade(sysdir, upgraded, copies, now)
    try:
        ensure_import_folder(vault)
    except OSError as exc:
        log.warning("Could not create %s: %s", vault / IMPORT_DIR, exc)
    return upgraded


# -- the study prompts, copied from the dashboard -----------------------------------------

# user_context column -> its copy in _SYSTEM/. Claude Desktop reads the learning mode when the user talks a
# lecture through there; the routine follows the primer prompt when it writes a course textbook.
STUDY_PROMPT_FILES = {"learning_mode": "learning-mode.md", "primer_prompt": "primer-prompt.md"}
_FROM_DASHBOARD = re.compile(r"(?m)^source:[ \t]*[\"']?dashboard[\"']?[ \t]*\r?$")


def study_prompt_note(text: str) -> str:
    """A study prompt as its vault copy: a short frontmatter, then the text as written in the dashboard."""
    return f"---\nsource: dashboard\n---\n{text.strip()}\n"


def write_study_prompts(vault: Path, prompts: dict[str, str], now: datetime | None = None) -> list[str]:
    """The dashboard's study prompts copied into ``<vault>/_SYSTEM/``; returns the files written.

    The dashboard holds the text (Settings -> AI Context -> Nauka) and the vault copy follows it: a
    file that already holds the text is left as it is, and an empty prompt never empties or deletes
    one. A file the dashboard did not write (no ``source: dashboard``) is the user's own: it is first
    saved as "<name> (moja wersja <date>).md". Only the files in ``STUDY_PROMPT_FILES`` are written,
    and a vault that does not exist (a drive not mounted yet) is not created.
    """
    if not vault.is_dir():
        return []
    sysdir = vault / "_SYSTEM"
    written: list[str] = []
    for field_name, name in STUDY_PROMPT_FILES.items():
        text = prompts.get(field_name)
        if not isinstance(text, str) or not text.strip():
            continue
        note = study_prompt_note(text)
        path = sysdir / name
        try:
            data = path.read_bytes() if path.exists() else None
            if data is not None:
                current = data.decode("utf-8", errors="replace")
                if _normalise_text(current) == _normalise_text(note):
                    continue
                head = _FRONTMATTER.match(current)
                if head is None or not _FROM_DASHBOARD.search(head.group(1)):
                    _keep_copy(path, data, (now or datetime.now()).date())
            sysdir.mkdir(exist_ok=True)
            _write_atomic(path, note)
        except OSError as exc:  # a locked file waits for the next turn
            log.warning("Could not write %s: %s", path, exc)
            continue
        written.append(name)
    if written:
        log.info("Study prompts from the dashboard written to the vault: %s", ", ".join(written))
    return written


def known_from_row(sha: str, row: dict, path: Path) -> Known:
    """A kos_recordings row as the local state remembers it (local, naive times like recorded_at())."""
    start = datetime.fromisoformat(str(row["recorded_at"]).replace("Z", "+00:00"))
    if start.tzinfo is not None:
        start = start.astimezone().replace(tzinfo=None)
    duration = float(row.get("duration_seconds") or 0)
    note = row.get("note_name") or f"{start.strftime('%Y-%m-%d %H-%M-%S')} {path.stem}".replace("/", "-")
    return Known(sha, start, start + timedelta(seconds=duration), str(row.get("session_key") or ""),
                 int(row.get("part") or 1), note)


def process_recording(path: Path, client: KosClient, state: IntakeState, vault: Path,
                      gap_minutes: float) -> tuple[str, bool]:
    """One recording end to end: (note name, True when it was transcribed just now).

    The audio file is only read. A file already processed gives (its note,
    False): recognised by path, size and time without reading it, else by its
    sha256 (which also fills the index for files processed before it existed).
    New index entries from that second case are saved by ``state.flush()``.
    """
    st = path.stat()  # before reading: a file that changes while read is hashed again next time
    key = _path_key(path)
    seen = state.recognise(key, st.st_size, st.st_mtime_ns)
    if seen is not None:
        return seen.note, False
    data = path.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    state.remember(key, st.st_size, st.st_mtime_ns, sha)
    if sha in state.known:
        return state.known[sha].note, False
    remote = client.find_recording(sha)
    if remote is not None:  # transcribed before, by this PC with other local state or by another one
        known = known_from_row(sha, remote, path)
        state.add(known)
        return known.note, False
    segments, model, language, duration = transcribe_file(client, data)
    start = recorded_at(path, duration, st.st_mtime)
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
    state.add(Known(sha, start, start + timedelta(seconds=duration), session, part, note))  # saves the index too
    return note, True


def process_file(path: Path, client: KosClient, state: IntakeState, vault: Path, gap_minutes: float) -> str:
    """One recording end to end; returns its note name (``process_recording`` also says if it was new)."""
    try:
        return process_recording(path, client, state, vault, gap_minutes)[0]
    finally:
        state.flush()


def _path_key(path: Path) -> str:
    try:
        path = path.resolve()
    except (OSError, RuntimeError):
        path = Path(os.path.abspath(path))
    return os.path.normcase(str(path))


def iter_recording_files(folder: Path, vault: Path | None = None, max_depth: int = MAX_DEPTH) -> Iterator[Path]:
    """Every MP3 under ``folder`` and its subfolders up to ``max_depth`` levels down, as found.

    Hidden files and folders (a leading dot) are skipped, and so is the vault
    when it sits inside the recordings folder: its notes are not recordings and
    it can be large. Pruned while walking, so neither is ever listed. The depth
    limit keeps a broad folder (a whole drive, Documents) from pulling in
    unrelated audio from deep in the tree.
    """
    skip = _path_key(vault) if vault is not None else None
    base = len(Path(folder).parts)
    for root, dirs, files in os.walk(folder):
        if len(Path(root).parts) - base >= max_depth:
            dirs[:] = []
        else:
            dirs[:] = sorted(d for d in dirs
                             if not d.startswith(".") and (skip is None or _path_key(Path(root, d)) != skip))
        for f in sorted(files):
            if not f.startswith(".") and Path(f).suffix.lower() in AUDIO_SUFFIXES:
                yield Path(root, f)


def recording_files(folder: Path, vault: Path | None = None, max_depth: int = MAX_DEPTH) -> list[Path]:
    """``iter_recording_files`` as a list."""
    return list(iter_recording_files(folder, vault, max_depth))


def count_recordings(folder: Path, vault: Path | None = None, limit: int = 1000) -> int:
    """How many MP3s the tracker would see in ``folder``, counting stops at ``limit`` (show it as "999+")."""
    n = 0
    for _ in iter_recording_files(folder, vault):
        n += 1
        if n >= limit:
            break
    return n


_FRONTMATTER = re.compile(r"\A\ufeff?---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\Z)", re.S)
_STATUS_NEW = re.compile(r"(?m)^status:[ \t]*[\"']?new[\"']?[ \t]*\r?$")


def stale_sessions(vault: Path, now: float, older_than: float = STALE_SESSION_SECONDS) -> list[str]:
    """Session notes still at ``status: new`` and untouched for ``older_than`` seconds, by name.

    The routine sets ``processed`` (or ``skipped``) and a new part rewrites the
    note, so an old ``new`` note means the routine is not running.
    """
    folder = vault / "Sessions"
    if not folder.is_dir():
        return []
    out: list[str] = []
    for p in sorted(folder.glob("*.md")):
        try:
            if p.name.startswith(".") or not p.is_file() or now - p.stat().st_mtime < older_than:
                continue
            with p.open(encoding="utf-8", errors="replace") as fh:
                head = fh.read(4096)
        except OSError:
            continue
        m = _FRONTMATTER.match(head)
        if m and _STATUS_NEW.search(m.group(1)):
            out.append(p.stem)
    return out


def routine_reminder(count: int) -> str:
    """The notification text for ``count`` sessions waiting for the Claude routine."""
    if count == 1:
        waiting = "1 sesja czeka"
    elif count % 10 in (2, 3, 4) and count % 100 not in (12, 13, 14):
        waiting = f"{count} sesje czekają"
    else:
        waiting = f"{count} sesji czeka"
    return f"{waiting} na rutynę Claude od ponad doby. Ustawienia... pokazuje, jak ją włączyć."


# -- the vault mirror ---------------------------------------------------------------

MIRROR_FOLDERS = ("Lectures", "Knowledge", "Sessions")
MIRROR_FILES = ("_SYSTEM/" + ROUTINE_LOG,)  # single files, mirrored under the same path
MAX_NOTE_BYTES = 256_000
MAX_LOG_CHARS = 64_000  # of a longer routine log only its frontmatter and newest entries are sent
RELOAD_SECONDS = 3600


def vault_notes(vault: Path) -> dict[str, Path]:
    """The notes the dashboard shows, by vault-relative path.

    Every .md under Lectures/, Knowledge/ and Sessions/ (hidden ones apart), and the routine's log.
    """
    out: dict[str, Path] = {}
    for folder in MIRROR_FOLDERS:
        base = vault / folder
        if not base.is_dir():
            continue
        for p in base.rglob("*.md"):
            rel = p.relative_to(vault)
            if p.is_file() and not any(part.startswith(".") for part in rel.parts):
                out[rel.as_posix()] = p
    for rel in MIRROR_FILES:
        if (vault / rel).is_file():
            out[rel] = vault / rel
    return out


def log_excerpt(text: str, limit: int = MAX_LOG_CHARS) -> str:
    """A long routine log cut to its frontmatter (``last_run``) and the newest entries that fit."""
    if len(text) <= limit:
        return text
    m = _FRONTMATTER.match(text)
    head = m.group(0) if m else ""
    tail = text[-max(limit - len(head), limit // 2):]
    cut = tail.find("\n## ")
    tail = tail[cut + 1:] if cut >= 0 else tail[tail.find("\n") + 1:]
    return f"{head}\n(Older entries are in the vault's copy of this file.)\n\n{tail}"


class VaultMirror:
    """Keeps kos_vault_files equal to the vault's notes (``vault_notes``), one way: vault -> database.

    The server's list (path -> sha256) is the state, read at start and again every hour, so
    nothing is kept on disk and a lost row is sent again. A file is hashed only when its size
    or modification time changed. A vault folder that is missing (a drive not mounted yet)
    changes nothing on the server.

    A vault without a single note while the server holds some deletes nothing either: that
    is a new, emptied or wrong folder (a changed vault_dir, a redirected Documents), and
    mirroring it would empty the dashboard's Knowledge and Recordings tabs. The cost is that
    deleting the very last note leaves its copy on the server until another note exists.
    """

    def __init__(self, vault: Path, client: KosClient) -> None:
        self.vault, self.client = vault, client
        self.remote: dict[str, tuple[str, str]] | None = None
        self._loaded_at = 0.0
        self._hashes: dict[str, tuple[tuple[int, int], str]] = {}
        self._refused: dict[str, str] = {}
        self._held_back = False

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
                if st.st_size > MAX_NOTE_BYTES and rel not in MIRROR_FILES:
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
                if rel in MIRROR_FILES:
                    text = log_excerpt(text)
                changed.append({"vault": name, "path": rel, "content": text, "sha256": sha,
                                "modified_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()})
            except OSError:
                continue
        for i in range(0, len(changed), 50):
            self._send(changed[i:i + 50])
        gone = [rel for rel in self.remote if rel not in local]
        if gone and not local.difference(MIRROR_FILES):  # the routine's log alone is not a vault's notes
            if not self._held_back:  # once, not every minute
                log.warning("Vault mirror: %s has no notes but the dashboard has %d; nothing deleted. "
                            "Check vault_dir in config.json.", self.vault, len(gone))
            self._held_back = True
            return len(changed), 0
        self._held_back = False
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


class Importer(Protocol):
    """What the worker needs of ``imports.ImportWatcher``: one look at the vault's Import/ folder."""

    def scan(self, now: float) -> list[str]: ...


class IntakeWorker(threading.Thread):
    """Every minute: transcribes recordings that stopped growing (oldest first), imports what waits in
    the vault's Import/ folder, then mirrors the vault.

    Once a day at most it also reminds the user when sessions wait for the
    Claude routine.

    ``since`` (epoch seconds, 0 = no cutoff) leaves out files last written
    before it: a folder chosen for "new recordings only" does not send the
    audio that was already in it. ``notify`` returns False when the message
    could not be shown (no tray icon yet); None counts as shown.
    """

    def __init__(self, folder: Path | None, vault: Path, gap_minutes: float, client: KosClient, state: IntakeState,
                 notify: Callable[[str], bool | None] | None = None, interval: float = 60,
                 mirror: VaultMirror | None = None, since: float = 0.0, importer: Importer | None = None) -> None:
        super().__init__(name="mf-recordings", daemon=True)
        self.folder, self.vault, self.gap = folder, vault, gap_minutes
        self.client, self.state, self.notify, self.interval = client, state, notify, interval
        self.mirror = mirror
        self.importer = importer
        self.since = since
        self.started_at = time.time()
        self._sizes: dict[Path, int] = {}
        self._retry_after: dict[Path, float] = {}
        self._done: set[tuple[Path, int]] = set()
        self._stop = threading.Event()
        self._reminded_at: float | None = None
        self._reminder_checked_at: float | None = None

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:  # pragma: no cover - thread loop around tested methods
        self.started_at = time.time()
        while not self._stop.is_set():
            try:
                self.scan(time.time())
            except Exception:
                log.exception("recordings scan failed")
            try:
                self.import_files(time.time())
            except AuthRequired:
                pass
            except Exception:
                log.exception("import scan failed")
            try:
                self.mirror_vault(time.time())
            except AuthRequired:
                pass
            except SyncError as exc:
                log.warning("Vault mirror: %s", exc)
            except Exception:
                log.exception("vault mirror failed")
            try:
                self.remind_routine(time.time())
            except Exception:
                log.exception("routine reminder failed")
            self._stop.wait(self.interval)

    def import_files(self, now: float) -> list[str]:
        """One look at Import/ (the importer moves what it took to Import/_done); the sources imported."""
        if self.importer is None or not self.client.auth.user_id:
            return []
        return self.importer.scan(now)

    def mirror_vault(self, now: float) -> None:
        if self.mirror is None or not self.client.auth.user_id:
            return
        sent, deleted = self.mirror.sync(now)
        if sent or deleted:
            log.info("Vault mirror: %d note(s) sent, %d deleted", sent, deleted)

    def remind_routine(self, now: float) -> bool:
        """Notify when sessions have waited more than a day for the routine; True when it did.

        The folder is looked at once an hour and the user hears about it at
        most once a day (and again after a restart, which is when they are at
        the PC to act on it). The first look waits ``REMINDER_START_DELAY``
        after the start, when the tray icon exists, and a reminder that could
        not be shown is not counted: the next hourly look tries again.
        """
        if self.notify is None:
            return False
        if 0 <= now - self.started_at < REMINDER_START_DELAY:
            return False
        if self._reminded_at is not None and 0 <= now - self._reminded_at < REMINDER_SECONDS:
            return False
        if self._reminder_checked_at is not None and 0 <= now - self._reminder_checked_at < REMINDER_CHECK_SECONDS:
            return False
        self._reminder_checked_at = now
        stale = stale_sessions(self.vault, now)
        if not stale:
            return False
        if self.notify(routine_reminder(len(stale))) is False:
            return False
        self._reminded_at = now
        log.info("%d session(s) waiting for the Claude routine for over a day: %s", len(stale), ", ".join(stale[:5]))
        return True

    def scan(self, now: float) -> None:
        if self.folder is None or not self.folder.is_dir() or not self.client.auth.user_id:
            return
        ready = []
        for p in recording_files(self.folder, self.vault):
            try:
                if not p.is_file():
                    continue
                st = p.stat()
            except OSError:
                continue
            if self.since > 0 and st.st_mtime < self.since:
                continue  # was in the folder before transcription was turned on for it
            stable = self._sizes.get(p) == st.st_size and now - st.st_mtime >= SETTLE_SECONDS
            self._sizes[p] = st.st_size
            if stable and now >= self._retry_after.get(p, 0) and not self._seen(p, st.st_size):
                ready.append((st.st_mtime, p))
        try:
            for _, p in sorted(ready):
                try:
                    note, fresh = process_recording(p, self.client, self.state, self.vault, self.gap)
                    self._done.add((p, p.stat().st_size))
                    if fresh:  # a file known from before the restart is not news
                        log.info("Recording %s -> %s", p.name, note)
                        if self.notify:
                            self.notify(f"Transcribed: {p.name}")
                except AuthRequired:
                    return
                except Exception as exc:
                    log.warning("Recording %s failed (%s); retrying in 10 min", p.name, exc)
                    self._retry_after[p] = now + 600
        finally:
            self.state.flush()

    def _seen(self, p: Path, size: int) -> bool:
        return (p, size) in self._done
