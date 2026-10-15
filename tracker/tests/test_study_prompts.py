"""The study prompts set in the dashboard (Settings -> AI Context -> Nauka) reach the vault's _SYSTEM/."""
from datetime import datetime

import pytest

from mindsetforest_tracker.auth import SupabaseAuth, Tokens
from mindsetforest_tracker.capture import FakeSampler
from mindsetforest_tracker.config import Config, load_config, save_config
from mindsetforest_tracker.main import TrackerApp
from mindsetforest_tracker.recordings import (
    ROUTINE, STUDY_PROMPT_FILES, STUDY_PROMPT_NOTICE, ensure_system_notes, study_prompt_note, text_hash,
    write_study_prompts,
)
from mindsetforest_tracker.sessions import SessionTracker
from mindsetforest_tracker.store import Store
from mindsetforest_tracker.sync import STUDY_PROMPTS_SECONDS, SyncClient, SyncError, SyncWorker
from test_sync import URL, FakeHttp, FakeResponse, make_auth

CONTEXT = "/rest/v1/user_context"
LEARNING = "Tryb nauki: mój spersonalizowany workflow\n1. Najpierw mapa dziedziny.\n"
PRIMER = "I want you to create a compact, self-contained primer on **[SUBJECT]**.\n"
WHEN = datetime(2026, 10, 15, 18, 0)


class FakeServer(FakeHttp):
    """PostgREST for the sync: uploads succeed, user_context answers with ``self.context``."""

    def __init__(self, context=None):
        super().__init__()
        self.context = context
        self.add("/rest/v1/app_usage_sessions", FakeResponse(201))
        self.add("/rest/v1/app_tracking_privacy", FakeResponse(200, []))
        self.add("/rest/v1/user_onboarding", FakeResponse(200, []))
        self.add("/rest/v1/tracker_devices", FakeResponse(201))

    def get(self, url, headers=None, timeout=None):
        if CONTEXT in url:
            self.calls.append(("get", url, headers, None))
            if isinstance(self.context, Exception):
                raise self.context
            if isinstance(self.context, FakeResponse):
                return self.context
            return FakeResponse(200, [] if self.context is None else [self.context])
        return self._respond("get", url, headers, None)

    def context_reads(self):
        return [c for c in self.calls if CONTEXT in c[1]]


def worker_for(tmp_path, server, now):
    worker = SyncWorker(Store(), SyncClient(URL, "anon", make_auth(tmp_path, server), http=server),
                        clock=lambda: now["t"])
    got = []
    worker.on_study_prompts = got.append
    return worker, got


# -- reading them -----------------------------------------------------------------------


def test_the_client_reads_only_the_two_prompts_with_the_users_token(tmp_path):
    server = FakeServer({"learning_mode": LEARNING, "primer_prompt": None})
    client = SyncClient(URL, "anon", make_auth(tmp_path, server), http=server)
    assert client.study_prompts() == {"learning_mode": LEARNING, "primer_prompt": ""}
    method, url, headers, _ = server.context_reads()[0]
    assert url == f"{URL}/rest/v1/user_context?select=learning_mode,primer_prompt"
    assert headers["apikey"] == "anon" and headers["Authorization"] == "Bearer acc"
    server.context = None  # the user never opened Settings -> AI Context: no row
    assert client.study_prompts() is None
    server.context = FakeResponse(400, {"message": "column user_context.learning_mode does not exist"})
    with pytest.raises(SyncError, match="HTTP 400"):
        client.study_prompts()


def test_they_are_read_after_sign_in_and_then_every_ten_minutes(tmp_path):
    now = {"t": 1000.0}
    server = FakeServer({"learning_mode": LEARNING, "primer_prompt": PRIMER})
    worker, got = worker_for(tmp_path, server, now)
    worker.sync_once()  # the first sync after start
    assert got == [{"learning_mode": LEARNING, "primer_prompt": PRIMER}]
    for step in (60, 120, STUDY_PROMPTS_SECONDS - 1):  # the sync runs every minute; the prompts wait
        now["t"] = 1000.0 + step
        worker.sync_once()
    assert len(server.context_reads()) == 1
    now["t"] = 1000.0 + STUDY_PROMPTS_SECONDS
    worker.sync_once()
    assert len(server.context_reads()) == 2 and len(got) == 2
    # A new sign-in reads them at once, not ten minutes later.
    now["t"] += 60
    worker.refresh_study_prompts()
    worker.sync_once()
    assert len(server.context_reads()) == 3


def test_nothing_is_read_signed_out_or_without_a_vault(tmp_path):
    now = {"t": 1000.0}
    server = FakeServer({"learning_mode": LEARNING, "primer_prompt": PRIMER})
    worker, got = worker_for(tmp_path, server, now)
    worker.on_study_prompts = None
    worker.sync_once()
    worker.on_study_prompts = got.append
    worker.client.auth.tokens = None
    worker.sync_once()
    assert server.context_reads() == [] and got == []


def test_a_failure_is_logged_once_and_never_fails_the_sync(tmp_path, caplog):
    now = {"t": 1000.0}
    server = FakeServer(FakeResponse(400, {"message": "column user_context.learning_mode does not exist"}))
    worker, got = worker_for(tmp_path, server, now)
    with caplog.at_level("WARNING"):
        for i in range(3):
            now["t"] = 1000.0 + i * STUDY_PROMPTS_SECONDS
            worker.sync_once()
    assert len(server.context_reads()) == 3 and got == []
    assert worker.status.last_error is None and worker.status.backoff_seconds == 0
    assert len([r for r in caplog.records if "study prompts" in r.getMessage()]) == 1
    # Back to normal: read and handed over; a callback that fails is logged, not raised.
    server.context = {"learning_mode": LEARNING, "primer_prompt": ""}
    now["t"] += STUDY_PROMPTS_SECONDS
    worker.on_study_prompts = lambda prompts: 1 / 0
    worker.sync_once()
    assert worker.status.last_error is None
    assert "on_study_prompts callback failed" in caplog.text


# -- writing them into the vault -------------------------------------------------------------


def vault_at(tmp_path):
    vault = tmp_path / "Vault"
    vault.mkdir()
    return vault


def system(vault, name):
    return (vault / "_SYSTEM" / name).read_text(encoding="utf-8")


def test_each_prompt_becomes_its_system_note_with_a_short_frontmatter(tmp_path):
    vault = vault_at(tmp_path)
    assert write_study_prompts(vault, {"learning_mode": LEARNING, "primer_prompt": PRIMER}, WHEN) == [
        "learning-mode.md", "primer-prompt.md"]
    assert system(vault, "learning-mode.md") == (
        f"---\nsource: dashboard\ndashboard_hash: {text_hash(LEARNING)}\n---\n{STUDY_PROMPT_NOTICE}\n\n{LEARNING}")
    assert system(vault, "primer-prompt.md") == study_prompt_note(PRIMER)
    assert "Tracker nadpisuje ten plik" in STUDY_PROMPT_NOTICE and "poza _SYSTEM/" in STUDY_PROMPT_NOTICE
    assert sorted(p.name for p in (vault / "_SYSTEM").iterdir()) == ["learning-mode.md", "primer-prompt.md"]
    assert STUDY_PROMPT_FILES == {"learning_mode": "learning-mode.md", "primer_prompt": "primer-prompt.md"}


def test_only_a_changed_text_is_written_and_an_empty_one_leaves_the_file(tmp_path):
    vault = vault_at(tmp_path)
    write_study_prompts(vault, {"learning_mode": LEARNING, "primer_prompt": PRIMER}, WHEN)
    path = vault / "_SYSTEM" / "learning-mode.md"
    # An editor's line ends are not a change (normalised first: Windows already writes CRLF).
    path.write_bytes(path.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
    before = path.stat().st_mtime_ns
    assert write_study_prompts(vault, {"learning_mode": LEARNING + "\n\n", "primer_prompt": PRIMER}, WHEN) == []
    assert path.stat().st_mtime_ns == before
    # Changed in the dashboard: the vault copy follows.
    assert write_study_prompts(vault, {"learning_mode": LEARNING + "2. Prosty model.", "primer_prompt": PRIMER},
                               WHEN) == ["learning-mode.md"]
    assert system(vault, "learning-mode.md").endswith("1. Najpierw mapa dziedziny.\n2. Prosty model.\n")
    assert not list((vault / "_SYSTEM").glob("*moja wersja*"))  # the tracker's own text: no copy
    # Cleared in the dashboard (or never filled in): the file stays as it is.
    assert write_study_prompts(vault, {"learning_mode": "  \n", "primer_prompt": ""}, WHEN) == []
    assert "2. Prosty model." in system(vault, "learning-mode.md") and system(vault, "primer-prompt.md")
    # Edited in the vault (Claude Desktop appended a learning log): the dashboard's text is the one that
    # counts, but what was written there is kept as a copy first.
    path.write_bytes(path.read_bytes() + b"\n## Log nauki\n- aha X\n")
    assert write_study_prompts(vault, {"learning_mode": LEARNING + "2. Prosty model. 3. Pętla."}, WHEN) == [
        "learning-mode.md"]
    assert "aha X" not in system(vault, "learning-mode.md")
    assert "- aha X" in system(vault, "learning-mode (moja wersja 2026-10-15).md")


def test_a_file_the_user_made_by_hand_is_kept_as_a_copy_first(tmp_path):
    vault = vault_at(tmp_path)
    (vault / "_SYSTEM").mkdir()
    (vault / "_SYSTEM" / "primer-prompt.md").write_text("# Mój primer\nKrótko.\n", encoding="utf-8")
    assert write_study_prompts(vault, {"primer_prompt": PRIMER}, WHEN) == ["primer-prompt.md"]
    assert system(vault, "primer-prompt (moja wersja 2026-10-15).md") == "# Mój primer\nKrótko.\n"
    assert system(vault, "primer-prompt.md") == study_prompt_note(PRIMER)
    # "source: dashboard" without the hash of what was written: not provably the tracker's, so kept too.
    (vault / "_SYSTEM" / "learning-mode.md").write_bytes(b"---\nsource: dashboard\n---\nStary tekst.\n")
    assert write_study_prompts(vault, {"learning_mode": LEARNING}, WHEN) == ["learning-mode.md"]
    assert "Stary tekst." in system(vault, "learning-mode (moja wersja 2026-10-15).md")


def test_other_system_notes_are_never_touched_and_a_missing_vault_is_not_created(tmp_path):
    vault = vault_at(tmp_path)
    ensure_system_notes(vault, WHEN)
    before = {p.name: p.read_bytes() for p in (vault / "_SYSTEM").iterdir()}
    write_study_prompts(vault, {"learning_mode": LEARNING, "primer_prompt": PRIMER, "routine": "x", "notes": "y"},
                        WHEN)
    after = {p.name: p.read_bytes() for p in (vault / "_SYSTEM").iterdir()}
    assert {k: v for k, v in after.items() if k in before} == before
    assert set(after) - set(before) == {"learning-mode.md", "primer-prompt.md"}
    assert system(vault, "routine-prompt.md") == ROUTINE
    gone = tmp_path / "Unplugged drive" / "Vault"
    assert write_study_prompts(gone, {"learning_mode": LEARNING}, WHEN) == []
    assert not gone.parent.exists()


def test_a_locked_file_waits_for_the_next_turn(tmp_path, monkeypatch, caplog):
    from mindsetforest_tracker import recordings

    vault = vault_at(tmp_path)
    real = recordings._write_atomic

    def locked(path, text):
        if path.name == "learning-mode.md":
            raise PermissionError("locked by the editor")
        real(path, text)

    monkeypatch.setattr(recordings, "_write_atomic", locked)
    with caplog.at_level("WARNING"):
        assert write_study_prompts(vault, {"learning_mode": LEARNING, "primer_prompt": PRIMER}, WHEN) == [
            "primer-prompt.md"]
    assert "Could not write" in caplog.text


# -- the tracker app ---------------------------------------------------------------------------


def app_with(tmp_path, server, vault_dir):
    path = tmp_path / "config.json"
    save_config(Config(vault_dir=vault_dir, path=path))
    cfg = load_config(path)
    store = Store()
    auth = SupabaseAuth(URL, "anon", tmp_path / "s.bin", http=server)
    auth.tokens = Tokens("acc", "ref", "user-1", 1e12)
    client = SyncClient(URL, "anon", auth, http=server)
    tracker = SessionTracker(tick_seconds=1, idle_minutes=3, min_seconds=2)
    return TrackerApp(cfg, store, auth, FakeSampler([]), tracker, client, SyncWorker(store, client), "dev-1",
                      clock=lambda: 1000.0)


def test_the_tracker_copies_the_dashboards_prompts_into_its_vault(tmp_path):
    vault = vault_at(tmp_path)
    server = FakeServer({"learning_mode": LEARNING, "primer_prompt": PRIMER})
    app = app_with(tmp_path, server, str(vault))
    app.sync_worker.sync_once()
    assert system(vault, "learning-mode.md") == study_prompt_note(LEARNING)
    assert system(vault, "primer-prompt.md") == study_prompt_note(PRIMER)
    # Signing in again reads them at the next sync.
    server.context = {"learning_mode": LEARNING + "3. Chunki.", "primer_prompt": PRIMER}
    app.sync_worker.sync_once()
    assert "3. Chunki." not in system(vault, "learning-mode.md")  # ten minutes have not passed
    server.add("/auth/v1/token?grant_type=password",
               FakeResponse(200, {"access_token": "a2", "refresh_token": "r2", "expires_in": 3600,
                                  "user": {"id": "user-1"}}))
    assert app.sign_in("a@b.c", "pw") is None
    app.sync_worker.sync_once()
    assert system(vault, "learning-mode.md").endswith("3. Chunki.\n")
    app.store.close()


def test_without_a_vault_the_prompts_are_not_even_read(tmp_path):
    server = FakeServer({"learning_mode": LEARNING, "primer_prompt": PRIMER})
    app = app_with(tmp_path, server, "")
    assert app.sync_worker.on_study_prompts is None
    app.sync_worker.sync_once()
    assert server.context_reads() == []
    app.store.close()
