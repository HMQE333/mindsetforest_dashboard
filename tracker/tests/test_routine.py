"""The routine's instructions in the vault (format 2), their upgrade, and what the mirror sends."""
import json
import re
from datetime import datetime
from pathlib import Path

from mindsetforest_tracker import recordings
from mindsetforest_tracker.recordings import (
    MIRROR_FILES, ROUTINE, RULES, SHIPPED_TEXTS, VaultMirror, ensure_system_notes, log_excerpt, text_hash,
    vault_notes,
)
from test_recordings import FakeVaultServer, mirror_for

FIXTURES = Path(__file__).parent / "fixtures"
WHEN = datetime(2026, 10, 15, 14, 3)


def sysdir(vault: Path) -> Path:
    return vault / "_SYSTEM"


def put(vault: Path, name: str, data: bytes) -> Path:
    p = sysdir(vault) / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    return p


# -- what the tracker ships ---------------------------------------------------------------


def test_every_text_an_older_tracker_wrote_is_recognised_as_its_own():
    for name, files in (("routine-prompt.md", ("routine-prompt-v0.md", "routine-prompt-v1.md",
                                               "routine-prompt-v2.md")),
                        ("processing-rules.md", ("processing-rules-v0.md", "processing-rules-v1.md"))):
        for f in files:
            assert text_hash((FIXTURES / f).read_text(encoding="utf-8")) in SHIPPED_TEXTS[name], f
    # Line ends, a BOM and trailing spaces from an editor do not make it "edited".
    v1 = (FIXTURES / "routine-prompt-v1.md").read_text(encoding="utf-8")
    assert text_hash("﻿" + v1.replace("\n", "  \r\n") + "\r\n") in SHIPPED_TEXTS["routine-prompt.md"]
    assert text_hash(v1 + "\nMy own line.") not in SHIPPED_TEXTS["routine-prompt.md"]
    # The current texts are never "shipped before": that would replace them on every start.
    assert text_hash(ROUTINE) not in SHIPPED_TEXTS["routine-prompt.md"]
    assert text_hash(RULES) not in SHIPPED_TEXTS["processing-rules.md"]
    # The first format-2 prompt (the fixture) is format 2 too: only its hash marks it as a default.
    assert "kos-format: 2" in (FIXTURES / "routine-prompt-v2.md").read_text(encoding="utf-8")


def test_the_routine_prompt_describes_format_2():
    for needed in (
        "kos-format: 2", "routine.lock", "processed_parts", "status: new", "_SYSTEM/merged/", "Never delete",
        "Lectures/<Course>/<YYYY-MM-DD> <Topic>.md", "type: lecture-summary", "language: pl", "source: recording",
        "## W skrócie", "[`## In short`]", "## Na co prowadzący kładł nacisk", "[`## What the lecturer stressed`]",
        "## Do wyjaśnienia", "[`## To clarify`]", "## Pojęcia", "[`## Concepts`]",
        "> [!note]- Słowniczek PL ↔ EN", "> [!note]- Glossary EN ↔ PL",
        "> [!example]- Przykład", "> [!tip]- Dla zrozumienia (AI)", "> [!tip]- For understanding (AI)",
        "> [!abstract]- Wizualizacja", "> [!abstract]- Visualisation", "```plot", "```plot3d", "mermaid",
        "^pNNNN", "**[¶N]** text ^pNNNN", "podsumowanie uczelni", "The transcript is the truth",
        "at most 15 new notes per hour", "at most 5 for a source", "aliases", "Never write a `[[link]]`",
        "last_run:", "- problems: none", "Import/",
        # The lecture map, what to memorise, the course textbook.
        "## Mapa wykładu", "[`## Lecture map`]", "At most 15", "> [!important]- Do zapamiętania",
        "> [!important]- To memorise", "Leave the callout out when nothing qualifies",
        "Lectures/<Course>/_Podręcznik.md", "Lectures/<Course>/_Textbook.md", "type: course-textbook",
        "_SYSTEM/primer-prompt.md", "## Mapa przedmiotu", "## Pytania sprawdzające", "8-12", "2500-5000 words",
        "at most one per run", "Never\n  `Inne` / `Other`", "- textbook: none",
    ):
        assert needed in ROUTINE, needed
    assert "kos-format: 2" in RULES and "_SYSTEM/routine-prompt.md" in RULES
    # The plot and plot3d samples in the prompt are the contract's, and valid.
    instructions = ROUTINE.split("## Worked example")[0]
    blocks = re.findall(r"```(plot3d|plot)\n(.*?)\n\s*```", instructions, re.S)
    kinds = [k for k, _ in blocks]
    assert "plot" in kinds and "plot3d" in kinds
    for kind, body in blocks:
        body = "\n".join(line.strip() for line in body.split("\n"))
        objects = [json.loads(line) for line in body.split("\n")] if kind == "plot3d" else [json.loads(body)]
        for obj in objects:
            check_expressions(obj)


ALLOWED = {"x", "y", "pi", "e", "sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "abs", "exp", "ln", "log",
           "floor", "ceil"}


def check_expressions(obj: dict) -> None:
    exprs = [obj["expr"]] if "expr" in obj else [f["expr"] for f in obj.get("functions", [])]
    for expr in exprs:
        assert set(re.findall(r"[A-Za-z_]+", expr)) <= ALLOWED, expr
        assert re.fullmatch(r"[0-9A-Za-z_.+\-*/^() ]+", expr), expr


def check_lecture_map(text: str) -> None:
    """The "Mapa wykładu" section: one mermaid flowchart outside any callout, at most 15 nodes, then <= 2 lines."""
    section = re.search(r"(?m)^## Mapa wykładu\n(.*?)(?=^## )", text, re.S).group(1).strip()
    block, after = re.fullmatch(r"```mermaid\n(.*?)\n```\n?(.*)", section, re.S).groups()
    assert not any(line.startswith(">") for line in section.split("\n"))
    assert 1 <= len([line for line in after.split("\n") if line.strip()]) <= 2
    lines = block.split("\n")
    assert lines[0] in ("flowchart LR", "flowchart TD")
    ids = set()
    for line in lines[1:]:
        for part in line.split("-->"):
            m = re.fullmatch(r'\s*(?:\|[^|]+\|\s*)?([A-Za-z][A-Za-z0-9]*)(\["[^"]+"\])?\s*', part)
            assert m, line  # a plain id, an optional quoted label, an optional |label| on the arrow
            ids.add(m.group(1))
    assert 3 <= len(ids) <= 15


def worked_example() -> str:
    return re.search(r"````markdown\n(.*?)\n````", ROUTINE, re.S).group(1)


def test_the_worked_example_is_a_complete_summary_in_one_language():
    text = worked_example()
    front = re.match(r"---\n(.*?)\n---\n", text, re.S).group(1)
    fields = dict(line.split(": ", 1) for line in front.split("\n"))
    assert fields == {"type": "lecture-summary", "course": '"Logika"', "topic": '"Zdania logiczne i zbiory"',
                      "date": "2026-10-11", "language": "pl", "sessions": '["[[Sessions/2026-10-11 13-32]]"]',
                      "source": "recording"}
    headings = re.findall(r"(?m)^## (.+?)(?: \[\[.*)?$", text)
    assert headings == ["W skrócie", "Mapa wykładu", "1. Zdanie logiczne", "2. Spójniki i tabele prawdy",
                        "3. Zbiory i działania na zbiorach", "4. Funkcja zdaniowa i zbiór spełnienia",
                        "Na co prowadzący kładł nacisk", "Do wyjaśnienia", "Pojęcia"]
    assert text.rstrip().split("\n")[-11] == "> [!note]- Słowniczek PL ↔ EN"  # the glossary comes last
    # "Do zapamiętania" right after the concept links, before the glossary; each line cites its moment.
    concepts = text.split("\n## Pojęcia\n", 1)[1]
    links, memorise, glossary = concepts.strip().split("\n\n")
    assert all(re.fullmatch(r"- \[\[[^\]]+\]\]", line) for line in links.split("\n"))
    memorise = memorise.split("\n")
    assert memorise[0] == "> [!important]- Do zapamiętania" and 3 <= len(memorise) - 1 <= 10
    assert all(re.fullmatch(r"> - .+ \[\[Recordings/[^\]]+#\^t\d{4}\|[\d:]+\]\]", line) for line in memorise[1:])
    assert glossary.startswith("> [!note]- Słowniczek PL ↔ EN")
    # Every callout is folded, and at most 2 "for understanding" per section.
    callouts = re.findall(r"(?m)^> \[!(\w+)\](.?)", text)
    assert callouts and all(fold == "-" for _, fold in callouts)
    for section in re.split(r"(?m)^## ", text):
        assert section.count("[!tip]- Dla zrozumienia (AI)") <= 2
    # Each anchor's label is its own time (12:34 for ^t0754), as the dashboard shows it.
    anchors = re.findall(r"#\^t(\d{4})\|([\d:]+)\]\]", text)
    assert len(anchors) >= 8
    for seconds, label in anchors:
        s = int(seconds)
        h, m, sec = s // 3600, s % 3600 // 60, s % 60
        assert label == (f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"), (seconds, label)
    # The visualisations parse.
    for body in re.findall(r"> ```plot\n(.*?)\n> ```", text, re.S):
        check_expressions(json.loads(body.replace("\n> ", "\n").removeprefix("> ")))
    assert "> ```mermaid" in text
    check_lecture_map(text)
    # English appears only in the glossary.
    body, glossary = text.split("> [!note]- Słowniczek PL ↔ EN")
    for english in ("proposition", "conjunction", "disjunction", "intersection"):
        assert english not in body and english in glossary


# -- the upgrade ----------------------------------------------------------------------------


def test_a_new_vault_gets_format_2_and_the_import_folder(tmp_path):
    vault = tmp_path / "Vault"
    assert ensure_system_notes(vault, WHEN) == []
    assert (sysdir(vault) / "routine-prompt.md").read_text(encoding="utf-8") == ROUTINE
    assert (sysdir(vault) / "processing-rules.md").read_text(encoding="utf-8") == RULES
    assert "Wrzuć tu" in (vault / "Import" / "_jak to działa.md").read_text(encoding="utf-8")
    assert not (sysdir(vault) / "routine-log.md").exists()  # nothing to note
    # The how-to is written once: deleted by the user, it stays deleted.
    (vault / "Import" / "_jak to działa.md").unlink()
    ensure_system_notes(vault, WHEN)
    assert not (vault / "Import" / "_jak to działa.md").exists()


def test_the_trackers_own_older_text_is_replaced_without_a_copy(tmp_path, caplog):
    vault = tmp_path / "Vault"
    put(vault, "routine-prompt.md", (FIXTURES / "routine-prompt-v1.md").read_bytes().replace(b"\n", b"\r\n"))
    put(vault, "processing-rules.md", (FIXTURES / "processing-rules-v0.md").read_bytes())
    with caplog.at_level("INFO"):
        assert ensure_system_notes(vault, WHEN) == ["processing-rules.md", "routine-prompt.md"]
    assert (sysdir(vault) / "routine-prompt.md").read_text(encoding="utf-8") == ROUTINE
    assert (sysdir(vault) / "processing-rules.md").read_text(encoding="utf-8") == RULES
    assert sorted(p.name for p in sysdir(vault).iterdir()) == [".kos-format", "processing-rules.md", "routine-log.md",
                                                               "routine-prompt.md"]
    log = (sysdir(vault) / "routine-log.md").read_text(encoding="utf-8")
    assert log.startswith("# Routine log\n\n> [!info] Tracker ")
    assert "2026-10-15 14:03" in log and "Twoja poprzednia wersja" not in log
    assert len([r for r in caplog.records if "upgraded to format 2" in r.getMessage()]) == 1
    # Once at format 2, nothing more happens.
    assert ensure_system_notes(vault, WHEN) == []
    assert (sysdir(vault) / "routine-log.md").read_text(encoding="utf-8") == log


def test_an_edited_copy_is_kept_before_the_new_format_is_written(tmp_path):
    vault = tmp_path / "Vault"
    mine = (FIXTURES / "routine-prompt-v1.md").read_text(encoding="utf-8") + "\nAlso write a summary per lecture.\n"
    raw = mine.encode("cp1250")  # an editor saved it in another encoding: the copy keeps the exact bytes
    put(vault, "routine-prompt.md", raw)
    put(vault, "processing-rules.md", (FIXTURES / "processing-rules-v1.md").read_bytes())
    put(vault, "routine-log.md", b"---\nlast_run: 2026-10-13 23:47\n---\n- 2026-10-13 23:47 processed 2 sessions")
    assert ensure_system_notes(vault, WHEN) == ["processing-rules.md", "routine-prompt.md"]
    copy = sysdir(vault) / "routine-prompt (moja wersja 2026-10-15).md"
    assert copy.read_bytes() == raw
    assert (sysdir(vault) / "routine-prompt.md").read_text(encoding="utf-8") == ROUTINE
    assert not (sysdir(vault) / "processing-rules (moja wersja 2026-10-15).md").exists()  # it was unedited
    log = (sysdir(vault) / "routine-log.md").read_text(encoding="utf-8")
    assert log.startswith("---\nlast_run: 2026-10-13 23:47\n---\n- 2026-10-13 23:47 processed 2 sessions\n\n> [!info]")
    assert "[[_SYSTEM/routine-prompt (moja wersja 2026-10-15)]]" in log
    # The user edits format 2 too: that copy is theirs and is never replaced.
    edited = ROUTINE + "\nMy extra step.\n"
    (sysdir(vault) / "routine-prompt.md").write_text(edited, encoding="utf-8")
    assert ensure_system_notes(vault, WHEN) == []
    assert (sysdir(vault) / "routine-prompt.md").read_text(encoding="utf-8") == edited
    # Even a rewrite that drops the format comment and every v2 word stays: the vault is stamped.
    rewrite = "# Moja rutyna\nPrzetwarzaj tylko wykłady z logiki.\n"
    (sysdir(vault) / "routine-prompt.md").write_text(rewrite, encoding="utf-8")
    assert ensure_system_notes(vault, WHEN) == []
    assert (sysdir(vault) / "routine-prompt.md").read_text(encoding="utf-8") == rewrite
    assert (sysdir(vault) / ".kos-format").read_text(encoding="utf-8").strip() == "2"


def test_a_v2_edit_without_the_format_comment_is_the_users_even_unstamped(tmp_path):
    vault = tmp_path / "Vault"
    mine = ROUTINE.split("\n", 1)[1].replace("kos-format: 2", "") + "\n## Moje zasady\nMax 5 sesji.\n"
    put(vault, "routine-prompt.md", mine.encode("utf-8"))
    put(vault, "processing-rules.md", RULES.encode("utf-8"))
    assert ensure_system_notes(vault, WHEN) == []
    assert (sysdir(vault) / "routine-prompt.md").read_text(encoding="utf-8") == mine


def test_an_unedited_v2_default_follows_the_new_default_in_a_stamped_vault(tmp_path):
    """Vaults set up by the first 1.3.0 builds are stamped format 2 and hold that build's prompt."""
    vault = tmp_path / "Vault"
    v2 = (FIXTURES / "routine-prompt-v2.md").read_bytes()
    put(vault, ".kos-format", b"2\n")
    put(vault, "routine-prompt.md", v2.replace(b"\n", b"\r\n"))  # saved again by an editor: still unedited
    put(vault, "processing-rules.md", RULES.encode("utf-8"))
    put(vault, "routine-log.md", b"---\nlast_run: 2026-10-14 22:00\n---\n")
    assert ensure_system_notes(vault, WHEN) == ["routine-prompt.md"]
    assert (sysdir(vault) / "routine-prompt.md").read_text(encoding="utf-8") == ROUTINE
    assert not list(sysdir(vault).glob("*moja wersja*"))  # it was the tracker's own text: no copy
    log = (sysdir(vault) / "routine-log.md").read_text(encoding="utf-8")
    assert "mapą wykładu" in log and "Zaktualizowane: routine-prompt.md." in log
    assert "Twoja poprzednia wersja" not in log
    assert ensure_system_notes(vault, WHEN) == []  # once
    assert (sysdir(vault) / "routine-log.md").read_text(encoding="utf-8") == log


def test_an_edited_v2_prompt_stays_the_users(tmp_path):
    vault = tmp_path / "Vault"
    mine = (FIXTURES / "routine-prompt-v2.md").read_text(encoding="utf-8") + "\n## Moje\nMax 1 sesja.\n"
    put(vault, ".kos-format", b"2\n")
    put(vault, "routine-prompt.md", mine.encode("utf-8"))
    put(vault, "processing-rules.md", RULES.encode("utf-8"))
    assert ensure_system_notes(vault, WHEN) == []
    assert (sysdir(vault) / "routine-prompt.md").read_text(encoding="utf-8") == mine
    assert not (sysdir(vault) / "routine-log.md").exists()
    # Unstamped (the stamp could not be written then), the same edit is still the user's.
    (sysdir(vault) / ".kos-format").unlink()
    assert ensure_system_notes(vault, WHEN) == []
    assert (sysdir(vault) / "routine-prompt.md").read_text(encoding="utf-8") == mine


def test_an_unedited_v2_default_is_replaced_in_an_unstamped_vault_too(tmp_path):
    vault = tmp_path / "Vault"
    put(vault, "routine-prompt.md", (FIXTURES / "routine-prompt-v2.md").read_bytes())
    put(vault, "processing-rules.md", RULES.encode("utf-8"))
    assert ensure_system_notes(vault, WHEN) == ["routine-prompt.md"]
    assert (sysdir(vault) / "routine-prompt.md").read_text(encoding="utf-8") == ROUTINE
    assert not list(sysdir(vault).glob("*moja wersja*"))
    assert (sysdir(vault) / ".kos-format").read_text(encoding="utf-8").strip() == "2"


def test_the_steps_are_numbered_in_order_and_the_textbook_runs_on_quiet_runs_too():
    steps = re.findall(r"(?m)^## (\d)\. (.+)$", ROUTINE.split("## Worked example")[0])
    assert [int(n) for n, _ in steps] == list(range(9))
    assert dict(steps)["6"] == "The course textbook (at most one per run)"
    assert "Nothing new: do only steps 6, 7 and 8." in ROUTINE
    textbook = ROUTINE.split("## 6. The course textbook", 1)[1].split("## 7. ", 1)[0]
    order = ["## W skrócie", "## Mapa przedmiotu", "## Mechanizmy", "## Ograniczenia",
             "## Co zapamiętać, a co wyprowadzić", "## Cały przedmiot na jednej stronie",
             "## Pytania sprawdzające"]
    assert [textbook.index(h) for h in order] == sorted(textbook.index(h) for h in order)
    front = re.search(r"    ---\n(.*?)\n    ---", textbook, re.S).group(1)
    assert [line.strip().split(":", 1)[0] for line in front.split("\n")] == [
        "type", "course", "language", "updated", "summaries"]
    assert "type: course-textbook" in front


def test_a_copy_never_overwrites_another_and_an_identical_one_is_reused(tmp_path):
    vault = tmp_path / "Vault"
    put(vault, "routine-prompt (moja wersja 2026-10-15).md", b"something else saved today")
    put(vault, "routine-prompt.md", b"my own routine")
    put(vault, "processing-rules.md", RULES.encode("utf-8"))
    ensure_system_notes(vault, WHEN)
    assert (sysdir(vault) / "routine-prompt (moja wersja 2026-10-15).md").read_bytes() == b"something else saved today"
    assert (sysdir(vault) / "routine-prompt (moja wersja 2026-10-15) (2).md").read_bytes() == b"my own routine"
    # A run that saved the copy but stopped before writing the new text: the same copy is reused.
    put(vault, "routine-prompt.md", b"my own routine")
    ensure_system_notes(vault, WHEN)
    assert not (sysdir(vault) / "routine-prompt (moja wersja 2026-10-15) (3).md").exists()


def test_a_note_that_cannot_be_upgraded_does_not_stop_the_tracker(tmp_path, monkeypatch, caplog):
    vault = tmp_path / "Vault"
    put(vault, "routine-prompt.md", b"my own routine")
    put(vault, "processing-rules.md", (FIXTURES / "processing-rules-v1.md").read_bytes())
    real = Path.read_bytes

    def locked(self):
        if self.name == "routine-prompt.md":
            raise PermissionError("locked by the editor")
        return real(self)

    monkeypatch.setattr(Path, "read_bytes", locked)
    with caplog.at_level("WARNING"):
        assert ensure_system_notes(vault, WHEN) == ["processing-rules.md"]
    assert any("Could not bring" in r.getMessage() for r in caplog.records)
    monkeypatch.undo()
    assert (sysdir(vault) / "routine-prompt.md").read_bytes() == b"my own routine"


def test_the_installer_and_a_new_recording_upgrade_the_vault(tmp_path):
    from mindsetforest_tracker import winsetup

    vault = tmp_path / "Vault"
    put(vault, "routine-prompt.md", (FIXTURES / "routine-prompt-v1.md").read_bytes())
    winsetup._prepare_vault(vault)
    assert (sysdir(vault) / "routine-prompt.md").read_text(encoding="utf-8") == ROUTINE


# -- the mirror ------------------------------------------------------------------------------


def test_the_mirror_sends_lecture_summaries_and_the_routine_log(tmp_path):
    server = FakeVaultServer()
    vault, mirror = mirror_for(tmp_path, server)
    for rel, text in {
        "Lectures/Logika/2026-10-11 Zdania logiczne i zbiory.md": "---\ntype: lecture-summary\n---\n",
        "Lectures/.trash/old.md": "hidden",
        "_SYSTEM/routine-log.md": "---\nlast_run: 2026-10-15 14:03\n---\n",
        "_SYSTEM/routine-prompt.md": ROUTINE,
        "_SYSTEM/merged/Old note.md": "Merged into [[X]]",
        "Import/lecture.md": "a transcript waiting for import",
    }.items():
        (vault / rel).parent.mkdir(parents=True, exist_ok=True)
        (vault / rel).write_text(text, encoding="utf-8")
    assert sorted(vault_notes(vault)) == [
        "Knowledge/Deep/Nested idea.md", "Knowledge/Reciprocity.md", "Lectures/Logika/2026-10-11 Zdania logiczne i zbiory.md",
        "Sessions/2026-10-07 14-03.md", "_SYSTEM/routine-log.md"]
    mirror.sync(0)
    assert server.rows["_SYSTEM/routine-log.md"]["content"].startswith("---\nlast_run: 2026-10-15 14:03")
    assert "Lectures/Logika/2026-10-11 Zdania logiczne i zbiory.md" in server.rows
    assert MIRROR_FILES == ("_SYSTEM/routine-log.md",)


def test_a_long_routine_log_is_sent_as_its_frontmatter_and_newest_entries(tmp_path):
    entries = "".join(f"\n## 2026-10-{1 + i % 28:02d} 12:00\n- sessions: s{i}\n- problems: none\n" for i in range(5000))
    text = "---\nlast_run: 2026-10-15 14:03\n---\n# Routine log\n" + entries
    assert len(text.encode("utf-8")) > recordings.MAX_NOTE_BYTES
    short = log_excerpt(text)
    assert len(short) <= recordings.MAX_LOG_CHARS + 100
    assert short.startswith("---\nlast_run: 2026-10-15 14:03\n---\n")
    assert short.endswith("- sessions: s4999\n- problems: none\n")
    assert "\n## 2026-" in short and short.split("\n\n", 2)[2].startswith("## ")  # cut at an entry
    assert log_excerpt("short log") == "short log"
    # A log over the size limit for notes is still mirrored, cut.
    server = FakeVaultServer()
    vault, mirror = mirror_for(tmp_path, server)
    (vault / "_SYSTEM" / "routine-log.md").write_text(text, encoding="utf-8")
    mirror.sync(0)
    assert server.rows["_SYSTEM/routine-log.md"]["content"] == short


def test_a_vault_with_only_the_routine_log_never_empties_the_dashboard(tmp_path):
    server = FakeVaultServer()
    vault, mirror = mirror_for(tmp_path, server)
    mirror.sync(0)
    empty = tmp_path / "New Vault"
    (empty / "_SYSTEM").mkdir(parents=True)
    (empty / "_SYSTEM" / "routine-log.md").write_text("> [!info] Tracker 1.3.0", encoding="utf-8")
    moved = VaultMirror(empty, mirror.client)
    moved.sync(0)
    assert not any(m == "DELETE" for m, _ in server.log)
    assert "Knowledge/Reciprocity.md" in server.rows


def test_the_mirror_sends_the_course_textbook_but_not_the_study_prompts(tmp_path):
    server = FakeVaultServer()
    vault, mirror = mirror_for(tmp_path, server)
    for rel, text in {
        "Lectures/Logika/_Podręcznik.md": "---\ntype: course-textbook\ncourse: \"Logika\"\n---\n## W skrócie\n",
        "_SYSTEM/learning-mode.md": "---\nsource: dashboard\n---\nTryb nauki",
        "_SYSTEM/primer-prompt.md": "---\nsource: dashboard\n---\nPrimer",
    }.items():
        (vault / rel).parent.mkdir(parents=True, exist_ok=True)
        (vault / rel).write_text(text, encoding="utf-8")
    mirror.sync(0)
    assert server.rows["Lectures/Logika/_Podręcznik.md"]["content"].startswith("---\ntype: course-textbook")
    assert not any(path.startswith("_SYSTEM/") and path != "_SYSTEM/routine-log.md" for path in server.rows)
