import builtins
import hashlib
import io
import json
import os
import zipfile
from datetime import datetime
from pathlib import Path

import pytest

from mindsetforest_tracker import imports
from mindsetforest_tracker.auth import SupabaseAuth, Tokens
from mindsetforest_tracker.imports import (
    ImportProblem, ImportState, ImportWatcher, PdfUnavailable, classify, clean_title, date_from_name, decode_text,
    docx_paragraphs, guess_language, import_source, merge_cues, parse_cues, pdf_page_paragraphs, pdf_pages,
    pdf_paragraphs, read_transcript, sample_docx, sample_pdf, source_files, split_long, text_paragraphs,
    timed_paragraphs,
)
from mindsetforest_tracker.recordings import IntakeWorker, KosClient
from mindsetforest_tracker.sync import SyncError

NOW = 1_900_000_000.0


def write(path: Path, data, mtime: float = NOW - 3600) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, str):
        data = data.encode("utf-8")
    path.write_bytes(data)
    os.utime(path, (mtime, mtime))
    return path


# -- extractors ------------------------------------------------------------------------


def test_text_files_become_paragraphs_in_any_common_encoding():
    text = "Pierwszy akapit\nciągnie się dalej.\n\nDrugi akapit.\n\n\n  Trzeci.  \n"
    assert text_paragraphs(text) == ["Pierwszy akapit ciągnie się dalej.", "Drugi akapit.", "Trzeci."]
    # One utterance per line and not a single blank line: each line is a paragraph.
    assert text_paragraphs("Dzień dobry.\nDziś logika.\n\n") == ["Dzień dobry.", "Dziś logika."]
    # Markdown: frontmatter goes, headings and list items stand alone.
    md = "---\ntitle: x\n---\n# Logika\nWstęp\ndalej.\n\n- jeden\n- dwa\n  ciąg dalszy\n\n1. punkt\n2) drugi\n"
    assert text_paragraphs(md) == ["# Logika", "Wstęp dalej.", "- jeden", "- dwa ciąg dalszy", "1. punkt", "2) drugi"]
    assert text_paragraphs("   \n\n ") == []
    polish = "Zażółć gęślą jaźń.\r\nŁódź."
    assert decode_text(polish.encode("cp1250")) == "Zażółć gęślą jaźń.\nŁódź."  # Polish Windows
    assert decode_text(b"\xef\xbb\xbf" + polish.encode("utf-8")) == "Zażółć gęślą jaźń.\nŁódź."
    assert decode_text(polish.encode("utf-16")) == "Zażółć gęślą jaźń.\nŁódź."


def test_long_paragraphs_are_cut_at_sentence_ends_or_word_ends():
    sentence = "To jest zdanie o logice. "
    pieces = split_long((sentence * 100).strip(), limit=200)
    assert all(len(p) <= 200 for p in pieces) and all(p.endswith("logice.") for p in pieces)
    assert " ".join(pieces) == (sentence * 100).strip()
    words = " ".join(["słowo"] * 400)  # captions without punctuation
    pieces = split_long(words, limit=200)
    assert all(len(p) <= 400 for p in pieces) and " ".join(pieces) == words
    assert split_long("krótki") == ["krótki"]


VTT = """WEBVTT
Kind: captions
Language: pl

NOTE This is a comment
spanning lines

STYLE
::cue { color: yellow }

intro
00:00:00.000 --> 00:00:02.500 align:start position:0%
<v Jan Kowalski>Dzień dobry</v> państwu,

00:00:02.500 --> 00:00:05.000
dziś <c.highlight>zdania</c> logiczne &amp; zbiory.

00:05.000 --> 00:07.000
dziś zdania logiczne &amp; zbiory.
A teraz definicja<00:00:06.000><c> zdania.</c>

00:00:07.000 --> 00:00:10.000
To jest ważne, bo będzie na egzaminie, ale nie tylko tam.

01:00:00.000 --> 01:00:03.000
Koniec po godzinie.
"""


def test_vtt_cues_keep_their_times_and_lose_tags_and_rolling_repeats():
    cues = parse_cues(VTT)
    assert cues == [
        {"start": 0.0, "end": 2.5, "text": "Jan Kowalski: Dzień dobry państwu,"},
        {"start": 2.5, "end": 5.0, "text": "dziś zdania logiczne & zbiory."},
        {"start": 5.0, "end": 7.0, "text": "A teraz definicja zdania."},  # the rolled-over line is not repeated
        {"start": 7.0, "end": 10.0, "text": "To jest ważne, bo będzie na egzaminie, ale nie tylko tam."},
        {"start": 3600.0, "end": 3603.0, "text": "Koniec po godzinie."},
    ]
    # Joined into segments: a sentence end after 6 s closes one; a long gap never joins.
    assert merge_cues(cues) == [
        {"start": 0.0, "end": 7.0, "text": "Jan Kowalski: Dzień dobry państwu, dziś zdania logiczne & zbiory. "
                                           "A teraz definicja zdania."},
        {"start": 7.0, "end": 10.0, "text": "To jest ważne, bo będzie na egzaminie, ale nie tylko tam."},
        {"start": 3600.0, "end": 3603.0, "text": "Koniec po godzinie."},
    ]
    tr = read_transcript("wykład.vtt", VTT.encode("utf-8"))
    assert tr.timed and tr.kind == "vtt" and tr.duration == 3603.0 and len(tr.segments) == 3


def test_merged_segments_never_share_a_start_second_and_stay_under_20_s():
    cues = [{"start": i * 0.4, "end": i * 0.4 + 0.4, "text": f"w{i}"} for i in range(100)]  # no punctuation
    segs = merge_cues(cues)
    starts = [int(s["start"]) for s in segs]
    assert len(starts) == len(set(starts)) and all(s["end"] - s["start"] <= 20 for s in segs)
    assert " ".join(s["text"] for s in segs) == " ".join(c["text"] for c in cues)


SRT = """1
00:00:01,000 --> 00:00:03,200
<i>Good morning</i>, everyone.

2
00:00:03,200 --> 00:00:09,000
{\\an8}Today: sets &amp; logic.

3
01:02:03,500 --> 01:02:05,000
The end.
"""


def test_srt_cues_keep_hours_and_milliseconds():
    assert parse_cues(SRT) == [
        {"start": 1.0, "end": 3.2, "text": "Good morning, everyone."},
        {"start": 3.2, "end": 9.0, "text": "Today: sets & logic."},
        {"start": 3723.5, "end": 3725.0, "text": "The end."},
    ]
    tr = read_transcript("lecture.srt", SRT.encode("utf-8"))
    assert tr.timed and [s["start"] for s in tr.segments] == [1.0, 3723.5]


def test_captions_saved_as_txt_are_still_read_as_captions():
    assert read_transcript("napisy.txt", VTT.encode("utf-8")).timed
    assert read_transcript("napisy.txt", ("﻿" + SRT).encode("utf-8")).timed
    assert not read_transcript("notes.txt", b"Just text.\n\nMore text.").timed


def test_text_with_times_at_line_starts_keeps_the_times():
    youtube = "Transcript\n0:00\nhello everyone\n0:04\nwelcome to the course.\n0:09\ntoday we talk\nabout sets\n1:02:03\nthe end"
    cues = timed_paragraphs(text_paragraphs(youtube))
    assert cues == [
        {"start": 0.0, "end": 4.0, "text": "Transcript hello everyone"},
        {"start": 4.0, "end": 9.0, "text": "welcome to the course."},
        {"start": 9.0, "end": 3723.0, "text": "today we talk about sets"},
        {"start": 3723.0, "end": 3723.0, "text": "the end"},
    ]
    inline = ["[00:00:05] Dzień dobry.", "[00:01:10] Zaczynamy - logika.", "(00:02:00) Koniec.", "00:03:00 | Pytania"]
    assert [c["start"] for c in timed_paragraphs(inline)] == [5, 70, 120, 180]
    assert timed_paragraphs(inline)[1]["text"] == "Zaczynamy - logika."
    # Clock times out of order (an agenda) and the odd time in prose are not a transcript.
    assert timed_paragraphs(["14:00 Przerwa", "9:00 Start", "12:30 Obiad", "10:00 Wykład"]) is None
    assert timed_paragraphs(["Spotkanie o 12:30.", "Tekst.", "Tekst.", "Tekst.", "Tekst."]) is None
    docx = read_transcript("t.docx", sample_docx(["00:00:01 Pierwsze zdanie.", "00:00:20 Drugie.", "00:00:40 Trzecie."]))
    assert docx.timed and [s["start"] for s in docx.segments] == [1.0, 20.0, 40.0]


def docx_with(body: str) -> bytes:
    xml = ('<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/'
           f'wordprocessingml/2006/main"><w:body>{body}</w:body></w:document>')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", xml)
    return buf.getvalue()


def test_docx_paragraphs_with_tables_tabs_breaks_and_tracked_changes():
    assert docx_paragraphs(sample_docx(["Zdanie logiczne", "", "Zbiór & <spełnienia>"])) == [
        "Zdanie logiczne", "Zbiór & <spełnienia>"]
    body = (
        '<w:p><w:r><w:t>Ala </w:t></w:r><w:r><w:t>ma</w:t><w:tab/><w:t>kota</w:t></w:r></w:p>'
        '<w:p><w:r><w:t>Linia</w:t><w:br/><w:t>po złamaniu</w:t></w:r></w:p>'
        '<w:p><w:del><w:r><w:delText>usunięte</w:delText></w:r></w:del><w:r><w:t>zostaje</w:t></w:r></w:p>'
        '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>komórka 1</w:t></w:r></w:p></w:tc>'
        '<w:tc><w:p><w:r><w:t>komórka 2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
        '<w:p><w:r><w:t>Przed polem</w:t></w:r><w:r><w:txbxContent><w:p><w:r><w:t>w polu</w:t></w:r></w:p>'
        '</w:txbxContent></w:r></w:p>'
    )
    assert docx_paragraphs(docx_with(body)) == [
        "Ala ma kota", "Linia", "po złamaniu", "zostaje", "komórka 1", "komórka 2", "w polu", "Przed polem"]
    with pytest.raises(ImportProblem, match="uszkodzony"):
        docx_paragraphs(b"not a zip at all")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/other.xml", "<x/>")
    with pytest.raises(ImportProblem):
        docx_paragraphs(buf.getvalue())
    with pytest.raises(ImportProblem):
        docx_paragraphs(docx_with("<w:p><w:r><w:t>unclosed"))


def test_pdf_pages_join_wrapped_lines_and_drop_headers_and_page_numbers():
    pytest.importorskip("pypdf")
    pdf = sample_pdf([
        ["Logika - wyklad 2", "Zdanie logiczne to zdanie oznajmujace, o ktorym mozna jednoznacznie",
         "powiedziec, czy jest prawdziwe.", "Krotko.",
         "Ten akapit przechodzi na nastepna strone i jest dosc dlugi, a nawet", "1"],
        ["Logika - wyklad 2", "konczy sie dopiero tutaj.", "Strona 2 z 3"],
        ["Logika - wyklad 2", "Ostatnia strona.", "3"],
    ])
    pages = pdf_pages(pdf)
    assert len(pages) == 3 and "Zdanie logiczne" in pages[0]
    assert pdf_paragraphs(pages) == [
        "Zdanie logiczne to zdanie oznajmujace, o ktorym mozna jednoznacznie powiedziec, czy jest prawdziwe.",
        "Krotko.",
        "Ten akapit przechodzi na nastepna strone i jest dosc dlugi, a nawet konczy sie dopiero tutaj.",
        "Ostatnia strona.",
    ]
    slides = pdf_page_paragraphs(pages)  # materials keep their pages
    assert [n for n, _ in slides] == [1, 2, 3] and slides[1][1] == ["konczy sie dopiero tutaj."]
    tr = read_transcript("t.pdf", pdf)
    assert not tr.timed and [s["p"] for s in tr.segments] == [1, 2, 3, 4]
    assert tr.segments[0]["start"] is None and tr.duration == 0


def test_hyphenated_words_are_joined_across_lines():
    pytest.importorskip("pypdf")
    pages = pdf_pages(sample_pdf([["To jest bardzo dlugie zdanie ktore konczy sie slowem infor-",
                                   "matyka na nastepnej linii i trwa dalej az do konca."]]))
    assert pdf_paragraphs(pages) == ["To jest bardzo dlugie zdanie ktore konczy sie slowem informatyka na "
                                     "nastepnej linii i trwa dalej az do konca."]


def test_a_damaged_or_empty_pdf_is_a_problem_not_a_crash():
    pytest.importorskip("pypdf")
    with pytest.raises(ImportProblem, match="PDF"):
        pdf_pages(b"%PDF-1.4 garbage")
    with pytest.raises(ImportProblem, match="skan"):
        read_transcript("skan.pdf", sample_pdf([[]]))


def without_pypdf(monkeypatch):
    real = builtins.__import__

    def fake(name, *args, **kwargs):
        if name == "pypdf" or name.startswith("pypdf."):
            raise ImportError("No module named 'pypdf'")
        return real(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake)


def test_without_pypdf_pdfs_are_skipped_never_a_crash(monkeypatch):
    without_pypdf(monkeypatch)
    with pytest.raises(PdfUnavailable):
        pdf_pages(sample_pdf([["x"]]))
    with pytest.raises(ImportProblem):  # PdfUnavailable is an ImportProblem: the watcher leaves the file alone
        read_transcript("a.pdf", sample_pdf([["x"]]))


def test_language_is_guessed_from_common_words():
    assert guess_language("To jest wykład o logice, który nie jest trudny, ale trzeba się skupić, bo to ważne.") == "pl"
    assert guess_language("This is a lecture about logic and it is not hard, but you have to focus on what is said.") == "en"
    assert guess_language("x = 5") is None


# -- names, dates, grouping -------------------------------------------------------------


def test_dates_and_times_from_names():
    def when(name):
        found = date_from_name(name)
        return (found.when, found.has_time) if found else None

    assert when("Logika 2026-10-11 13-32") == (datetime(2026, 10, 11, 13, 32), True)
    assert when("Logika_2026-10-11_13.32") == (datetime(2026, 10, 11, 13, 32), True)
    assert when("2026.10.11 8h05 wykład") == (datetime(2026, 10, 11, 8, 5), True)
    assert when("Wykład 11.10.2026") == (datetime(2026, 10, 11), False)
    assert when("wyklad 1-10-2026 10-15") == (datetime(2026, 10, 1, 10, 15), True)
    assert when("bandicam 2026-10-07 14-03-12-123") == (datetime(2026, 10, 7, 14, 3, 12), True)
    assert when("Logika 2026-10-11 25-99 sala 3") == (datetime(2026, 10, 11), False)  # no such time
    for no_date in ("Logika wykład 3", "2026-13-01", "31.02.2026", "1999-01-01", "v12026-10-11", "20261011"):
        assert when(no_date) is None, no_date
    # The first date in the name wins.
    assert when("2026-10-11 powtórka z 2026-10-04") == (datetime(2026, 10, 11), False)


def test_titles_lose_the_date_and_what_breaks_links():
    name = "Logika - 2026-10-11 13-32 - wykład 3"
    assert clean_title(name, date_from_name(name).span) == "Logika - wykład 3"
    assert clean_title("Title [dQw4w9WgXcQ].en") == "Title (dQw4w9WgXcQ).en"
    assert clean_title('a#b^c|d:e*f?"g<h>i/j\\k') == "a b c d e f g h i j k"
    assert clean_title("logika_wyklad_3") == "logika wyklad 3"
    assert clean_title("2026-10-11", (0, 10)) == ""
    assert len(clean_title("słowo " * 40)) <= 80


def touch(folder: Path, *names: str) -> list[Path]:
    return [write(folder / n, f"tekst {n}") for n in names]


def test_a_folder_is_split_into_transcript_summary_and_materials(tmp_path):
    lecture = tmp_path / "Logika 2026-10-11"
    touch(lecture, "transkrypcja.vtt", "Podsumowanie wykładu.docx", "Slajdy.pdf", "notatki prowadzącego.docx",
          "SUMMARY by AI.txt", "~$transkrypcja.docx", "_moje.txt", ".hidden.txt", "obraz.png", "deep/a/b/c/x.txt")
    files = source_files(lecture)
    assert [f.relative_to(lecture).as_posix() for f in files] == [
        "notatki prowadzącego.docx", "Podsumowanie wykładu.docx", "Slajdy.pdf", "SUMMARY by AI.txt",
        "transkrypcja.vtt"]  # the deep file is 4 levels down
    plan = classify(lecture, files)
    assert [f.name for f in plan.transcripts] == ["transkrypcja.vtt"]
    assert [f.name for f in plan.summaries] == ["Podsumowanie wykładu.docx", "SUMMARY by AI.txt"]
    assert [f.name for f in plan.materials] == ["notatki prowadzącego.docx", "Slajdy.pdf"]
    assert plan.stand_in is None


def test_grouping_without_a_text_transcript(tmp_path):
    word = tmp_path / "Word only"
    touch(word, "Wykład 3.docx", "Prezentacja.pdf", "podsumowania.pdf")
    plan = classify(word, source_files(word))
    assert ([f.name for f in plan.transcripts], [f.name for f in plan.materials], [f.name for f in plan.summaries]) == (
        ["Wykład 3.docx"], ["Prezentacja.pdf"], ["podsumowania.pdf"])
    named = tmp_path / "Named"
    touch(named, "Transcript.pdf", "Lecture notes.docx")
    plan = classify(named, source_files(named))
    assert [f.name for f in plan.transcripts] == ["Transcript.pdf"] and [f.name for f in plan.materials] == [
        "Lecture notes.docx"]
    only_summary = tmp_path / "Only summary"
    touch(only_summary, "Podsumowanie.pdf", "Slajdy.pdf")
    plan = classify(only_summary, source_files(only_summary))
    assert ([f.name for f in plan.transcripts], [f.name for f in plan.materials], plan.stand_in) == (
        ["Podsumowanie.pdf"], ["Slajdy.pdf"], "summary")
    slides = tmp_path / "Slides only"
    touch(slides, "Slajdy 2.pdf", "Slajdy 10.pdf")
    plan = classify(slides, source_files(slides))
    assert [f.name for f in plan.transcripts] == ["Slajdy 2.pdf", "Slajdy 10.pdf"] and plan.stand_in == "materials"
    single = write(tmp_path / "Podsumowanie samo.txt", "x")
    assert classify(single, source_files(single)).transcripts == [single]  # one file is always the transcript


# -- end to end ---------------------------------------------------------------------------


class FakeResp:
    def __init__(self, status, body):
        self.status_code, self._body, self.text = status, body, json.dumps(body)

    def json(self):
        return self._body


class FakeServer:
    """kos_recordings over PostgREST: the lookup by sha256 and inserts."""

    def __init__(self, columns=True):
        self.rows, self.posts, self.columns = [], [], columns

    def request(self, method, url, headers=None, json=None, timeout=None):
        if method == "GET":
            sha = url.split("sha256=eq.", 1)[1].split("&", 1)[0]
            return FakeResp(200, [r for r in self.rows if r["sha256"] == sha][:1])
        assert method == "POST" and "/rest/v1/kos_recordings" in url
        self.posts.append(json)
        if not self.columns and "source" in json:
            return FakeResp(400, {"code": "PGRST204", "message": "Could not find the 'original_name' column of "
                                                                  "'kos_recordings' in the schema cache"})
        self.rows.append(json)
        return FakeResp(201, [{"id": f"rec-{len(self.rows)}"}])


def client_for(tmp_path, server):
    auth = SupabaseAuth("https://p.supabase.co", "anon", tmp_path / "s.bin", http=None, clock=lambda: 0.0)
    auth.tokens = Tokens("acc", "ref", "user-1", 1e12, "a@b.c")
    return KosClient("https://p.supabase.co", "anon", auth, http=server)


class World:
    def __init__(self, tmp_path, columns=True):
        self.tmp = tmp_path
        self.vault = tmp_path / "Vault"
        self.vault.mkdir()
        self.server = FakeServer(columns)
        self.client = client_for(tmp_path, self.server)
        self.state = ImportState.load(tmp_path / "imports.json")
        self.told: list[str] = []
        self.watcher = ImportWatcher(self.vault, self.client, self.state, notify=self.told.append)

    @property
    def inbox(self) -> Path:
        return self.vault / "Import"

    def settle(self, now=NOW):
        """Two looks a minute apart, as the worker does: the second one imports what did not change."""
        first = self.watcher.scan(now)
        return first + self.watcher.scan(now + 60)

    def read(self, rel: str) -> str:
        return (self.vault / rel).read_text(encoding="utf-8")


def test_a_lecture_folder_becomes_a_session_with_summary_and_materials(tmp_path):
    w = World(tmp_path)
    w.watcher.scan(NOW - 120)  # the first look makes Import/ with its how-to
    assert (w.inbox / "_jak to działa.md").is_file()
    folder = w.inbox / "Logika 2026-10-11 13-32"
    write(folder / "transkrypcja.vtt", VTT)
    write(folder / "Podsumowanie wykładu.docx", sample_docx(["Wykład dotyczył zdań logicznych.", "I zbiorów."]))
    write(folder / "Notatki.docx", sample_docx(["Slajd 1: zdanie logiczne", "Slajd 2: zbiory"]))
    write(folder / "obraz.png", b"\x89PNG")
    assert w.settle() == ["Logika 2026-10-11 13-32"]

    session = "2026-10-11 13-32 Logika"
    note = "2026-10-11 13-32-00 Logika"
    [row] = w.server.rows
    assert row["source"] == "import" and row["original_name"] == "Logika 2026-10-11 13-32/transkrypcja.vtt"
    assert row["session_key"] == session and row["note_name"] == note and row["part"] == 1
    assert row["model"] == "import/vtt" and row["language"] == "pl" and row["duration_seconds"] == 3603.0
    assert row["user_id"] == "user-1" and row["recorded_at"].startswith("2026-10-11T13:32:00")
    assert [s["start"] for s in row["segments"]] == [0.0, 7.0, 3600.0]
    assert row["raw_text"].startswith("Jan Kowalski: Dzień dobry")

    transcript = w.read(f"Recordings/{note}.md")
    assert "type: recording" in transcript and "source: import" in transcript and "anchors: time" in transcript
    assert f'session: "[[Sessions/{session}]]"' in transcript and "recording_id: rec-1" in transcript
    assert f'institution_summary: "[[Recordings/{note} (podsumowanie uczelni)]]"' in transcript
    assert "**[01:00:00]** Koniec po godzinie. ^t3600" in transcript
    summary = w.read(f"Recordings/{note} (podsumowanie uczelni).md")
    assert "type: institution-summary" in summary and "Wykład dotyczył zdań logicznych.\n\nI zbiorów." in summary
    materials = w.read(f"Recordings/{note} (materiały).md")
    assert "type: materials" in materials and "## Notatki.docx" in materials and "Slajd 2: zbiory" in materials

    snote = w.read(f"Sessions/{session}.md")
    assert snote.startswith("---\ntype: session\nstatus: new\nstarted: 2026-10-11 13-32\nparts: 1\nsource: import\n")
    assert f"- Part 1: [[Recordings/{note}]]" in snote and "## Imported with it" in snote
    assert f"[[Recordings/{note} (podsumowanie uczelni)]]" in snote and f"[[Recordings/{note} (materiały)]]" in snote

    # The source is kept, moved out of the way; the PC remembers the transcript's hash.
    assert not folder.exists() and (w.inbox / "_done" / "Logika 2026-10-11 13-32" / "obraz.png").is_file()
    assert w.told == ["Zaimportowano: Logika 2026-10-11 13-32"]
    saved = json.loads((tmp_path / "imports.json").read_text(encoding="utf-8"))
    assert [v["note"] for v in saved.values()] == [note]
    assert (w.vault / "_SYSTEM" / "routine-prompt.md").is_file()
    assert w.watcher.scan(NOW + 120) == []  # nothing left


def test_a_text_without_times_gets_paragraph_anchors_and_a_date_only_name(tmp_path):
    w = World(tmp_path)
    write(w.inbox / "Wykład 11.10.2026.docx", sample_docx(["Pierwszy akapit wykładu.", "Drugi akapit."]))
    assert w.settle() == ["Wykład 11.10.2026.docx"]
    [row] = w.server.rows
    assert row["session_key"] == "2026-10-11 Wykład" and row["note_name"] == "2026-10-11 Wykład"
    assert row["duration_seconds"] == 0 and row["model"] == "import/docx"
    assert row["segments"] == [{"p": 1, "start": None, "end": None, "text": "Pierwszy akapit wykładu."},
                               {"p": 2, "start": None, "end": None, "text": "Drugi akapit."}]
    transcript = w.read("Recordings/2026-10-11 Wykład.md")
    assert "**[¶2]** Drugi akapit. ^p0002" in transcript and "anchors: paragraph" in transcript
    assert "recorded_at: 2026-10-11\n" in transcript and "duration: 00:00:00" in transcript
    snote = w.read("Sessions/2026-10-11 Wykład.md")
    assert "started: 2026-10-11\n" in snote and "## Imported with it" not in snote
    assert (w.inbox / "_done" / "Wykład 11.10.2026.docx").is_file()


def test_without_a_date_in_the_name_the_file_time_counts(tmp_path):
    w = World(tmp_path)
    mtime = datetime(2026, 9, 30, 18, 5, 7).timestamp()
    write(w.inbox / "Course intro.md", "# Intro\n\nThis is the course and it is about sets, so what you "
                                       "learn here is what we use later.", mtime=mtime)
    assert w.settle() == ["Course intro.md"]
    [row] = w.server.rows
    assert row["session_key"] == "2026-09-30 18-05 Course intro"
    assert row["note_name"] == "2026-09-30 18-05-07 Course intro" and row["language"] == "en"


def test_a_time_given_only_in_the_file_name_completes_the_folders_date(tmp_path):
    w = World(tmp_path)
    write(w.inbox / "Logika 2026-10-11" / "nagranie 2026-10-11 09-15.srt", SRT)
    w.settle()
    assert w.server.rows[0]["session_key"] == "2026-10-11 09-15 Logika"


def test_several_transcripts_in_a_folder_are_parts_of_one_session(tmp_path):
    w = World(tmp_path)
    folder = w.inbox / "Kurs 2026-10-12"
    write(folder / "Part 10.srt", SRT)
    write(folder / "Part 2.vtt", VTT)
    w.settle()
    assert [(r["part"], r["note_name"]) for r in w.server.rows] == [
        (1, "2026-10-12 Kurs - Part 2"), (2, "2026-10-12 Kurs - Part 10")]
    assert {r["session_key"] for r in w.server.rows} == {"2026-10-12 Kurs"}
    snote = w.read("Sessions/2026-10-12 Kurs.md")
    assert "parts: 2" in snote and "- Part 2: [[Recordings/2026-10-12 Kurs - Part 10]]" in snote


def test_the_same_file_twice_is_imported_once(tmp_path):
    w = World(tmp_path)
    write(w.inbox / "a.srt", SRT)
    w.settle()
    write(w.inbox / "a.srt", SRT)  # the same file again, and under another name
    write(w.inbox / "copy of a.srt", SRT)
    w.told.clear()
    assert w.settle(NOW + 600) == []
    assert len(w.server.posts) == 1 and len(list((w.vault / "Sessions").glob("*.md"))) == 1
    assert sorted(p.name for p in (w.inbox / "_done").iterdir()) == ["a (2).srt", "a.srt", "copy of a.srt"]
    assert w.told == ["„a.srt” był już zaimportowany: przeniesiony do Import/_done",
                      "„copy of a.srt” był już zaimportowany: przeniesiony do Import/_done"]


def test_a_transcript_the_server_already_has_is_not_stored_again(tmp_path):
    w = World(tmp_path)
    data = SRT.encode("utf-8")
    sha = hashlib.sha256(data).hexdigest()
    # Another PC imported it, or this one stopped between storing it and writing the notes.
    w.server.rows.append({"sha256": sha, "note_name": "2026-10-01 Lecture", "session_key": "2026-10-01 Lecture",
                          "part": 1})
    write(w.inbox / "lecture.srt", data)
    w.settle()
    assert w.server.posts == []
    assert "^t3723" in w.read("Recordings/2026-10-01 Lecture.md") and w.read("Sessions/2026-10-01 Lecture.md")
    assert "recording_id: \n" in w.read("Recordings/2026-10-01 Lecture.md")
    # Once the notes are there, the server's copy is enough: nothing is written or stored.
    write(w.inbox / "again.srt", data)
    fresh = World.__new__(World)
    fresh.__dict__.update(w.__dict__)
    fresh.state = ImportState.load(tmp_path / "other.json")
    fresh.watcher = ImportWatcher(w.vault, w.client, fresh.state, notify=w.told.append)
    (w.vault / "Sessions" / "2026-10-01 Lecture.md").write_text("processed by the routine", encoding="utf-8")
    fresh.settle(NOW + 600)
    assert w.server.posts == [] and w.read("Sessions/2026-10-01 Lecture.md") == "processed by the routine"
    assert (w.inbox / "_done" / "again.srt").is_file() and sha in fresh.state.done


def test_a_server_without_the_new_columns_still_gets_the_import(tmp_path, caplog):
    w = World(tmp_path, columns=False)
    write(w.inbox / "a.txt", "Akapit pierwszy.\n\nAkapit drugi.")
    with caplog.at_level("WARNING"):
        w.settle()
    assert len(w.server.posts) == 2 and "source" in w.server.posts[0] and "source" not in w.server.posts[1]
    assert w.server.rows[0]["note_name"].endswith(" a") and any("20261015120000" in r.getMessage() for r in caplog.records)


def test_a_source_still_being_copied_waits(tmp_path):
    w = World(tmp_path)
    folder = w.inbox / "Logika"
    write(folder / "a.vtt", VTT)
    assert w.watcher.scan(NOW) == []
    write(folder / "b.pdf", b"%PDF-partial", mtime=NOW - 3000)  # another file arrived
    assert w.watcher.scan(NOW + 60) == []
    write(w.inbox / "fresh.txt", "Tekst.\n\nDalej.", mtime=NOW + 100)  # written seconds ago
    assert w.watcher.scan(NOW + 120) == ["Logika"]
    assert w.watcher.scan(NOW + 130) == []  # unchanged, but not a minute old yet
    assert w.watcher.scan(NOW + 160) == ["fresh.txt"]


def test_a_source_that_cannot_be_read_is_reported_once_and_waits_for_a_change(tmp_path):
    w = World(tmp_path)
    write(w.inbox / "empty.txt", "   \n\n")
    write(w.inbox / "only pictures" / "a.png", b"\x89PNG")
    assert w.settle() == []
    assert sorted(w.told) == [
        "Import: nie mogę wczytać „empty.txt”: brak tekstu.",
        "Import: nie mogę wczytać „only pictures”: nie ma tu pliku z tekstem (.txt, .md, .vtt, .srt, .docx, .pdf).",
    ]
    assert w.settle(NOW + 600) == [] and len(w.told) == 2  # not again
    write(w.inbox / "empty.txt", "Teraz jest tekst.", mtime=NOW + 600)
    assert w.settle(NOW + 700) == ["empty.txt"]
    assert (w.inbox / "only pictures").is_dir()  # left where it was


def test_a_lone_pdf_without_pypdf_waits_and_a_pdf_beside_a_transcript_is_skipped(tmp_path, monkeypatch, caplog):
    without_pypdf(monkeypatch)
    w = World(tmp_path)
    write(w.inbox / "slides only.pdf", sample_pdf([["x"]]))
    folder = w.inbox / "Logika"
    write(folder / "t.txt", "Treść wykładu.\n\nDalej.")
    write(folder / "Slajdy.pdf", sample_pdf([["x"]]))
    with caplog.at_level("WARNING"):
        assert w.settle() == ["Logika"]
    assert any("Slajdy.pdf skipped: PDFs need pypdf" in r.getMessage() for r in caplog.records)
    assert not list((w.vault / "Recordings").glob("*materiały*"))
    assert (w.inbox / "slides only.pdf").is_file()
    assert w.told == ["Zaimportowano: Logika",
                      "Import: nie mogę wczytać „slides only.pdf”: do plików PDF potrzebny jest pakiet pypdf."]


def test_a_file_that_cannot_be_moved_is_moved_later_without_a_second_import(tmp_path, monkeypatch):
    w = World(tmp_path)
    write(w.inbox / "a.srt", SRT)
    real = Path.rename
    locked = [True]

    def rename(self, target):
        if locked[0] and self.name == "a.srt":
            raise PermissionError("in use")
        return real(self, target)

    monkeypatch.setattr(Path, "rename", rename)
    assert w.settle() == ["a.srt"] and (w.inbox / "a.srt").is_file()
    locked[0] = False
    assert w.watcher.scan(NOW + 300) == []  # waits 10 minutes before trying again
    assert (w.inbox / "a.srt").is_file()
    assert w.watcher.scan(NOW + 60 + 601) == [] and (w.inbox / "_done" / "a.srt").is_file()
    assert len(w.server.posts) == 1
    assert w.told == ["Zaimportowano: a.srt"]  # the late move is not announced as a second import


def test_network_errors_are_retried_in_ten_minutes(tmp_path):
    w = World(tmp_path)
    write(w.inbox / "a.srt", SRT)
    calls = []

    def broken(*a, **k):
        calls.append(1)
        raise SyncError("network error: down")

    real = w.client.find_recording
    w.client.find_recording = broken
    assert w.settle() == [] and len(calls) == 1
    w.client.find_recording = real
    assert w.watcher.scan(NOW + 300) == []
    assert w.watcher.scan(NOW + 60 + 600) == ["a.srt"]


def test_youtube_captions_are_marked_for_the_routine(tmp_path):
    w = World(tmp_path)
    write(w.inbox / "Linear algebra lecture [dQw4w9WgXcQ].en.vtt", VTT)
    w.settle()
    session = w.server.rows[0]["session_key"]
    assert w.server.rows[0]["source"] == "youtube"
    assert "source: youtube" in w.read(f"Sessions/{session}.md")
    assert session.endswith("Linear algebra lecture (dQw4w9WgXcQ).en")


def test_a_folder_with_only_the_institutions_summary_says_so(tmp_path):
    w = World(tmp_path)
    write(w.inbox / "Logika 2026-10-11" / "Podsumowanie.txt", "Wykład był o zdaniach.\n\nI o zbiorach.")
    w.settle()
    snote = w.read("Sessions/2026-10-11 Logika.md")
    assert "No transcript came with it: the parts above are the institution's summary." in snote


def test_names_never_clash_with_notes_already_in_the_vault(tmp_path):
    w = World(tmp_path)
    write(w.vault / "Sessions" / "2026-10-11 Logika.md", "an older session")
    write(w.vault / "Recordings" / "2026-10-11 Logika.md", "an older transcript")
    write(w.inbox / "Logika 2026-10-11.txt", "Nowy tekst.\n\nDalej.")
    w.settle()
    assert w.server.rows[0]["session_key"] == "2026-10-11 Logika (2)"
    assert w.server.rows[0]["note_name"] == "2026-10-11 Logika (2)"
    assert w.read("Sessions/2026-10-11 Logika.md") == "an older session"


def test_the_import_state_survives_damage(tmp_path):
    path = tmp_path / "imports.json"
    path.write_text("[1, 2]", encoding="utf-8")
    assert ImportState.load(path).done == {}
    path.write_text('{"abc": {"note": "n"}, "bad": 3}', encoding="utf-8")
    assert ImportState.load(path).done == {"abc": {"note": "n"}}
    assert ImportState.load(tmp_path / "missing.json").done == {}


def test_import_source_raises_for_an_unreadable_source(tmp_path):
    w = World(tmp_path)
    with pytest.raises(ImportProblem):
        import_source(write(w.inbox / "x.txt", ""), w.client, w.state, w.vault)


class SignedIn:
    class auth:
        user_id = "user-1"


class SignedOut:
    class auth:
        user_id = None


def test_the_worker_imports_only_when_signed_in(tmp_path):
    looks = []

    class Importer:
        def scan(self, now):
            looks.append(now)
            return ["x"]

    worker = IntakeWorker(None, tmp_path, 20, SignedIn(), None, importer=Importer())
    assert worker.import_files(5.0) == ["x"] and looks == [5.0]
    assert IntakeWorker(None, tmp_path, 20, SignedOut(), None, importer=Importer()).import_files(6.0) == []
    assert IntakeWorker(None, tmp_path, 20, SignedIn(), None).import_files(7.0) == []
    assert looks == [5.0]


def test_the_self_check_reads_a_docx_and_a_pdf():
    pytest.importorskip("pypdf")
    imports.self_check()


def test_repeated_sentences_inside_pages_are_the_lecture_not_headers():
    pytest.importorskip("pypdf")
    body = ["Logika - wyklad 2", "Prowadzacy: Zaczynamy.", "To jest wazne.", "Rok 1989 byl przelomowy.", "Prowadzacy: Tak.",
            "Dalsza czesc wykladu na tej stronie.", "1"]
    pages = pdf_pages(sample_pdf([body, [*body[:-1], "2"], [*body[:-1], "3"]]))
    text = " ".join(pdf_paragraphs(pages))
    assert text.count("To jest wazne.") == 3 and text.count("Prowadzacy: Tak.") == 3 and "1989" in text
    assert "Logika - wyklad 2" not in text  # the running header at the top still goes


def test_a_transcript_named_like_a_summary_is_still_the_transcript(tmp_path):
    folder = tmp_path / "Wyklad 15"
    vtt = write(folder / "Wyklad 15 - podsumowanie kursu - transkrypcja.vtt", VTT)
    ai = write(folder / "Podsumowanie AI.docx", sample_docx(["Podsumowanie."]))
    plan = classify(folder, source_files(folder))
    assert plan.transcripts == [vtt] and plan.summaries == [ai] and plan.stand_in is None


def test_the_same_file_twice_in_a_folder_is_one_part(tmp_path):
    w = World(tmp_path)
    write(w.inbox / "Logika" / "transkrypcja.txt", "Akapit pierwszy.\n\nAkapit drugi.")
    write(w.inbox / "Logika" / "transkrypcja (1).txt", "Akapit pierwszy.\n\nAkapit drugi.")
    w.settle()
    assert len(w.server.posts) == 1


def test_a_file_known_locally_is_imported_again_into_a_vault_without_its_notes(tmp_path):
    w = World(tmp_path)
    write(w.inbox / "lecture.txt", "Akapit pierwszy.\n\nAkapit drugi.")
    w.settle()
    note = w.server.rows[0]["note_name"]
    # The user removed the notes to redo the import (or switched vaults): the same file comes back.
    (w.vault / "Recordings" / f"{note}.md").unlink()
    write(w.inbox / "lecture again.txt", "Akapit pierwszy.\n\nAkapit drugi.")
    w.settle(NOW + 600)
    assert (w.vault / "Recordings" / f"{note}.md").is_file()  # rebuilt from the server's row
    assert len(w.server.posts) == 1  # and not stored twice


def test_word_text_boxes_and_moved_paragraphs_are_read_once():
    import io as _io
    import zipfile as _zip
    w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    mc = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
    box = '<w:txbxContent><w:p><w:r><w:t>W ramce</w:t></w:r></w:p></w:txbxContent>'
    body = (f'<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps">{box}</mc:Choice>'
            f'<mc:Fallback>{box}</mc:Fallback></mc:AlternateContent></w:r></w:p>'
            '<w:p><w:moveFrom><w:r><w:t>Przeniesiony</w:t></w:r></w:moveFrom></w:p>'
            '<w:p><w:moveTo><w:r><w:t>Przeniesiony</w:t></w:r></w:moveTo></w:p>')
    doc = f'<?xml version="1.0"?><w:document {w} {mc}><w:body>{body}</w:body></w:document>'
    buf = _io.BytesIO()
    with _zip.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", doc)
    assert docx_paragraphs(buf.getvalue()) == ["W ramce", "Przeniesiony"]


def test_an_unsupported_file_is_reported_once(tmp_path):
    w = World(tmp_path)
    write(w.inbox / "Wyklad 3.pptx", b"PK fake")
    w.settle()
    w.settle(NOW + 600)
    told = [m for m in w.told if "Wyklad 3.pptx" in m]
    assert len(told) == 1 and ".docx" in told[0] and w.server.posts == []
