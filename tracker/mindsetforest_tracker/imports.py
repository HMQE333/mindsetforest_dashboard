"""Knowledge OS imports: transcripts downloaded by hand become sessions, like recordings.

The tracker watches ``<vault>/Import/``. One file, or one subfolder, is one
source (a lecture, a course part, a video): .txt .md .vtt .srt .docx .pdf. In
a subfolder, a file whose name says "podsumowanie" or "summary" is the
institution's AI summary (the routine only cross-checks against it), other
.pdf/.docx files are materials (slides), and the rest is the transcript.

A source that has not changed for a minute is:

1. hashed, transcript file by transcript file, and skipped when that hash was
   imported before, on this PC or (``kos_recordings``) on any other;
2. cut into segments: VTT/SRT cues (and text whose lines start with a time)
   keep their start in seconds, anything else becomes numbered paragraphs;
3. stored in ``kos_recordings`` (``source = 'import'``, ``original_name``) and
   written into the vault like a recording: ``Recordings/<note>.md`` with
   ``^tNNNN`` (seconds) or ``^pNNNN`` (paragraph) anchors, the institution's
   summary and the materials as notes beside it, and a ``Sessions/`` note at
   ``status: new`` for the Claude routine;
4. moved to ``Import/_done/`` (never deleted).

The lecture's date comes from a ``YYYY-MM-DD`` (or ``DD.MM.YYYY``) in the
folder or file name, optionally followed by ``HH-MM``, else from the file's
modification time. .docx is read with zipfile and the XML parser; .pdf needs
pypdf, and without it PDFs are skipped with a log line.
"""
from __future__ import annotations

import codecs
import hashlib
import html
import io
import json
import logging
import os
import re
import zipfile
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable
from xml.etree import ElementTree
from xml.sax.saxutils import escape

from .auth import AuthRequired
from .recordings import IMPORT_DIR, PARTS_END, PARTS_START, SETTLE_SECONDS, KosClient, ensure_system_notes, ts
from .sync import SyncRejected

log = logging.getLogger(__name__)

DONE_DIR = "_done"
TEXT_SUFFIXES = (".txt", ".md", ".vtt", ".srt")
DOCUMENT_SUFFIXES = (".docx", ".pdf")
SUPPORTED = frozenset(TEXT_SUFFIXES + DOCUMENT_SUFFIXES)
MAX_FILE_BYTES = 100 * 1024 * 1024
MAX_XML_BYTES = 64 * 1024 * 1024
MAX_TEXT_CHARS = 2_000_000  # a transcript longer than this is not a lecture
MAX_DEPTH = 3               # folder levels inside one source
MAX_PARAGRAPH = 1200        # characters; longer paragraphs are split at sentence ends
RETRY_SECONDS = 600
INSTITUTION_SUMMARY = "podsumowanie uczelni"
MATERIALS = "materiały"

SUMMARY_NAME = re.compile(r"podsumowani|summary|summaries", re.I)
TRANSCRIPT_NAME = re.compile(r"transkryp|transcript|napisy|captions|subtitles", re.I)
MATERIAL_NAME = re.compile(r"slajd|slide|prezentac|presentation|materia|handout", re.I)
NEW_COLUMNS = ("source", "original_name")  # kos_recordings columns from migration 20261015120000


class ImportProblem(Exception):
    """A source that cannot be imported as it is; tried again only once it changes. The text is Polish."""


class PdfUnavailable(ImportProblem):
    """pypdf is not installed (a source install without it), so PDFs are skipped."""


# -- text -------------------------------------------------------------------------


def decode_text(data: bytes) -> str:
    """Text from a file of unknown encoding: UTF-8 (with or without BOM), UTF-16, else Windows-1250."""
    if data.startswith(codecs.BOM_UTF8):
        text = data[3:].decode("utf-8", "replace")
    elif data.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        text = data.decode("utf-16", "replace")
    else:
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            text = data.decode("cp1250", "replace")  # Polish Windows
    return text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")


def _squash(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _ends_sentence(text: str) -> bool:
    return text.rstrip("\"'”»’)").endswith((".", "!", "?", "…", ":"))


_SENTENCE_BREAK = re.compile(r"(?<=[.!?…])\s+(?=\S)")


def split_long(paragraph: str, limit: int = MAX_PARAGRAPH) -> list[str]:
    """A long paragraph cut at sentence ends into pieces of about ``limit`` characters (at word ends
    when there are no sentences, as in captions without punctuation)."""
    if len(paragraph) <= limit:
        return [paragraph]
    pieces: list[str] = []
    cur = ""
    for sentence in _SENTENCE_BREAK.split(paragraph):
        if cur and len(cur) + 1 + len(sentence) > limit:
            pieces.append(cur)
            cur = sentence
        else:
            cur = f"{cur} {sentence}" if cur else sentence
    if cur:
        pieces.append(cur)
    out: list[str] = []
    for piece in pieces:
        while len(piece) > 2 * limit:
            cut = piece.rfind(" ", 0, limit)
            cut = cut if cut > 0 else limit
            out.append(piece[:cut].strip())
            piece = piece[cut:].strip()
        out.append(piece)
    return [p for p in out if p]


_FRONT = re.compile(r"\A---[ \t]*\n.*?\n---[ \t]*(?:\n|\Z)", re.S)
_HEADING = re.compile(r"^#{1,6}\s")
_LIST_ITEM = re.compile(r"^(?:[-*+•]|\d{1,3}[.)])\s+")


def text_paragraphs(text: str) -> list[str]:
    """Paragraphs of a plain text or Markdown file.

    Blocks between blank lines, with headings and list items each a paragraph of their own; a text
    without a single blank line (one utterance per line) has one paragraph per line.
    """
    text = _FRONT.sub("", text.lstrip("﻿"), count=1).strip()
    if not text:
        return []
    blocks = re.split(r"\n[ \t]*\n", text)
    out: list[str] = []
    if len(blocks) == 1:
        out = [_squash(line) for line in text.split("\n")]
    else:
        for block in blocks:
            cur: list[str] = []
            for line in block.split("\n"):
                line = line.strip()
                if not line:
                    continue
                if cur and (_HEADING.match(line) or _LIST_ITEM.match(line) or _HEADING.match(cur[0])):
                    out.append(_squash(" ".join(cur)))
                    cur = []
                cur.append(line)
            if cur:
                out.append(_squash(" ".join(cur)))
    return [piece for p in out if p for piece in split_long(p)]


# -- captions and timed text --------------------------------------------------------

_TIME = r"(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?"
_CUE_TIMING = re.compile(rf"^\s*{_TIME}\s*-->\s*{_TIME}")
_SRT_START = re.compile(rf"\A\s*\d+\s*\n\s*{_TIME}\s*-->")
_VOICE = re.compile(r"<v(?:\.[^\s>]*)?\s+([^>]+)>", re.I)
_TAG = re.compile(r"<[^>]*>")
_SSA = re.compile(r"\{\\[^}]*\}")


def _seconds(h: str | None, m: str, s: str, frac: str | None) -> float:
    return int(h or 0) * 3600 + int(m) * 60 + int(s) + (int(frac.ljust(3, "0")[:3]) / 1000 if frac else 0.0)


def _cue_line(line: str) -> str:
    line = _VOICE.sub(lambda m: m.group(1).strip() + ": ", line)
    return _squash(html.unescape(_SSA.sub("", _TAG.sub("", line))))


def parse_cues(text: str) -> list[dict]:
    """The cues of a WebVTT or SRT file as {"start", "end", "text"} in seconds.

    Tags go (a ``<v Name>`` voice becomes "Name: "), and lines repeated from the
    cues just before are dropped: auto-captions (YouTube) roll each line through
    two or three cues.
    """
    cues: list[dict] = []
    recent: list[str] = []
    for block in re.split(r"\n[ \t]*\n", text.replace("\r\n", "\n")):
        lines = block.strip("\n").split("\n")
        at = next((i for i, line in enumerate(lines) if "-->" in line), None)
        m = _CUE_TIMING.match(lines[at]) if at is not None else None
        if m is None:
            continue  # the WEBVTT header, NOTE, STYLE and REGION blocks
        g = m.groups()
        start, end = _seconds(*g[:4]), _seconds(*g[4:])
        kept: list[str] = []
        for raw in lines[at + 1:]:  # type: ignore[operator]
            line = _cue_line(raw)
            if line and line not in recent:
                kept.append(line)
                recent = (recent + [line])[-3:]
        if kept:
            cues.append({"start": start, "end": max(start, end), "text": " ".join(kept)})
    return cues


def merge_cues(cues: list[dict], min_seconds: float = 6.0, max_seconds: float = 20.0) -> list[dict]:
    """Short cues joined into transcript segments, like Whisper's for a recording.

    A segment ends at a sentence end once it is ``min_seconds`` long, or before it
    would pass ``max_seconds``. Two segments never start in the same second, since
    their ``^tNNNN`` anchors would clash.
    """
    out: list[dict] = []
    for c in sorted(cues, key=lambda c: c["start"]):
        if out:
            cur = out[-1]
            done = cur["end"] - cur["start"] >= min_seconds and _ends_sentence(cur["text"])
            too_long = c["end"] - cur["start"] > max_seconds
            if int(c["start"]) == int(cur["start"]) or not (done or too_long):
                cur["text"] = f"{cur['text']} {c['text']}"
                cur["end"] = max(cur["end"], c["end"])
                continue
        out.append({"start": c["start"], "end": c["end"], "text": c["text"]})
    for s in out:
        s["start"], s["end"] = round(s["start"], 2), round(s["end"], 2)
    return out


_LEAD_TIME = re.compile(r"^[\[(]?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,]\d{1,3})?[\])]?(?:\s*[-–—|:]\s*|\s+|$)")


def timed_paragraphs(paragraphs: list[str]) -> list[dict] | None:
    """Cues from text whose lines start with a time ("00:12:34 text", "[12:34] text", or a time alone
    above its text, as copied from YouTube); None when the text is not like that."""
    marks = [_LEAD_TIME.match(p) for p in paragraphs]
    count = sum(1 for m in marks if m)
    if count < 3 or count < 0.3 * len(paragraphs):
        return None
    cues: list[dict] = []
    lead: list[str] = []
    for p, m in zip(paragraphs, marks):
        if m:
            h, mi, s = m.groups()
            start = float(int(h or 0) * 3600 + int(mi) * 60 + int(s))
            cues.append({"start": start, "end": start, "text": p[m.end():].strip()})
        elif cues:
            cues[-1]["text"] = f"{cues[-1]['text']} {p}".strip()
        else:
            lead.append(p)
    rising = sum(1 for a, b in zip(cues, cues[1:]) if b["start"] >= a["start"])
    if rising < 0.9 * (len(cues) - 1):
        return None  # times out of order: clock times in a document, not a transcript
    for a, b in zip(cues, cues[1:]):
        a["end"] = max(a["start"], b["start"])
    if lead:
        cues[0]["text"] = " ".join(lead + [cues[0]["text"]]).strip()
    return [c for c in cues if c["text"]]


# -- .docx and .pdf ------------------------------------------------------------------

_W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
_W = "{%s}" % _W_NS


def _docx_walk(el: ElementTree.Element, out: list[str], buf: list[str] | None) -> None:
    tag = el.tag
    if tag == _W + "p":
        own: list[str] = []
        for child in el:
            _docx_walk(child, out, own)
        out.append("".join(own))
        return
    if buf is not None:
        if tag == _W + "t":
            buf.append(el.text or "")
        elif tag == _W + "tab":
            buf.append(" ")
        elif tag in (_W + "br", _W + "cr"):
            buf.append("\n")
    for child in el:
        _docx_walk(child, out, buf)


def docx_paragraphs(data: bytes) -> list[str]:
    """The paragraphs of a Word file (tables included, deleted tracked changes left out)."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            info = z.getinfo("word/document.xml")
            if info.file_size > MAX_XML_BYTES:
                raise ImportProblem("plik .docx jest za duży")
            root = ElementTree.fromstring(z.read(info))
        raw: list[str] = []
        _docx_walk(root, raw, None)
    except ImportProblem:
        raise
    except (zipfile.BadZipFile, KeyError, ElementTree.ParseError, RecursionError, ValueError, EOFError) as exc:
        raise ImportProblem("uszkodzony plik .docx") from exc
    lines = [_squash(line) for p in raw for line in p.split("\n")]
    return [piece for line in lines if line for piece in split_long(line)]


def pdf_pages(data: bytes) -> list[str]:
    """The text of each page of a PDF (pypdf)."""
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise PdfUnavailable("do plików PDF potrzebny jest pakiet pypdf") from exc
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            reader.decrypt("")
        return [page.extract_text() or "" for page in reader.pages]
    except Exception as exc:  # pypdf raises many kinds for a damaged or protected file
        raise ImportProblem("uszkodzony albo zabezpieczony hasłem PDF") from exc


_PAGE_NUMBER = re.compile(r"^(?:(?:strona|str\.|page|p\.)\s*)?\d{1,4}(?:\s*(?:/|z|of)\s*\d{1,4})?$", re.I)


def _pdf_lines(pages: list[str]) -> list[list[str]]:
    """Each page's lines without running headers and footers (a line on 3+ pages and half of them)
    or page numbers; blank lines stay as ""."""
    lines = [[_squash(line) for line in page.strip().split("\n")] for page in pages]
    counts = Counter(line for page in lines for line in set(page) if line)
    repeated = {line for line, n in counts.items() if n >= 3 and n >= len(pages) / 2}
    return [[line for line in page if not line or (line not in repeated and not _PAGE_NUMBER.match(line))]
            for page in lines]


def _join_lines(lines: list[str], typical: int, cur: str = "") -> tuple[list[str], str]:
    """Hard-wrapped lines joined into paragraphs: a blank line, or a short line that ends a sentence,
    ends one. Returns the paragraphs and the one still open."""
    out: list[str] = []
    for line in lines:
        if not line:
            if cur:
                out.append(cur)
                cur = ""
            continue
        if len(cur) > 1 and cur.endswith("-") and cur[-2].isalpha() and line[:1].islower():
            cur = cur[:-1] + line  # a word hyphenated at the line end
        else:
            cur = f"{cur} {line}" if cur else line
        if _ends_sentence(line) and len(line) < 0.8 * typical:
            out.append(cur)
            cur = ""
    return out, cur


def _typical_line(pages: list[list[str]]) -> int:
    lengths = sorted(len(line) for page in pages for line in page if line)
    return lengths[int(len(lengths) * 0.75)] if lengths else 0


def pdf_paragraphs(pages: list[str]) -> list[str]:
    """A PDF's text as paragraphs; a paragraph runs on over a page break unless a sentence ended there."""
    clean = _pdf_lines(pages)
    typical = _typical_line(clean)
    out: list[str] = []
    cur = ""
    for page in clean:
        done, cur = _join_lines(page, typical, cur)
        out += done
        if cur and _ends_sentence(cur):
            out.append(cur)
            cur = ""
    if cur:
        out.append(cur)
    return [piece for p in out for piece in split_long(p)]


def pdf_page_paragraphs(pages: list[str]) -> list[tuple[int, list[str]]]:
    """(page number, paragraphs) for each page with text: slides keep their pages."""
    clean = _pdf_lines(pages)
    typical = _typical_line(clean)
    out: list[tuple[int, list[str]]] = []
    for n, page in enumerate(clean, 1):
        done, cur = _join_lines(page, typical)
        paragraphs = [piece for p in done + ([cur] if cur else []) for piece in split_long(p)]
        if paragraphs:
            out.append((n, paragraphs))
    return out


# -- one file -----------------------------------------------------------------------


@dataclass
class Transcript:
    kind: str             # the file type: vtt, srt, txt, md, docx, pdf
    segments: list[dict]  # timed: {"start", "end", "text"}; else {"p", "start": None, "end": None, "text"}
    timed: bool

    @property
    def duration(self) -> float:
        return max((s["end"] for s in self.segments), default=0.0) if self.timed else 0.0

    @property
    def text(self) -> str:
        return " ".join(s["text"] for s in self.segments)


def read_file(path: Path) -> bytes:
    if path.stat().st_size > MAX_FILE_BYTES:
        raise ImportProblem(f"plik {path.name} ma ponad {MAX_FILE_BYTES // (1024 * 1024)} MB")
    return path.read_bytes()


def _paragraphs(kind: str, data: bytes) -> list[str]:
    if kind == "docx":
        return docx_paragraphs(data)
    if kind == "pdf":
        return pdf_paragraphs(pdf_pages(data))
    return text_paragraphs(decode_text(data))


def read_transcript(name: str, data: bytes) -> Transcript:
    """A transcript file as segments: captions keep their times, other text becomes paragraphs."""
    kind = Path(name).suffix.lower().lstrip(".")
    cues: list[dict] | None = None
    paragraphs: list[str] = []
    if kind in ("vtt", "srt", "txt", "md"):
        text = decode_text(data).lstrip("﻿")
        if kind in ("vtt", "srt") or text.lstrip().startswith("WEBVTT") or _SRT_START.match(text):
            cues = parse_cues(text)
        else:
            paragraphs = text_paragraphs(text)
    else:
        paragraphs = _paragraphs(kind, data)
    if cues is None:
        cues = timed_paragraphs(paragraphs)
    if cues is not None:
        segments = merge_cues(cues)
    else:
        segments = [{"p": n, "start": None, "end": None, "text": t} for n, t in enumerate(paragraphs, 1)]
    if not segments:
        raise ImportProblem("brak tekstu" + (" (może to skan?)" if kind == "pdf" else ""))
    out = Transcript(kind, segments, cues is not None)
    if len(out.text) > MAX_TEXT_CHARS:
        raise ImportProblem("tekst jest za długi jak na jeden wykład")
    return out


def side_sections(name: str, data: bytes) -> list[tuple[str | None, list[str]]]:
    """A summary or materials file as (heading, paragraphs) sections: a PDF by page, the rest whole."""
    kind = Path(name).suffix.lower().lstrip(".")
    if kind == "pdf":
        return [(f"Strona {n}", paragraphs) for n, paragraphs in pdf_page_paragraphs(pdf_pages(data))]
    if kind in ("vtt", "srt"):
        return [(None, [c["text"] for c in merge_cues(parse_cues(decode_text(data)))])]
    return [(None, _paragraphs(kind, data))]


_PL_WORDS = frozenset("nie się jest na że do jak co tak ale po czy są dla od już tylko może jeśli więc bo żeby "
                      "oraz który która które także przez tym ten ta to".split())
_EN_WORDS = frozenset("the and is of that it you this for are was with on we be not have so what can if but or "
                      "which there they".split())
_PL_LETTERS = re.compile(r"[ąćęłńśźż]")


def guess_language(text: str) -> str | None:
    """"pl", "en" or None (too little text, or both in about equal measure)."""
    sample = text[:100_000].lower()
    words = re.findall(r"[^\W\d_]+", sample)
    pl = sum(1 for w in words if w in _PL_WORDS) + len(_PL_LETTERS.findall(sample)) // 2
    en = sum(1 for w in words if w in _EN_WORDS)
    if pl + en < 6:
        return None
    if pl >= 2 * en:
        return "pl"
    if en >= 2 * pl:
        return "en"
    return None


# -- names and dates ----------------------------------------------------------------


@dataclass(frozen=True)
class NameDate:
    when: datetime
    has_time: bool
    span: tuple[int, int]  # where the date (and time) stands in the name


_HM = r"(?:[ _T]+(\d{1,2})[-.:hH](\d{2})(?:[-.:](\d{2}))?(?!\d))?"
_ISO_DATE = re.compile(r"(?<!\d)(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?!\d)" + _HM)
_DMY_DATE = re.compile(r"(?<!\d)(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})(?!\d)" + _HM)


def date_from_name(name: str) -> NameDate | None:
    """The first date in a file or folder name: 2026-10-11 or 11.10.2026, optionally with 13-30."""
    found: list[tuple[int, NameDate]] = []
    for rx, order in ((_ISO_DATE, (0, 1, 2)), (_DMY_DATE, (2, 1, 0))):
        for m in rx.finditer(name):
            g = m.groups()
            y, mo, d = (int(g[i]) for i in order)
            if not 2000 <= y <= 2100:
                continue
            try:
                day = datetime(y, mo, d)
            except ValueError:
                continue
            when, has_time = day, False
            if g[3] is not None:
                try:
                    when, has_time = day.replace(hour=int(g[3]), minute=int(g[4]), second=int(g[5] or 0)), True
                except ValueError:
                    pass
            found.append((m.start(), NameDate(when, has_time, (m.start(), m.end() if has_time else m.end(3)))))
    return min(found, key=lambda f: f[0])[1] if found else None


_NOT_IN_NAMES = re.compile(r'[#^|\\/:*?"<>]')  # what breaks an Obsidian note name or a [[link]]


def clean_title(name: str, span: tuple[int, int] | None = None, limit: int = 80) -> str:
    """A name fit for a note: the date taken out, underscores as spaces, no characters links break on."""
    if span:
        name = f"{name[:span[0]]} {name[span[1]:]}"
    name = name.replace("_", " ").replace("[", "(").replace("]", ")")
    name = _NOT_IN_NAMES.sub(" ", name)
    name = re.sub(r"\(\s*\)", " ", name)
    name = re.sub(r"(?:\s*[-–]\s*){2,}", " - ", re.sub(r"\s+", " ", name)).strip(" -–.,")
    if len(name) > limit:
        name = name[:limit].rsplit(" ", 1)[0].strip(" -–.,")
    return name


def _natural(text: str) -> list:
    return [int(t) if t.isdigit() else t.casefold() for t in re.split(r"(\d+)", text)]


def _unique(folder: Path, stem: str, taken: set[str]) -> str:
    """``stem``, or "<stem> (2)", ... when a note of that name exists or is about to."""
    for n in range(1, 1000):
        name = stem if n == 1 else f"{stem} ({n})"
        if name.casefold() not in taken and not (folder / f"{name}.md").exists():
            taken.add(name.casefold())
            return name
    raise ImportProblem("za dużo plików o tej samej nazwie")


_YOUTUBE_ID = re.compile(r"\[[A-Za-z0-9_-]{11}\]")  # yt-dlp's "Title [id].en.vtt"
_YOUTUBE = re.compile(r"youtube|youtu\.be", re.I)


def looks_like_youtube(names: list[str], texts: list[str]) -> bool:
    return any(_YOUTUBE_ID.search(n) or _YOUTUBE.search(n) for n in names) or any(
        _YOUTUBE.search(t[:2000]) for t in texts)


# -- one source -----------------------------------------------------------------------


def _ignored(name: str) -> bool:
    """Files and folders the importer never takes: _done, hidden, Word's lock files, Windows' own."""
    return name.startswith((".", "_", "~$")) or name.lower() in ("desktop.ini", "thumbs.db")


def _walk(folder: Path) -> list[Path]:
    out: list[Path] = []
    base = len(folder.parts)
    for root, dirs, files in os.walk(folder):
        if len(Path(root).parts) - base >= MAX_DEPTH:
            dirs[:] = []
        else:
            dirs[:] = sorted(d for d in dirs if not _ignored(d))
        out += [Path(root, f) for f in files if not _ignored(f)]
    return out


def source_files(entry: Path) -> list[Path]:
    """The importable files of a source: the file itself, or the supported files in the folder."""
    files = [entry] if entry.is_file() else _walk(entry)
    files = [f for f in files if f.suffix.lower() in SUPPORTED]
    return sorted(files, key=lambda f: _natural(f.relative_to(entry).as_posix() if f != entry else f.name))


@dataclass
class Plan:
    transcripts: list[Path]
    summaries: list[Path] = field(default_factory=list)
    materials: list[Path] = field(default_factory=list)
    stand_in: str | None = None  # no transcript came: "summary" or "materials" stands in for it


def classify(entry: Path, files: list[Path]) -> Plan:
    """Which files are the transcript, the institution's summary and the materials.

    A single file is the transcript. In a folder: "podsumowanie"/"summary" in the name is the summary;
    text files (and files named like a transcript) are the transcript; other .pdf/.docx are materials,
    unless there is no transcript at all, when those not named like slides are. A folder with only a
    summary (or only slides) imports that, and the session note says so.
    """
    if entry.is_file():
        return Plan(list(files))
    summaries = [f for f in files if SUMMARY_NAME.search(f.stem)]
    rest = [f for f in files if f not in summaries]
    transcripts = [f for f in rest if f.suffix.lower() in TEXT_SUFFIXES or TRANSCRIPT_NAME.search(f.stem)]
    materials = [f for f in rest if f not in transcripts]
    if not transcripts:
        transcripts = [f for f in materials if not MATERIAL_NAME.search(f.stem)]
        materials = [f for f in materials if f not in transcripts]
    if transcripts:
        return Plan(transcripts, summaries, materials)
    if summaries:
        return Plan(summaries, [], materials, stand_in="summary")
    return Plan(materials, [], [], stand_in="materials")


@dataclass
class ImportState:
    """Transcript files already imported, by sha256, kept in ``imports.json`` in the data folder."""
    path: Path
    done: dict[str, dict] = field(default_factory=dict)  # sha256 -> {"note", "session", "name", "at"}

    @classmethod
    def load(cls, path: Path) -> "ImportState":
        st = cls(path)
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return st
        for sha, entry in raw.items() if isinstance(raw, dict) else []:
            if isinstance(sha, str) and isinstance(entry, dict):
                st.done[sha] = entry
        return st

    def add(self, sha: str, note: str, session: str, name: str) -> None:
        self.done[sha] = {"note": note, "session": session, "name": name,
                          "at": datetime.now().isoformat(timespec="seconds")}
        self.save()

    def save(self) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.done, indent=1, ensure_ascii=False), encoding="utf-8")
        tmp.replace(self.path)


@dataclass
class ImportResult:
    session: str
    notes: list[str]
    fresh: bool                # False: imported before (here or on the server), only moved to _done
    moved_to: Path | None      # None when the move failed (the file is open somewhere): tried again later


@dataclass
class _Part:
    path: Path
    data: bytes
    sha: str
    known: dict | None = None   # imported on this PC
    remote: dict | None = None  # the server's row: stored, but its notes may be missing from this vault


def store_row(client: KosClient, row: dict) -> str | None:
    """Insert a kos_recordings row; without the import columns when the server does not have them yet."""
    try:
        return client.store(row)
    except SyncRejected as exc:
        text = str(exc)
        if exc.status != 400 or not ("PGRST204" in text or any(c in text for c in NEW_COLUMNS)):
            raise
        log.warning("kos_recordings has no source/original_name columns yet (migration "
                    "20261015120000_kos_imports); storing the import without them")
        return client.store({k: v for k, v in row.items() if k not in NEW_COLUMNS})


def move_done(entry: Path) -> Path | None:
    """Move a source into Import/_done (a free name there, never over another file); None if it failed."""
    done = entry.parent / DONE_DIR
    try:
        done.mkdir(exist_ok=True)
        stem, suffix = (entry.stem, entry.suffix) if entry.is_file() else (entry.name, "")
        for n in range(1, 1000):
            target = done / (entry.name if n == 1 else f"{stem} ({n}){suffix}")
            if not target.exists():
                entry.rename(target)
                return target
    except OSError as exc:
        log.warning("Import: could not move %s to %s (%s); trying again later", entry.name, done, exc)
    return None


def transcript_note(note: str, session: str, part: int, start: datetime, has_time: bool, tr: Transcript,
                    original: str, sha: str, language: str | None, rec_id: str | None, source: str,
                    links: dict[str, str]) -> str:
    lines = [
        "---",
        "type: recording",
        f"source: {source}",
        f'session: "[[Sessions/{session}]]"',
        f"part: {part}",
        f"recorded_at: {start.isoformat(timespec='seconds') if has_time else start.date().isoformat()}",
        f"duration: {ts(tr.duration)}",
        f"original_name: {json.dumps(original, ensure_ascii=False)}",
        f"sha256: {sha}",
        f"model: import/{tr.kind}",
        f"language: {language or 'unknown'}",
        f"recording_id: {rec_id or ''}",
        f"anchors: {'time' if tr.timed else 'paragraph'}",
        *(f'{key}: "[[Recordings/{target}]]"' for key, target in links.items()),
        "---",
        "",
        f"# {note}",
        "",
        "Imported transcript, as in the source file. Do not edit: notes link to the "
        + ("timestamps (^tNNNN) below." if tr.timed else "paragraph anchors (^pNNNN) below."),
        "",
    ]
    for s in tr.segments:
        if tr.timed:
            lines.append(f"**[{ts(s['start'])}]** {s['text']} ^t{int(s['start']):04d}")
        else:
            lines.append(f"**[¶{s['p']}]** {s['text']} ^p{s['p']:04d}")
        lines.append("")
    return "\n".join(lines)


SIDE_INTRO = {
    "institution-summary": ("Podsumowanie z platformy uczelni, tekst z pliku. Rutyna sprawdza nim tylko, czy nic "
                            "ważnego nie umknęło; źródłem jest transkrypcja."),
    "materials": "Materiały do wykładu (slajdy, notatki), tekst z plików.",
}


def side_note(kind: str, note: str, session: str, transcript: str,
              files: list[tuple[str, list[tuple[str | None, list[str]]]]]) -> str:
    """The institution's summary or the materials, as a note beside the transcript."""
    lines = ["---", f"type: {kind}", f'session: "[[Sessions/{session}]]"',
             f'transcript: "[[Recordings/{transcript}]]"', f"files: {json.dumps([name for name, _ in files], ensure_ascii=False)}", "---", "",
             f"# {note}", "", SIDE_INTRO[kind], ""]
    for name, sections in files:
        if len(files) > 1 or kind == "materials":
            lines += [f"## {name}", ""]
        for heading, paragraphs in sections:
            if heading and len(sections) > 1:
                lines += [f"### {heading}", ""]
            for p in paragraphs:
                lines += [p, ""]
    return "\n".join(lines)


STAND_IN_LINE = {
    "summary": "- No transcript came with it: the parts above are the institution's summary.",
    "materials": "- No transcript came with it: the parts above are the materials (slides, handouts).",
}


def import_session_note(session: str, started: str, parts: list[tuple[int, str]], source: str, original: str,
                        summary: str | None, materials: str | None, stand_in: str | None) -> str:
    listing = "\n".join(f"- Part {p}: [[Recordings/{n}]]" for p, n in sorted(parts))
    extra = []
    if summary:
        extra.append(f"- Institution summary (only to cross-check; the transcript is the truth): "
                     f"[[Recordings/{summary}]]")
    if materials:
        extra.append(f"- Materials (slides, handouts): [[Recordings/{materials}]]")
    if stand_in:
        extra.append(STAND_IN_LINE[stand_in])
    lines = ["---", "type: session", "status: new", f"started: {started}", f"parts: {len(parts)}",
             f"source: {source}", f"original_name: {json.dumps(original, ensure_ascii=False)}", "---", "",
             f"# Session {session}", "", "## Recordings", PARTS_START, listing, PARTS_END, ""]
    if extra:
        lines += ["## Imported with it", *extra, ""]
    lines += ["## Knowledge", "", "_The Claude routine fills this in and sets `status: processed`._", ""]
    return "\n".join(lines)


def _side_files(paths: list[Path], role: str) -> list[tuple[str, list[tuple[str | None, list[str]]]]]:
    """The text of the summary or materials files; one that cannot be read is left out with a log line."""
    out = []
    for path in paths:
        try:
            sections = side_sections(path.name, read_file(path))
        except PdfUnavailable:
            log.warning("Import: %s %s skipped: PDFs need pypdf (pip install pypdf)", role, path.name)
            continue
        except ImportProblem as exc:
            log.warning("Import: %s %s skipped: %s", role, path.name, exc)
            continue
        if any(paragraphs for _, paragraphs in sections):
            out.append((path.name, sections))
    return out


def import_source(entry: Path, client: KosClient, state: ImportState, vault: Path) -> ImportResult:
    """One file or folder from Import/ end to end (see the module docstring).

    Raises ImportProblem for a source that cannot be imported as it is, and lets
    network and file errors through (tried again later). A transcript file the
    server already has is not stored again; its notes are written only when this
    vault lacks them (a run stopped halfway, a new vault).
    """
    files = source_files(entry)
    plan = classify(entry, files)
    if not plan.transcripts:
        raise ImportProblem("nie ma tu pliku z tekstem (.txt, .md, .vtt, .srt, .docx, .pdf)")
    recordings_dir, sessions_dir = vault / "Recordings", vault / "Sessions"

    def original(path: Path) -> str:
        return entry.name if path == entry else f"{entry.name}/{path.relative_to(entry).as_posix()}"

    parts: list[_Part] = []
    for path in plan.transcripts:
        data = read_file(path)
        part = _Part(path, data, hashlib.sha256(data).hexdigest())
        part.known = state.done.get(part.sha)
        if part.known is None:
            part.remote = client.find_recording(part.sha)
            note = (part.remote or {}).get("note_name")
            if note and (recordings_dir / f"{note}.md").exists():  # imported before into this vault
                state.add(part.sha, note, str(part.remote.get("session_key") or ""), original(path))
                part.known = state.done[part.sha]
        parts.append(part)
    if all(p.known for p in parts):
        return ImportResult(str(parts[0].known.get("session", "")), [str(p.known.get("note", "")) for p in parts],
                            False, move_done(entry))
    todo = [p for p in parts if not p.known]
    transcripts = [read_transcript(p.path.name, p.data) for p in todo]
    summary_files = _side_files(plan.summaries, "summary")
    material_files = _side_files(plan.materials, "material")

    # When: the folder's (or file's) name, else a transcript file's name, else the oldest file time.
    names = [entry.name if entry.is_dir() else entry.stem] + [p.path.stem for p in todo]
    dates = [date_from_name(n) for n in names]
    when = next((d for d in dates if d), None)
    if when is not None and not when.has_time:  # a time given only in a file's name still counts
        when = next((d for d in dates if d and d.has_time and d.when.date() == when.when.date()), when)
    if when is not None:
        start, has_time = when.when, when.has_time
    else:
        start = datetime.fromtimestamp(min(p.path.stat().st_mtime for p in todo)).replace(microsecond=0)
        has_time = True
    own = date_from_name(names[0])
    title = clean_title(names[0], own.span if own else None) or clean_title(todo[0].path.stem) or "Import"
    language = guess_language(" ".join(t.text for t in transcripts))
    source = "youtube" if looks_like_youtube([entry.name] + [p.path.name for p in parts],
                                             [t.text for t in transcripts]) else "import"

    remote = next((p.remote for p in todo if p.remote), None)
    if remote and remote.get("session_key"):
        session = str(remote["session_key"])
    else:
        session = _unique(sessions_dir, f"{start:%Y-%m-%d %H-%M} {title}" if has_time
                          else f"{start:%Y-%m-%d} {title}", set())
    taken: set[str] = set()  # the transcript notes of this source
    stamp = f"{start:%Y-%m-%d %H-%M-%S}" if has_time else f"{start:%Y-%m-%d}"
    notes: list[tuple[int, str]] = []
    for n, p in enumerate(todo, 1):
        if p.remote and p.remote.get("note_name"):
            notes.append((int(p.remote.get("part") or n), str(p.remote["note_name"])))
            continue
        base = f"{stamp} {title}" if len(todo) == 1 else f"{stamp} {title} - {clean_title(p.path.stem) or n}"
        notes.append((n, _unique(recordings_dir, base, taken)))
    first = notes[0][1]
    summary_note = f"{first} ({INSTITUTION_SUMMARY})" if summary_files else None
    materials_note = f"{first} ({MATERIALS})" if material_files else None
    links = {k: v for k, v in (("institution_summary", summary_note), ("materials", materials_note)) if v}

    rec_ids: list[str | None] = []
    for p, tr, (part_no, note) in zip(todo, transcripts, notes):
        if p.remote:
            rec_ids.append(None)
            continue
        rec_ids.append(store_row(client, {
            "sha256": p.sha, "file_name": p.path.name, "note_name": note,
            "recorded_at": start.astimezone().isoformat(), "duration_seconds": round(tr.duration, 2),
            "session_key": session, "part": part_no, "model": f"import/{tr.kind}", "language": language,
            "segments": tr.segments, "raw_text": tr.text, "source": "import", "original_name": original(p.path),
        }))

    ensure_system_notes(vault)
    recordings_dir.mkdir(parents=True, exist_ok=True)
    sessions_dir.mkdir(parents=True, exist_ok=True)
    for p, tr, (part_no, note), rec_id in zip(todo, transcripts, notes, rec_ids):
        target = recordings_dir / f"{note}.md"
        if not target.exists():
            target.write_text(transcript_note(note, session, part_no, start, has_time, tr, original(p.path), p.sha,
                                              language, rec_id, source, links), encoding="utf-8")
    for kind, note, side in (("institution-summary", summary_note, summary_files),
                             ("materials", materials_note, material_files)):
        if note and not (recordings_dir / f"{note}.md").exists():
            (recordings_dir / f"{note}.md").write_text(side_note(kind, note, session, first, side), encoding="utf-8")
    snote = sessions_dir / f"{session}.md"
    if not snote.exists():
        started = f"{start:%Y-%m-%d %H-%M}" if has_time else f"{start:%Y-%m-%d}"
        snote.write_text(import_session_note(session, started, notes, source, entry.name, summary_note,
                                             materials_note, plan.stand_in), encoding="utf-8")
    for p, (_, note) in zip(todo, notes):
        state.add(p.sha, note, session, original(p.path))
    return ImportResult(session, [n for _, n in notes], True, move_done(entry))


# -- the watcher ----------------------------------------------------------------------


def _signature(entry: Path) -> tuple:
    """(name, size, mtime_ns) of everything in a source: when it stops changing, the copy is complete."""
    if entry.is_file():
        st = entry.stat()
        return ((entry.name, st.st_size, st.st_mtime_ns),)
    items = []
    for path in _walk(entry):
        st = path.stat()
        items.append((path.relative_to(entry).as_posix(), st.st_size, st.st_mtime_ns))
    return tuple(sorted(items))


class ImportWatcher:
    """Imports each file or folder in ``<vault>/Import/`` once it stopped changing for a minute.

    ``IntakeWorker`` calls ``scan`` every minute. The first scan also brings the
    vault's ``_SYSTEM`` notes to the current format and makes ``Import/``. A source
    that cannot be imported as it is gets one notification and is left alone until
    it changes; a network or file error is tried again in 10 minutes.
    """

    def __init__(self, vault: Path, client: KosClient, state: ImportState,
                 notify: Callable[[str], bool | None] | None = None) -> None:
        self.vault, self.client, self.state, self.notify = vault, client, state, notify
        self._ready = False
        self._sigs: dict[str, tuple] = {}
        self._problems: dict[str, tuple] = {}
        self._retry_after: dict[str, float] = {}
        self._unmoved: set[str] = set()  # imported, but still in Import/ (the move failed)

    @property
    def folder(self) -> Path:
        return self.vault / IMPORT_DIR

    def _tell(self, message: str) -> None:
        if self.notify is not None:
            self.notify(message)

    def scan(self, now: float) -> list[str]:
        """One look at Import/; the names of the sources imported."""
        if not self.vault.is_dir():  # a drive that is not mounted yet
            return []
        if not self._ready:
            try:
                ensure_system_notes(self.vault)
            except OSError as exc:
                log.warning("Could not prepare %s: %s", self.vault, exc)
                return []
            self._ready = True
        try:
            entries = sorted(self.folder.iterdir(), key=lambda p: _natural(p.name)) if self.folder.is_dir() else []
        except OSError:
            return []
        imported: list[str] = []
        present: set[str] = set()
        for entry in entries:
            name = entry.name
            if _ignored(name):
                continue
            try:
                if entry.is_file() and entry.suffix.lower() not in SUPPORTED:
                    continue
                sig = _signature(entry)
            except OSError:
                continue
            if not sig:
                continue
            present.add(name)
            stable = self._sigs.get(name) == sig and now - max(m for _, _, m in sig) / 1e9 >= SETTLE_SECONDS
            self._sigs[name] = sig
            if not stable or self._problems.get(name) == sig or now < self._retry_after.get(name, 0):
                continue
            try:
                result = import_source(entry, self.client, self.state, self.vault)
            except AuthRequired:
                raise
            except ImportProblem as exc:
                self._problems[name] = sig
                log.warning("Import %s skipped until it changes: %s", name, exc)
                self._tell(f"Import: nie mogę wczytać „{name}”: {exc}.")
                continue
            except Exception as exc:
                log.warning("Import %s failed (%s); retrying in 10 min", name, exc)
                self._retry_after[name] = now + RETRY_SECONDS
                continue
            if result.moved_to is None:
                self._retry_after[name] = now + RETRY_SECONDS
            if result.fresh:
                log.info("Import %s -> session %s (%s)", name, result.session, ", ".join(result.notes))
                imported.append(name)
                self._tell(f"Zaimportowano: {name}")
                if result.moved_to is None:
                    self._unmoved.add(name)
            elif result.moved_to is not None:
                log.info("Import %s was imported before; moved to %s", name, result.moved_to)
                if name not in self._unmoved:  # not news when it is the same import, moved late
                    self._tell(f"„{name}” był już zaimportowany: przeniesiony do Import/{DONE_DIR}")
                self._unmoved.discard(name)
        for book in (self._sigs, self._problems, self._retry_after):
            for gone in [k for k in book if k not in present]:
                del book[gone]
        return imported


# -- samples for the self-test and the tests --------------------------------------------


def sample_docx(paragraphs: list[str]) -> bytes:
    """A minimal Word file with these paragraphs."""
    body = "".join(f'<w:p><w:r><w:t xml:space="preserve">{escape(p)}</w:t></w:r></w:p>' for p in paragraphs)
    document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<w:document xmlns:w="{_W_NS}"><w:body>{body}</w:body></w:document>')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml",
                   '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/'
                   'package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/>'
                   '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-'
                   'officedocument.wordprocessingml.document.main+xml"/></Types>')
        z.writestr("word/document.xml", document)
    return buf.getvalue()


def sample_pdf(pages: list[list[str]]) -> bytes:
    """A minimal PDF with these lines of text on each page (Helvetica, Latin-1 characters only)."""
    def literal(text: str) -> str:
        return "(" + text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") + ")"

    objects = [b"<< /Type /Catalog /Pages 2 0 R >>",
               ("<< /Type /Pages /Kids [%s] /Count %d >>"
                % (" ".join(f"{4 + 2 * i} 0 R" for i in range(len(pages))), len(pages))).encode(),
               b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]
    for i, lines in enumerate(pages):
        stream = ("BT /F1 12 Tf 14 TL 72 720 Td " + " ".join(f"{literal(line)} Tj T*" for line in lines)
                  + " ET").encode("cp1252", "replace")
        objects.append(("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> "
                        f"/Contents {5 + 2 * i} 0 R >>").encode())
        objects.append(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for n, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % n + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % off for off in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


def self_check() -> None:
    """Reads a .docx and a .pdf made here: a frozen exe without pypdf (or zipfile's XML) fails CI."""
    got = docx_paragraphs(sample_docx(["Zdanie logiczne", "Zbiór spełnienia"]))
    if got != ["Zdanie logiczne", "Zbiór spełnienia"]:
        raise RuntimeError(f".docx read as {got!r}")
    pages = pdf_pages(sample_pdf([["Self-test line one.", "Line two."]]))
    if len(pages) != 1 or "Self-test line one." not in pages[0]:
        raise RuntimeError(f".pdf read as {pages!r}")
