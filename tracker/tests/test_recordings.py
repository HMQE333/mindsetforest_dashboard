import hashlib
import json
import os
from datetime import datetime, timedelta
from pathlib import Path

from mindsetforest_tracker import recordings
from mindsetforest_tracker.recordings import (
    REMINDER_START_DELAY, IntakeState, IntakeWorker, Known, KosClient, VaultMirror, assign_session, count_recordings,
    mp3_chunks, mp3_duration, mp3_frames, process_file, process_recording, recorded_at, recording_files,
    routine_reminder, session_note, stale_sessions,
)
from mindsetforest_tracker.auth import SupabaseAuth, Tokens

# MPEG-1 Layer III, 128 kbps, 44.1 kHz, no padding: 417-byte frames of 1152 samples.
HEADER = bytes([0xFF, 0xFB, 0x90, 0x00])
FRAME = HEADER + bytes(413)


def mp3(seconds: float, id3: bool = True) -> bytes:
    n = round(seconds / (1152 / 44100))
    tag = b"ID3\x03\x00\x00\x00\x00\x00\x0a" + bytes(10) if id3 else b""
    return tag + FRAME * n


def test_frames_duration_and_chunks():
    data = mp3(20 * 60)
    frames = mp3_frames(data)
    assert abs(mp3_duration(frames) - 1200) < 0.1
    chunks = mp3_chunks(data, frames, max_seconds=480)
    assert [round(s) for s, _ in chunks] == [0, 480, 960]
    assert sum(len(c) for _, c in chunks) == len(FRAME) * len(frames)  # every frame once, tag dropped
    assert all(c[:2] == b"\xff\xfb" for _, c in chunks)


def test_start_time_from_bandicam_name_or_file_time():
    assert recorded_at(Path("bandicam 2026-10-07 14-03-12-123.mp3"), 60, 0) == datetime(2026, 10, 7, 14, 3, 12)
    mtime = datetime(2026, 10, 7, 15, 0, 0).timestamp()
    assert recorded_at(Path("lecture.mp3"), 600, mtime) == datetime(2026, 10, 7, 14, 50, 0)


def test_parts_of_one_lecture_share_a_session():
    t = datetime(2026, 10, 7, 14, 0)
    a = Known("a", t, t + timedelta(minutes=30), "2026-10-07 14-00", 1, "a")
    assert assign_session(t + timedelta(minutes=45), [a], 20) == ("2026-10-07 14-00", 2)
    assert assign_session(t + timedelta(minutes=55), [a], 20) == ("2026-10-07 14-55", 1)
    assert assign_session(t - timedelta(hours=2), [a], 20) == ("2026-10-07 12-00", 1)


def test_session_note_keeps_the_routines_work_and_reopens():
    first = session_note(None, "S", [(1, "p1")])
    assert "status: new" in first and "[[Recordings/p1]]" in first
    done = first.replace("status: new", "status: processed").replace(
        "_The Claude routine fills this in and sets `status: processed`._", "- [[Knowledge/Idea]]")
    again = session_note(done, "S", [(1, "p1"), (2, "p2")])
    assert "status: new" in again and "parts: 2" in again
    assert "[[Recordings/p2]]" in again and "[[Knowledge/Idea]]" in again


class FakeResp:
    def __init__(self, status, body):
        self.status_code, self._body, self.text = status, body, json.dumps(body)

    def json(self):
        return self._body


class FakeHttp:
    def __init__(self):
        self.calls = []
        self.stored = []  # kos_recordings rows the "server" already has

    def request(self, method, url, headers=None, json=None, timeout=None):
        if method == "GET":  # the duplicate check before transcribing
            self.calls.append((url, None))
            sha = url.split("sha256=eq.", 1)[1].split("&", 1)[0]
            return FakeResp(200, [r for r in self.stored if r["sha256"] == sha][:1])
        assert method == "POST"
        self.calls.append((url, json))
        if url.endswith("/kos-transcribe"):
            return FakeResp(200, {"model": "openai/whisper-large-v3-turbo", "language": "en",
                                  "segments": [{"start": 1.0, "end": 4.0, "text": " Hello there."}]})
        return FakeResp(201, [{"id": "rec-1"}])


def test_a_recording_becomes_a_note_and_the_audio_is_untouched(tmp_path):
    folder, vault = tmp_path / "Bandicam", tmp_path / "Vault"
    folder.mkdir()
    audio = folder / "bandicam 2026-10-07 14-03-12-123.mp3"
    audio.write_bytes(mp3(10 * 60))
    before = audio.read_bytes()
    auth = SupabaseAuth("https://p.supabase.co", "anon", tmp_path / "s.bin", http=None, clock=lambda: 0.0)
    auth.tokens = Tokens("acc", "ref", "user-1", 1e12, "a@b.c")
    http = FakeHttp()
    state = IntakeState.load(tmp_path / "recordings.json")
    note = process_file(audio, KosClient("https://p.supabase.co", "anon", auth, http=http), state, vault, 20)

    assert audio.read_bytes() == before
    assert len([c for c in http.calls if c[0].endswith("/kos-transcribe")]) == 2  # 600 s in 480 s chunks
    row = http.calls[-1][1]
    assert row["session_key"] == "2026-10-07 14-03" and row["part"] == 1 and row["user_id"] == "user-1"
    assert row["note_name"] == note == "2026-10-07 14-03-12 bandicam 2026-10-07 14-03-12-123"
    assert [s["start"] for s in row["segments"]] == [1.0, 481.0]
    text = (vault / "Recordings" / f"{note}.md").read_text(encoding="utf-8")
    assert "**[00:08:01]** Hello there. ^t0481" in text and "recording_id: rec-1" in text
    assert "status: new" in (vault / "Sessions" / "2026-10-07 14-03.md").read_text(encoding="utf-8")
    assert (vault / "_SYSTEM" / "processing-rules.md").exists()
    routine = (vault / "_SYSTEM" / "routine-prompt.md").read_text(encoding="utf-8")
    assert "processed_parts" in routine and "routine.lock" in routine
    # Seen again (restart): nothing is sent twice.
    again = IntakeState.load(tmp_path / "recordings.json")
    n = len(http.calls)
    assert process_file(audio, KosClient("https://p.supabase.co", "anon", auth, http=http), again, vault, 20) == note
    assert len(http.calls) == n


class FakeVaultServer:
    """kos_vault_files over PostgREST: list, upsert on (user_id, path), delete by path."""

    def __init__(self, refuse=()):
        self.rows, self.log, self.refuse = {}, [], set(refuse)

    def request(self, method, url, headers=None, json=None, timeout=None):
        from urllib.parse import unquote
        self.log.append((method, url))
        if method == "GET":
            return FakeResp(200, [{"path": p, "sha256": r["sha256"], "vault": r["vault"]}
                                  for p, r in sorted(self.rows.items())])
        if method == "POST":
            assert url.endswith("?on_conflict=user_id,path")
            assert headers["Prefer"] == "resolution=merge-duplicates,return=minimal"
            if any(r["path"] in self.refuse for r in json):
                return FakeResp(400, {"message": "bad row"})
            for r in json:
                assert r["user_id"] == "user-1"
                self.rows[r["path"]] = r
            return FakeResp(201, None)
        if method == "DELETE":
            self.rows.pop(unquote(url.split("?path=eq.", 1)[1]), None)
            return FakeResp(204, None)
        raise AssertionError(method)


def mirror_for(tmp_path, server):
    auth = SupabaseAuth("https://p.supabase.co", "anon", tmp_path / "s.bin", http=None, clock=lambda: 0.0)
    auth.tokens = Tokens("acc", "ref", "user-1", 1e12, "a@b.c")
    vault = tmp_path / "My Vault"
    for rel, text in {
        "Knowledge/Reciprocity.md": "---\ntype: principle\n---\nPeople return favours.",
        "Knowledge/Deep/Nested idea.md": "nested",
        "Sessions/2026-10-07 14-03.md": "---\nstatus: new\n---\n",
        "Recordings/2026-10-07 14-03-12 a.md": "raw transcript",
        "_SYSTEM/processing-rules.md": "rules",
        "Knowledge/.obsidian/x.md": "hidden",
        "Knowledge/readme.txt": "not markdown",
    }.items():
        (vault / rel).parent.mkdir(parents=True, exist_ok=True)
        (vault / rel).write_text(text, encoding="utf-8")
    return vault, VaultMirror(vault, KosClient("https://p.supabase.co", "anon", auth, http=server))


def test_the_vault_mirror_copies_knowledge_and_sessions_only(tmp_path):
    server = FakeVaultServer()
    vault, mirror = mirror_for(tmp_path, server)
    assert mirror.sync(0) == (3, 0)
    assert sorted(server.rows) == ["Knowledge/Deep/Nested idea.md", "Knowledge/Reciprocity.md",
                                   "Sessions/2026-10-07 14-03.md"]
    row = server.rows["Knowledge/Reciprocity.md"]
    assert row["vault"] == "My Vault" and row["content"].endswith("People return favours.")
    assert row["modified_at"].endswith("+00:00")

    # Nothing changed: nothing is sent, and the server is not asked again within the hour.
    n = len(server.log)
    assert mirror.sync(60) == (0, 0) and len(server.log) == n

    # The routine processes the session and a note is removed: one upsert, one delete.
    (vault / "Sessions/2026-10-07 14-03.md").write_text("---\nstatus: processed\n---\n", encoding="utf-8")
    (vault / "Knowledge/Deep/Nested idea.md").unlink()
    assert mirror.sync(120) == (1, 1)
    assert "status: processed" in server.rows["Sessions/2026-10-07 14-03.md"]["content"]
    assert ("DELETE", "https://p.supabase.co/rest/v1/kos_vault_files?path=eq.Knowledge%2FDeep%2FNested%20idea.md") in server.log
    assert "Knowledge/Deep/Nested idea.md" not in server.rows


def test_a_restart_sends_only_what_differs_and_a_missing_vault_deletes_nothing(tmp_path):
    server = FakeVaultServer()
    vault, mirror = mirror_for(tmp_path, server)
    mirror.sync(0)
    _, fresh = mirror_for(tmp_path, server)  # a new tracker process: state comes from the server
    assert fresh.sync(0) == (0, 0)
    gone = VaultMirror(tmp_path / "Unplugged drive", fresh.client)
    assert gone.sync(0) == (0, 0) and len(server.rows) == 3


def test_a_moved_vault_resends_its_notes_under_the_new_name(tmp_path):
    server = FakeVaultServer()
    vault, mirror = mirror_for(tmp_path, server)
    mirror.sync(0)
    moved = vault.rename(tmp_path / "Brain")
    assert VaultMirror(moved, mirror.client).sync(0) == (3, 0)
    assert {r["vault"] for r in server.rows.values()} == {"Brain"}


def test_a_note_the_server_refuses_does_not_hold_back_the_others(tmp_path):
    server = FakeVaultServer(refuse={"Knowledge/Reciprocity.md"})
    vault, mirror = mirror_for(tmp_path, server)
    mirror.sync(0)
    assert sorted(server.rows) == ["Knowledge/Deep/Nested idea.md", "Sessions/2026-10-07 14-03.md"]
    posts = len([m for m, _ in server.log if m == "POST"])
    mirror.sync(60)  # refused and unchanged: not tried again
    assert len([m for m, _ in server.log if m == "POST"]) == posts


# -- subfolders, and the routine reminder -------------------------------------


def bandicam_tree(tmp_path):
    folder = tmp_path / "Bandicam"
    for rel in ("top.mp3", "Audios/sub.MP3", "2026-10-07/deep/day.mp3", ".hidden/x.mp3", "._resource.mp3",
                "notes.txt", "video.mp4", "Vault/Recordings/in-vault.mp3", "Vault/.obsidian/y.mp3"):
        (folder / rel).parent.mkdir(parents=True, exist_ok=True)
        (folder / rel).write_bytes(b"x" * 10)
    return folder


def test_recordings_are_found_in_subfolders_but_not_in_hidden_ones_or_the_vault(tmp_path):
    folder = bandicam_tree(tmp_path)
    found = {p.relative_to(folder).as_posix() for p in recording_files(folder, folder / "Vault")}
    assert found == {"top.mp3", "Audios/sub.MP3", "2026-10-07/deep/day.mp3"}
    # A vault elsewhere does not hide a folder that happens to share its name.
    assert "Vault/Recordings/in-vault.mp3" in {p.relative_to(folder).as_posix()
                                               for p in recording_files(folder, tmp_path / "Vault")}


class SignedIn:
    class auth:
        user_id = "user-1"


def test_scan_transcribes_a_recording_from_a_subfolder_once_it_settles(tmp_path, monkeypatch):
    folder = bandicam_tree(tmp_path)
    old = 1_800_000_000
    for p in folder.rglob("*"):
        if p.is_file():
            os.utime(p, (old, old))
    done, notes = [], []

    def transcribe(p, client, state, vault, gap):
        done.append(p.relative_to(folder).as_posix())
        return "n", True

    monkeypatch.setattr(recordings, "process_recording", transcribe)
    worker = IntakeWorker(folder, folder / "Vault", 20, SignedIn(), IntakeState(tmp_path / "r.json"),
                          notify=notes.append)
    worker.scan(old + 600)  # first look: sizes noted
    assert done == []
    worker.scan(old + 660)  # same size a minute later: settled
    assert sorted(done) == ["2026-10-07/deep/day.mp3", "Audios/sub.MP3", "top.mp3"]
    assert "Transcribed: sub.MP3" in notes
    worker.scan(old + 720)
    assert len(done) == 3  # nothing twice


def session(vault, name, text, age_seconds, now):
    p = vault / "Sessions" / f"{name}.md"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    os.utime(p, (now - age_seconds, now - age_seconds))
    return p


NOW = 1_900_000_000
DAY = 86400


def test_stale_sessions_are_new_ones_untouched_for_a_day(tmp_path):
    vault = tmp_path / "Vault"
    assert stale_sessions(vault, NOW) == []  # no Sessions folder yet
    session(vault, "2026-10-01 10-00", session_note(None, "2026-10-01 10-00", [(1, "a")]), 2 * DAY, NOW)
    session(vault, "2026-10-02 10-00", "﻿---\ntype: session\nstatus: \"new\"\n---\n", DAY + 5, NOW)
    session(vault, "2026-10-06 10-00", session_note(None, "2026-10-06 10-00", [(1, "b")]), 3600, NOW)  # fresh
    session(vault, "2026-09-01 10-00", "---\nstatus: processed\n---\nstatus: new\n", 9 * DAY, NOW)  # body only
    session(vault, "2026-09-02 10-00", "---\nstatus: skipped\n---\n", 9 * DAY, NOW)
    session(vault, "2026-09-03 10-00", "status: new\n", 9 * DAY, NOW)  # no frontmatter
    (vault / "Sessions" / "nested").mkdir()
    session(vault, "nested/2026-09-04 10-00", "---\nstatus: new\n---\n", 9 * DAY, NOW)  # not Sessions/*.md
    assert stale_sessions(vault, NOW) == ["2026-10-01 10-00", "2026-10-02 10-00"]
    assert stale_sessions(vault, NOW, older_than=1800) == ["2026-10-01 10-00", "2026-10-02 10-00",
                                                           "2026-10-06 10-00"]


def test_routine_reminder_text():
    tail = " na rutynę Claude od ponad doby. Ustawienia... pokazuje, jak ją włączyć."
    assert routine_reminder(1) == "1 sesja czeka" + tail
    assert routine_reminder(3) == "3 sesje czekają" + tail
    assert routine_reminder(5) == "5 sesji czeka" + tail
    assert routine_reminder(12) == "12 sesji czeka" + tail
    assert routine_reminder(22) == "22 sesje czekają" + tail


def test_the_routine_reminder_comes_at_most_once_a_day(tmp_path):
    vault = tmp_path / "Vault"
    notes = []
    worker = IntakeWorker(None, vault, 20, SignedIn(), None, notify=notes.append)
    assert worker.remind_routine(NOW) is False  # nothing waiting
    session(vault, "2026-10-01 10-00", "---\nstatus: new\n---\n", 2 * DAY, NOW)
    assert worker.remind_routine(NOW + 60) is False  # the folder is looked at once an hour
    assert worker.remind_routine(NOW + 3600) is True
    assert notes == [routine_reminder(1)]
    for later in (NOW + 7200, NOW + 3600 + DAY - 1):
        assert worker.remind_routine(later) is False
    assert worker.remind_routine(NOW + 3600 + DAY) is True and len(notes) == 2
    assert IntakeWorker(None, vault, 20, SignedIn(), None, notify=None).remind_routine(NOW) is False


# -- review fixes: depth, cutoff, restarts, reminders, empty vault --------------


def test_the_scan_goes_at_most_three_folders_down(tmp_path):
    folder = tmp_path / "D"
    for rel in ("a.mp3", "1/b.mp3", "1/2/c.mp3", "1/2/3/d.mp3", "1/2/3/4/e.mp3", "Music/Artist/Album/Disc 1/f.mp3"):
        (folder / rel).parent.mkdir(parents=True, exist_ok=True)
        (folder / rel).write_bytes(b"x")
    found = {p.relative_to(folder).as_posix() for p in recording_files(folder)}
    assert found == {"a.mp3", "1/b.mp3", "1/2/c.mp3", "1/2/3/d.mp3"}
    assert count_recordings(folder) == 4 and count_recordings(folder, limit=2) == 2
    assert count_recordings(tmp_path / "missing") == 0


def test_files_older_than_the_cutoff_are_never_sent(tmp_path, monkeypatch):
    folder = tmp_path / "Bandicam"
    (folder / "Audios").mkdir(parents=True)
    since = 1_800_000_000
    for name, mtime in (("before.mp3", since - 3600), ("Audios/after.mp3", since + 60)):
        (folder / name).write_bytes(b"x" * 10)
        os.utime(folder / name, (mtime, mtime))
    done = []
    monkeypatch.setattr(recordings, "process_recording",
                        lambda p, client, state, vault, gap: (done.append(p.name) or "n", True))
    worker = IntakeWorker(folder, tmp_path / "Vault", 20, SignedIn(), IntakeState(tmp_path / "r.json"), since=since)
    worker.scan(since + 600)
    worker.scan(since + 660)
    assert done == ["after.mp3"]
    # No cutoff (the existing recordings were wanted, or an upgrade kept the folder): both.
    done.clear()
    everything = IntakeWorker(folder, tmp_path / "Vault", 20, SignedIn(), IntakeState(tmp_path / "r2.json"))
    everything.scan(since + 600)
    everything.scan(since + 660)
    assert sorted(done) == ["after.mp3", "before.mp3"]


class Client:
    """A signed-in KosClient on FakeHttp that counts transcriptions."""

    def __init__(self, tmp_path):
        auth = SupabaseAuth("https://p.supabase.co", "anon", tmp_path / "s.bin", http=None, clock=lambda: 0.0)
        auth.tokens = Tokens("acc", "ref", "user-1", 1e12, "a@b.c")
        self.http = FakeHttp()
        self.kos = KosClient("https://p.supabase.co", "anon", auth, http=self.http)

    def transcribed(self):
        return len([c for c in self.http.calls if c[0].endswith("/kos-transcribe")])


def test_a_restart_neither_rereads_known_recordings_nor_announces_them(tmp_path, monkeypatch):
    folder, vault, state_file = tmp_path / "Bandicam", tmp_path / "Vault", tmp_path / "recordings.json"
    (folder / "Audios").mkdir(parents=True)
    old = 1_800_000_000
    files = [folder / "Audios" / f"rec{i}.mp3" for i in range(3)]
    for i, f in enumerate(files):
        f.write_bytes(mp3(30 + i))
        os.utime(f, (old, old))
    client = Client(tmp_path)
    # A tracker from before the index: recordings.json is a plain list and knows the three files.
    first = IntakeState(tmp_path / "old.json")
    for f in files:
        process_file(f, client.kos, first, vault, 20)
    state_file.write_text((tmp_path / "old.json").read_text(encoding="utf-8"), encoding="utf-8")
    sent = client.transcribed()

    reads = []
    real_read = Path.read_bytes
    monkeypatch.setattr(Path, "read_bytes", lambda self: reads.append(self.name) or real_read(self))

    def run_tracker():
        notes = []
        worker = IntakeWorker(folder, vault, 20, client.kos, IntakeState.load(state_file), notify=notes.append)
        worker.scan(old + 600)
        worker.scan(old + 660)
        return notes

    # First start after the upgrade: the files are hashed once to fill the index; no toast, nothing sent.
    assert run_tracker() == []
    assert sorted(reads) == ["rec0.mp3", "rec1.mp3", "rec2.mp3"] and client.transcribed() == sent
    # recordings.json keeps the plain list every tracker reads; the index lives beside it.
    saved = json.loads(state_file.read_text(encoding="utf-8"))
    index = json.loads((tmp_path / "recordings-index.json").read_text(encoding="utf-8"))
    assert isinstance(saved, list) and len(saved) == 3 and len(index) == 3
    # Every start after that: not read at all.
    reads.clear()
    assert run_tracker() == [] and reads == []
    # A new recording is the only one transcribed and announced.
    new = folder / "Audios" / "rec3.mp3"
    new.write_bytes(mp3(40))
    os.utime(new, (old, old))
    assert run_tracker() == ["Transcribed: rec3.mp3"] and reads == ["rec3.mp3"]
    assert client.transcribed() == sent + 1


def test_the_index_rehashes_a_changed_file_and_reads_both_state_forms(tmp_path):
    audio = tmp_path / "a.mp3"
    audio.write_bytes(mp3(30))
    client = Client(tmp_path)
    state = IntakeState(tmp_path / "recordings.json")
    note, fresh = process_recording(audio, client.kos, state, tmp_path / "Vault", 20)
    assert fresh is True
    assert process_recording(audio, client.kos, state, tmp_path / "Vault", 20) == (note, False)
    # Same path, other content: hashed again and transcribed as the new recording it is.
    audio.write_bytes(mp3(45))
    os.utime(audio, (1_800_000_000, 1_800_000_000))
    other, fresh = process_recording(audio, client.kos, state, tmp_path / "Vault", 20)
    assert fresh is True and other != note and client.transcribed() == 2
    loaded = IntakeState.load(tmp_path / "recordings.json")
    assert set(loaded.known) == set(state.known) and loaded.files == state.files
    # recordings.json is the list an older tracker reads too; a damaged entry must not hide the good ones.
    entries = json.loads((tmp_path / "recordings.json").read_text(encoding="utf-8"))
    assert isinstance(entries, list)
    (tmp_path / "old.json").write_text(json.dumps([{"sha256": "broken"}] + entries), encoding="utf-8")
    old = IntakeState.load(tmp_path / "old.json")
    assert set(old.known) == set(state.known) and old.files == {}
    # The one-file form a development build wrote is still read.
    both = {"known": entries, "files": {k: list(v) for k, v in state.files.items()}}
    (tmp_path / "dev.json").write_text(json.dumps(both), encoding="utf-8")
    dev = IntakeState.load(tmp_path / "dev.json")
    assert set(dev.known) == set(state.known) and dev.files == state.files
    (tmp_path / "junk.json").write_text("42", encoding="utf-8")
    assert IntakeState.load(tmp_path / "junk.json").known == {}


def test_the_first_reminder_waits_for_the_tray_icon_and_an_unshown_one_is_retried(tmp_path):
    vault = tmp_path / "Vault"
    session(vault, "2026-10-01 10-00", "---\nstatus: new\n---\n", 2 * DAY, NOW)
    shown = []
    icon_ready = [False]

    def notify(msg):
        if not icon_ready[0]:
            return False
        shown.append(msg)
        return True

    worker = IntakeWorker(None, vault, 20, SignedIn(), None, notify=notify)
    worker.started_at = NOW
    assert worker.remind_routine(NOW) is False  # just started: not even looked at
    assert worker.remind_routine(NOW + REMINDER_START_DELAY - 1) is False and worker._reminder_checked_at is None
    assert worker.remind_routine(NOW + REMINDER_START_DELAY) is False  # looked, but no icon to show it on
    assert worker._reminded_at is None and shown == []
    icon_ready[0] = True
    assert worker.remind_routine(NOW + REMINDER_START_DELAY + 60) is False  # the next look is in an hour
    assert worker.remind_routine(NOW + REMINDER_START_DELAY + 3600) is True and shown == [routine_reminder(1)]
    assert worker.remind_routine(NOW + REMINDER_START_DELAY + 7200) is False  # then once a day


def test_an_empty_vault_never_empties_the_dashboard(tmp_path, caplog):
    server = FakeVaultServer()
    vault, mirror = mirror_for(tmp_path, server)
    mirror.sync(0)
    # vault_dir now points at a new, empty folder (the installer made it and wrote _SYSTEM/).
    empty = tmp_path / "New" / "MindsetForest Vault"
    (empty / "_SYSTEM").mkdir(parents=True)
    (empty / "_SYSTEM" / "routine-prompt.md").write_text("x", encoding="utf-8")
    (empty / "Sessions").mkdir()
    moved = VaultMirror(empty, mirror.client)
    with caplog.at_level("WARNING"):
        assert moved.sync(0) == (0, 0)
        assert moved.sync(recordings.RELOAD_SECONDS) == (0, 0)
    assert len(server.rows) == 3 and not any(m == "DELETE" for m, _ in server.log)
    assert len([r for r in caplog.records if "nothing deleted" in r.getMessage()]) == 1  # warned once
    # Once the vault has notes again, deletions mirror as before.
    (empty / "Sessions" / "2026-10-07 14-03.md").write_text("---\nstatus: new\n---\n", encoding="utf-8")
    assert moved.sync(2 * recordings.RELOAD_SECONDS) == (1, 2)
    assert sorted(server.rows) == ["Sessions/2026-10-07 14-03.md"]


def test_a_recording_the_server_already_has_is_not_transcribed_again(tmp_path):
    # A reinstall that lost recordings.json (or a second PC) finds the file's hash on the server.
    folder, vault = tmp_path / "Bandicam", tmp_path / "Vault"
    folder.mkdir()
    audio = folder / "bandicam 2026-10-07 14-03-12-123.mp3"
    audio.write_bytes(mp3(60))
    sha = hashlib.sha256(audio.read_bytes()).hexdigest()
    client = Client(tmp_path)
    client.http.stored.append({"sha256": sha, "note_name": "2026-10-07 14-03-12 lecture", "file_name": audio.name,
                               "recorded_at": "2026-10-07T12:03:12+00:00", "duration_seconds": 60,
                               "session_key": "2026-10-07 14-03", "part": 2})
    state = IntakeState.load(tmp_path / "recordings.json")
    note, fresh = process_recording(audio, client.kos, state, vault, 20)
    assert (note, fresh) == ("2026-10-07 14-03-12 lecture", False)
    assert client.transcribed() == 0 and not (vault / "Recordings").exists()  # nothing sent, the vault untouched
    known = state.known[sha]
    assert (known.session, known.part) == ("2026-10-07 14-03", 2) and known.end - known.start == timedelta(seconds=60)
    # Remembered locally from now on: no second question to the server.
    asked = len(client.http.calls)
    assert process_recording(audio, client.kos, IntakeState.load(tmp_path / "recordings.json"), vault, 20)[1] is False
    assert len(client.http.calls) == asked
