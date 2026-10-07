import json
import logging
import os
import subprocess
import sys
import threading
import types
from pathlib import Path

import pytest

from mindsetforest_tracker import main as main_mod
from mindsetforest_tracker.auth import SupabaseAuth, Tokens
from mindsetforest_tracker.capture import FakeSampler, Sample
from mindsetforest_tracker.config import Config, load_config, save_config
from mindsetforest_tracker.main import (
    SingleInstance, TrackerApp, already_running, build_app, build_parser, decide_action, own_pids, same_path,
    settings_argv, silent_choices,
)
from mindsetforest_tracker.sessions import SessionTracker, iso_utc
from mindsetforest_tracker.store import Store
from mindsetforest_tracker.sync import SyncClient, SyncStatus, SyncWorker
from mindsetforest_tracker.tray import format_duration, make_icon_image

T0 = 1_800_000_000
CODE = Sample("Code.exe", "a.py - proj - Visual Studio Code")
SPOTIFY = Sample("Spotify.exe", "Song - Artist")


class RecordingClient(SyncClient):
    def __init__(self):
        self.deleted = []

    def delete(self, device_id, started_at):
        self.deleted.append((device_id, started_at))

    def upsert(self, payload):
        pass


def make_app(tmp_path, samples):
    cfg = load_config(tmp_path / "config.json")
    store = Store()
    auth = SupabaseAuth("https://x.supabase.co", "anon", tmp_path / "s.bin")
    auth.tokens = Tokens("acc", "ref", "u", 1e12)
    client = RecordingClient()
    client.auth = auth
    tracker = SessionTracker(tick_seconds=1, idle_minutes=3, min_seconds=2, ignored_apps=cfg.ignored_apps)
    now = {"t": T0}
    app = TrackerApp(cfg, store, auth, FakeSampler(samples), tracker, client, SyncWorker(store, client), "dev-1",
                     clock=lambda: now["t"])
    app.now = now
    return app


def test_ticks_write_closed_sessions_and_flush_open(tmp_path):
    app = make_app(tmp_path, [CODE] * 10 + [SPOTIFY] * 100)
    for i in range(70):
        app.tick(T0 + i)
    rows = {r.app: r for r in app.store.unsynced()}
    assert rows["Code"].seconds == 10
    assert rows["Spotify"].seconds == 50  # open session flushed at the 60 s mark (T0+60 - T0+10)
    assert app.status_line().startswith("Spotify - ")
    assert app.current_app_name() == "Spotify"


def test_pause_closes_session_and_records_nothing(tmp_path):
    app = make_app(tmp_path, [CODE] * 100)
    for i in range(5):
        app.tick(T0 + i)
    app.now["t"] = T0 + 5
    app.toggle_pause()
    assert app.is_paused() and app.status_line() == "Paused" and app.current_app_name() is None
    for i in range(5, 10):
        app.tick(T0 + i)
    assert app.store.count() == 1 and app.tracker.current is None
    app.toggle_pause()
    app.tick(T0 + 10)
    assert app.tracker.current.started_at == T0 + 10
    app.now["t"] = T0 + 12
    app.quit()
    assert app.client.deleted == []


def test_ignore_current_app_updates_config_and_forgets_session(tmp_path):
    app = make_app(tmp_path, [SPOTIFY] * 200)
    for i in range(65):
        app.tick(T0 + i)  # flushed at 60 s, so a local row exists
    assert app.store.count() == 1
    app.ignore_current_app()
    assert app.store.count() == 0 and app.tracker.current is None
    assert app.client.deleted == [("dev-1", iso_utc(T0))]
    assert json.loads((tmp_path / "config.json").read_text())["ignored_apps"] == ["Spotify"]
    for i in range(65, 70):
        app.tick(T0 + i)
    assert app.tracker.current is None and app.current_app_name() is None


def test_sync_line_and_login_state(tmp_path):
    app = make_app(tmp_path, [])
    assert app.needs_login() is False and app.sync_line() == "Not synced yet"
    app.auth.tokens = None
    assert app.needs_login() is True and app.sync_line() == "Not signed in"
    assert app.sign_in("", "") == "Enter your email and password."


def test_single_instance_guard(tmp_path):
    lock = tmp_path / "tracker.lock"
    first = SingleInstance(lock)
    assert first.acquire() is True and lock.read_text() == str(os.getpid())
    assert first.acquire() is True  # same process may re-acquire
    lock.write_text("999999999")  # stale pid
    assert SingleInstance(lock).acquire() is True
    first.release()
    assert not lock.exists()


class FakeIcon:
    HAS_NOTIFICATION = False

    def __init__(self):
        self.updates = 0

    def update_menu(self):
        self.updates += 1


def test_menu_refreshes_every_5s_but_not_while_own_window_is_in_front(tmp_path):
    own = Sample(CODE.exe, CODE.title, own_window=True)
    app = make_app(tmp_path, [CODE] * 4 + [own] * 4 + [CODE] * 10)
    app.icon = FakeIcon()
    for i in range(1, 15):
        app.tick(T0 + i)
    assert app.icon.updates == 2  # skipped at t=5..8 (menu open), refreshed at t=9 and t=14
    assert app.store.count() == 0 and app.tracker.current.started_at == T0 + 1  # session never split
    app.toggle_pause()
    assert app.icon.updates == 3


def test_tray_helpers():
    assert format_duration(5) == "5s" and format_duration(750) == "12m 30s" and format_duration(7500) == "2h 05m"
    assert make_icon_image(32).size == (32, 32)


# -- review fixes -------------------------------------------------------------

def test_stale_lock_taken_over_unless_pid_is_a_tracker(tmp_path):
    lock = tmp_path / "tracker.lock"
    lock.write_text("4242")  # live pid reused by some other program
    assert SingleInstance(lock, is_tracker=lambda pid: False).acquire() is True
    assert lock.read_text() == str(os.getpid())
    lock.write_text("4242")
    assert SingleInstance(lock, is_tracker=lambda pid: pid == 4242).acquire() is False
    assert lock.read_text() == "4242"  # untouched, the real tracker keeps it


def test_pid_is_tracker_real_process():
    from mindsetforest_tracker.main import pid_is_tracker
    assert pid_is_tracker(999999999) is False  # no such process
    assert isinstance(pid_is_tracker(os.getpid()), bool)


def test_backdated_idle_zeroes_the_live_flushed_row(tmp_path):
    """Reviewer scenario: focus B at t=101, one click at 102.5, no input after.

    Without the tombstone the live flush at t=240 (B non-idle 101-240) would
    survive as a stale row after B's active part shrinks to 1 s and is merged
    into A. Sum of seconds must equal the wall span (400 s).
    """
    A = Sample("Code.exe", "a.py - proj - Visual Studio Code")
    B = Sample("Spotify.exe", "Song - Artist")
    samples = [A] * 101 + [B, B] + [Sample(B.exe, B.title, idle_seconds=t - 102) for t in range(103, 401)]
    app = make_app(tmp_path, samples)
    for t in range(0, 400):
        app.tick(T0 + t)
    app.now["t"] = T0 + 400
    app.toggle_pause()  # closes B idle at 400
    rows = {(r.app, r.idle, r.started_at): r for r in app.store.all_sessions()}
    assert set(rows) == {("Code", False, iso_utc(T0)), ("Spotify", False, iso_utc(T0 + 101)), ("Spotify", True, iso_utc(T0 + 102))}
    assert rows[("Code", False, iso_utc(T0))].seconds == 102
    assert rows[("Spotify", False, iso_utc(T0 + 101))].seconds == 0  # stale live flush zeroed
    assert rows[("Spotify", True, iso_utc(T0 + 102))].seconds == 298
    assert sum(r.seconds for r in rows.values()) == 400


# -- one exe: setup, settings, quit request, hotkey push ---------------------------

EXE = Path("/inst/MindsetForestTracker.exe")
SETUP = Path("/downloads/MindsetForestSetup.exe")


@pytest.mark.parametrize("argv, frozen, exe, configured, expected", [
    (["--self-test", "st.json"], True, EXE, True, "self-test"),
    (["--self-test", "st.json", "--uninstall"], True, EXE, True, "self-test"),
    (["--uninstall"], True, EXE, True, "uninstall"),
    (["--uninstall", "--silent"], False, EXE, False, "uninstall"),
    (["--install", "--silent"], True, SETUP, False, "silent-install"),
    (["--install"], True, SETUP, False, "install-gui"),
    (["--setup"], False, EXE, True, "install-gui"),
    (["--settings"], True, EXE, True, "settings-gui"),
    (["--settings"], False, EXE, False, "settings-gui"),
    ([], True, SETUP, True, "install-gui"),      # the downloaded setup exe
    ([], True, EXE, False, "install-gui"),       # installed but never configured
    ([], True, EXE, True, "tracker"),
    ([], False, SETUP, False, "tracker"),        # a source checkout tracks
    (["--no-tray", "--console"], True, EXE, True, "tracker"),
])
def test_decide_action_table(argv, frozen, exe, configured, expected):
    args = build_parser().parse_args(argv)
    assert decide_action(args, frozen=frozen, exe=exe, installed=EXE, configured=configured) == expected


def test_same_path_ignores_case_only_on_windows(tmp_path):
    a = tmp_path / "Programs" / "MindsetForestTracker.exe"
    b = tmp_path / "programs" / "mindsetforesttracker.EXE"
    assert same_path(a, b, windows=True) is True
    assert same_path(a, b, windows=False) is False
    assert same_path(a, tmp_path / "Programs" / ".." / "Programs" / "MindsetForestTracker.exe", windows=False)


def test_quit_request_file_name_matches_the_setup():
    from mindsetforest_tracker import winsetup
    assert main_mod.QUIT_REQUEST_FILE == winsetup.QUIT_REQUEST
    assert main_mod.NEEDS_LOGIN_FILE == winsetup.NEEDS_LOGIN


class StoppableIcon(FakeIcon):
    def __init__(self):
        super().__init__()
        self.stopped = 0

    def stop(self):
        self.stopped += 1


def quit_app(tmp_path, samples=()):
    app = make_app(tmp_path, list(samples))
    app.quit_request = tmp_path / "quit.request"
    return app


def test_start_removes_a_leftover_quit_request(tmp_path):
    app = quit_app(tmp_path)
    app.quit_request.write_text("")
    app.start()
    try:
        assert not app.quit_request.exists()
        assert not app.shutdown_event.is_set()
    finally:
        app.quit()


def test_tick_sees_the_quit_request_and_shuts_down(tmp_path, caplog):
    app = quit_app(tmp_path, [CODE] * 20)
    app.icon = StoppableIcon()
    app.tick(T0)
    assert not app.shutdown_event.is_set()
    app.quit_request.write_text("")
    app.tick(T0 + 0.5)  # looked for at most once a second
    assert app.quit_request.exists() and not app.shutdown_event.is_set()
    with caplog.at_level(logging.INFO):
        app.tick(T0 + 1)
        assert app.shutdown_event.wait(5)
    assert not app.quit_request.exists()
    assert app.icon.stopped == 1 and app._closed
    assert "Quit requested by setup" in caplog.text
    app.quit()  # the tray's Quit afterwards is harmless
    assert app.icon.stopped == 1


def test_quit_request_on_the_capture_thread_does_not_join_itself(tmp_path):
    app = quit_app(tmp_path, [CODE] * 1000)
    app.quit_request.write_text("")
    app._thread.start()  # the real capture loop notices the file
    assert app.shutdown_event.wait(5)
    app._thread.join(5)
    assert not app._thread.is_alive()
    assert not app.quit_request.exists()
    shutdown_threads = [t for t in threading.enumerate() if t.name == "mf-shutdown"]
    for t in shutdown_threads:
        t.join(5)


def test_request_shutdown_runs_once(tmp_path, monkeypatch):
    app = quit_app(tmp_path)
    calls = []
    monkeypatch.setattr(app, "quit", lambda: calls.append(1))
    app.request_shutdown()
    app.request_shutdown()
    assert app.shutdown_event.wait(5)
    assert calls == [1]


class FakePopen:
    calls: list = []

    def __init__(self, argv, **kwargs):
        FakePopen.calls.append((argv, kwargs))


def test_open_settings_starts_the_exe_or_the_checkout(tmp_path, monkeypatch):
    FakePopen.calls = []
    monkeypatch.setattr(subprocess, "Popen", FakePopen)
    app = make_app(tmp_path, [])
    exe = str(tmp_path / "Programs" / "MindsetForest" / "MindsetForestTracker.exe")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", exe)
    app.open_settings()
    assert FakePopen.calls[-1][0] == [exe, "--settings"]

    monkeypatch.delattr(sys, "frozen")
    monkeypatch.setattr(sys, "executable", "/usr/bin/python3")
    app.open_settings()
    argv = FakePopen.calls[-1][0]
    assert argv[0] == "/usr/bin/python3" and argv[2] == "--settings"
    assert Path(argv[1]).name == "run_tracker.py" and Path(argv[1]).is_file()
    assert settings_argv(False, "py")[1] == argv[1]


def test_open_settings_failure_is_reported_not_raised(tmp_path, monkeypatch):
    def boom(*_a, **_k):
        raise OSError("no such file")

    monkeypatch.setattr(subprocess, "Popen", boom)
    app = make_app(tmp_path, [])
    app.open_settings()  # logged and notified; the tray keeps running


class HotkeyClient(RecordingClient):
    def __init__(self, fail=False):
        super().__init__()
        self.fail = fail
        self.calls = []

    def private_keywords(self):
        self.calls.append("keywords")
        return []

    def set_capture_hotkey(self, spec):
        self.calls.append(("push", spec))
        if self.fail:
            from mindsetforest_tracker.sync import SyncError
            raise SyncError("HTTP 500")

    def capture_hotkey(self):
        self.calls.append("pull")
        return "ctrl+alt+k"


def hotkey_app(tmp_path, push, fail=False):
    path = tmp_path / "config.json"
    save_config(Config(capture_hotkey="ctrl+alt+k", capture_hotkey_push=push, path=path))
    cfg = load_config(path)
    store = Store()
    auth = SupabaseAuth("https://x.supabase.co", "anon", tmp_path / "s.bin")
    auth.tokens = Tokens("acc", "ref", "u", 1e12)
    client = HotkeyClient(fail)
    client.auth = auth
    tracker = SessionTracker(tick_seconds=1, idle_minutes=3, min_seconds=2)
    return TrackerApp(cfg, store, auth, FakeSampler([]), tracker, client, SyncWorker(store, client), "dev-1",
                      clock=lambda: T0)


def test_a_hotkey_chosen_in_setup_is_pushed_once_then_the_flag_is_cleared(tmp_path):
    app = hotkey_app(tmp_path, push=True)
    assert app.sync_worker.pending_hotkey == "ctrl+alt+k"
    app.sync_worker.sync_once()
    assert app.client.calls == ["keywords", ("push", "ctrl+alt+k"), "pull"]
    assert app.sync_worker.pending_hotkey is None and app.config.capture_hotkey_push is False
    assert json.loads((tmp_path / "config.json").read_text())["capture_hotkey_push"] is False
    app.sync_worker.sync_once()
    assert app.client.calls.count(("push", "ctrl+alt+k")) == 1


def test_a_failed_hotkey_push_keeps_the_flag_for_the_next_sync(tmp_path):
    app = hotkey_app(tmp_path, push=True, fail=True)
    app.sync_worker.sync_once()
    assert app.sync_worker.pending_hotkey == "ctrl+alt+k" and app.config.capture_hotkey_push is True
    assert json.loads((tmp_path / "config.json").read_text())["capture_hotkey_push"] is True
    app.client.fail = False
    app.sync_worker.sync_once()
    assert app.sync_worker.pending_hotkey is None and app.config.capture_hotkey_push is False


def test_no_push_without_the_flag(tmp_path):
    app = hotkey_app(tmp_path, push=False)
    assert app.sync_worker.pending_hotkey is None
    app.sync_worker.sync_once()
    assert not any(isinstance(c, tuple) for c in app.client.calls)


class DashboardClient(HotkeyClient):
    """Keeps the dashboard's hotkey like the server does."""

    def __init__(self, dashboard, fail=False):
        super().__init__(fail)
        self.dashboard = dashboard

    def set_capture_hotkey(self, spec):
        super().set_capture_hotkey(spec)
        self.dashboard = spec

    def capture_hotkey(self):
        self.calls.append("pull")
        return self.dashboard


def test_config_json_follows_the_dashboards_hotkey(tmp_path):
    """So the settings window shows the hotkey actually in use."""
    app = hotkey_app(tmp_path, push=False)
    path = tmp_path / "config.json"
    app.on_capture_hotkey("Ctrl+Shift+F9")
    assert app.config.capture_hotkey == "ctrl+shift+f9"
    assert json.loads(path.read_text())["capture_hotkey"] == "ctrl+shift+f9"
    path.unlink()
    app.on_capture_hotkey("ctrl+shift+f9")  # unchanged: not written again (this runs every minute)
    app.on_capture_hotkey(None)  # never set in the dashboard: config.json's stays
    app.on_capture_hotkey("not a hotkey")  # nothing the setup would reject later
    assert not path.exists() and app.config.capture_hotkey == "ctrl+shift+f9"
    app.on_capture_hotkey("")  # turned off in the dashboard
    assert json.loads(path.read_text())["capture_hotkey"] == ""


def test_a_failed_push_never_lets_the_old_dashboard_hotkey_replace_the_new_choice(tmp_path):
    app = hotkey_app(tmp_path, push=True, fail=True)  # the user chose ctrl+alt+k in the setup window
    app.client = app.sync_worker.client = DashboardClient("alt+shift+d", fail=True)
    app.client.auth = app.auth
    app.sync_worker.sync_once()  # push fails, the pull still brings the old value
    assert json.loads((tmp_path / "config.json").read_text())["capture_hotkey"] == "ctrl+alt+k"
    assert app.config.capture_hotkey == "ctrl+alt+k" and app.config.capture_hotkey_push is True
    app.client.fail = False
    app.sync_worker.sync_once()
    saved = json.loads((tmp_path / "config.json").read_text())
    assert saved["capture_hotkey"] == "ctrl+alt+k" and saved["capture_hotkey_push"] is False
    assert app.client.dashboard == "ctrl+alt+k"


def test_needs_login_marker_follows_the_sync_status(tmp_path, monkeypatch):
    """The settings window cannot refresh the session itself; the marker tells it the login is gone."""
    app = make_app(tmp_path, [])
    marker = app.login_marker = tmp_path / "needs_login"
    app.on_sync_status(SyncStatus(needs_login=True, last_error="sign in required: Refresh Token Not Found"))
    assert "Refresh Token Not Found" in marker.read_text(encoding="utf-8")
    app.on_sync_status(SyncStatus(needs_login=True, last_error="sign in required: again"))
    assert "Refresh Token Not Found" in marker.read_text(encoding="utf-8")  # written once
    app.on_sync_status(SyncStatus(last_error="network error: offline"))  # not proof of a good login
    assert marker.exists()
    app.on_sync_status(SyncStatus(last_sync_at=T0))
    assert not marker.exists()
    marker.write_text("x")
    monkeypatch.setattr(app.auth, "sign_in", lambda email, password: None)
    assert app.sign_in("a@b.c", "pw") is None and not marker.exists()


def test_build_app_wires_the_marker_the_cutoff_and_a_truthful_notify(tmp_path):
    cfg_path = tmp_path / "config.json"
    cfg_path.write_text(json.dumps({"supabase_url": "https://x.supabase.co", "supabase_anon_key": "anon",
                                    "vault_dir": str(tmp_path / "Vault"), "recordings_dir": str(tmp_path / "rec"),
                                    "recordings_since": 1_800_000_000, "dashboard_url": "https://mindsetforest.app"}))
    app = build_app(load_config(cfg_path), tmp_path)
    try:
        assert app.login_marker == tmp_path / "needs_login"
        assert app.intake.since == 1_800_000_000
        assert app.dashboard_url == main_mod.DEFAULT_DASHBOARD_URL  # never the placeholder domain

        class Icon:
            HAS_NOTIFICATION = True
            visible = False

            def __init__(self):
                self.shown = []

            def notify(self, message, title):
                self.shown.append(message)

        assert app.intake.notify("hello") is False  # no icon yet: the reminder must not count as shown
        app.icon = Icon()
        assert app.intake.notify("hello") is False and app.icon.shown == []  # not on screen yet
        app.icon.visible = True
        assert app.intake.notify("hello") is True and app.icon.shown == ["hello"]
    finally:
        app.store.close()


def test_a_config_without_the_push_field_still_works(tmp_path):
    app = make_app(tmp_path, [])

    class OldConfig:  # an object without capture_hotkey_push, as before the setup existed
        def __getattr__(self, name):
            if name == "capture_hotkey_push":
                raise AttributeError(name)
            return getattr(app.config, name)

    app.config = OldConfig()
    app.on_hotkey_pushed()  # nothing to clear, nothing saved


# -- silent install / uninstall / the windows, through main() -----------------------

class FakeOps:
    def __init__(self, bandicam=None):
        self.bandicam = bandicam

    def read_bandicam_output(self):
        return self.bandicam

    def startup_dir(self):
        raise NotImplementedError

    def set_run(self, name, command):
        pass

    def get_run(self, name):
        return None

    def write_uninstall_entry(self, values):
        pass

    def programs_dir(self):
        raise NotImplementedError

    def shortcut_target(self, lnk):
        return None

    def launch_detached(self, argv, cwd=None):
        raise NotImplementedError

    def delete_later(self, paths):
        pass


def install_args(*extra):
    return build_parser().parse_args(["--install", "--silent", *extra])


def test_silent_choices_from_flags_need_no_network(tmp_path):
    def no_fetch(site):
        raise AssertionError("fetched")

    args = install_args("--supabase-url", "https://p.supabase.co", "--anon-key", "k", "--recordings",
                        str(tmp_path / "rec"), "--vault", str(tmp_path / "My Vault"), "--hotkey", "Ctrl+Alt+K",
                        "--no-autostart")
    c = silent_choices(args, None, FakeOps(), fetch=no_fetch)
    assert (c.supabase_url, c.supabase_anon_key) == ("https://p.supabase.co", "k")
    assert c.recordings_dir == str(tmp_path / "rec") and c.vault_dir == str(tmp_path / "My Vault")
    assert c.capture_hotkey == "ctrl+alt+k" and c.autostart is False
    assert c.dashboard_url == "https://hmqe333.github.io/mindsetforest_dashboard/"
    args = install_args("--supabase-url", "https://p.supabase.co", "--anon-key", "k", "--site", "https://my.site/app")
    assert silent_choices(args, None, FakeOps(), fetch=no_fetch).dashboard_url == "https://my.site/app/"


def test_silent_choices_fetch_the_site_and_use_the_windows_defaults(tmp_path):
    from mindsetforest_tracker import winsetup
    sites = []

    def fetch(site):
        sites.append(site)
        return {"supabase_url": "https://s.supabase.co", "supabase_anon_key": "pub", "dashboard_url": site}

    c = silent_choices(install_args(), None, FakeOps(bandicam=str(tmp_path / "Bandicam")), fetch=fetch)
    assert sites == [winsetup.DEFAULT_SITE]
    assert (c.supabase_url, c.supabase_anon_key, c.dashboard_url) == ("https://s.supabase.co", "pub",
                                                                       winsetup.DEFAULT_SITE)
    assert c.recordings_dir == str(tmp_path / "Bandicam")
    assert c.vault_dir == str(winsetup.default_vault_dir()) and c.capture_hotkey == "alt+shift+s"
    assert c.autostart is True
    # No --hotkey: the account's dashboard hotkey is not overwritten; Bandicam's existing recordings are included.
    assert c.push_hotkey is False and c.include_existing is True
    # Bandicam set to save into a broad folder (a whole drive): what is already there stays on the PC.
    broad = silent_choices(install_args(), None, FakeOps(bandicam=str(tmp_path / "D")), fetch=fetch)
    assert broad.recordings_dir == str(tmp_path / "D") and broad.include_existing is False
    c = silent_choices(install_args("--hotkey", "ctrl+alt+k", "--skip-existing"), None, FakeOps(), fetch=fetch)
    assert c.push_hotkey is True and c.include_existing is False
    assert silent_choices(install_args("--no-transcribe", "--hotkey", ""), None, FakeOps(),
                          fetch=fetch).recordings_dir == ""


def test_a_silent_upgrade_keeps_autostart_off_when_the_user_turned_it_off(tmp_path):
    existing = Config(supabase_url="https://old.supabase.co", supabase_anon_key="old",
                      vault_dir=str(tmp_path / "Brain"), dashboard_url="https://dash/")
    ops = FakeOps()  # no Run value, no Startup shortcut: autostart is off
    c = silent_choices(install_args("--supabase-url", "https://s.supabase.co", "--anon-key", "k"), existing, ops)
    assert c.autostart is False
    assert silent_choices(install_args("--no-autostart"), None, ops,
                          fetch=lambda s: {"supabase_url": "https://s.supabase.co", "supabase_anon_key": "k",
                                           "dashboard_url": s}).autostart is False


def test_silent_upgrade_keeps_the_users_choices_when_the_site_is_down(tmp_path):
    from mindsetforest_tracker import winsetup

    def down(site):
        raise winsetup.SetupError("offline")

    existing = Config(supabase_url="https://old.supabase.co", supabase_anon_key="old", recordings_dir="",
                      vault_dir=str(tmp_path / "Brain"), capture_hotkey="", dashboard_url="https://dash/")
    c = silent_choices(install_args(), existing, FakeOps(), fetch=down)
    assert (c.supabase_url, c.supabase_anon_key, c.dashboard_url) == ("https://old.supabase.co", "old",
                                                                       "https://dash/")
    assert (c.recordings_dir, c.vault_dir, c.capture_hotkey) == ("", str(tmp_path / "Brain"), "")
    with pytest.raises(winsetup.SetupError):
        silent_choices(install_args(), None, FakeOps(), fetch=down)
    existing.dashboard_url = "https://mindsetforest.app"  # the zip version's placeholder
    assert silent_choices(install_args(), existing, FakeOps(), fetch=down).dashboard_url == winsetup.DEFAULT_SITE


@pytest.fixture
def restore_logging(monkeypatch):
    """main() adds log handlers; and on a Windows run it must never touch the real registry or Start menu."""
    from mindsetforest_tracker import winsetup
    monkeypatch.setattr(winsetup, "WinOps", FakeOps)
    root = logging.getLogger()
    handlers, level = list(root.handlers), root.level
    yield
    for h in list(root.handlers):
        if h not in handlers:
            root.removeHandler(h)
            h.close()
    root.setLevel(level)


def test_main_silent_install_from_sources(tmp_path, monkeypatch, restore_logging):
    from mindsetforest_tracker.config import app_data_dir
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "local"))
    vault = tmp_path / "My Vault"
    rc = main_mod.main(["--install", "--silent", "--no-launch", "--supabase-url", "https://example.supabase.co",
                        "--anon-key", "test", "--recordings", str(tmp_path / "rec"), "--vault", str(vault),
                        "--hotkey", "ctrl+alt+k"])
    assert rc == 0
    data = app_data_dir()
    saved = json.loads((data / "config.json").read_text(encoding="utf-8"))
    assert saved["capture_hotkey"] == "ctrl+alt+k" and saved["capture_hotkey_push"] is True
    assert saved["vault_dir"] == str(vault) and saved["recordings_dir"] == str(tmp_path / "rec")
    assert (vault / "_SYSTEM" / "routine-prompt.md").is_file()
    assert "silent-install" in (data / "setup.log").read_text(encoding="utf-8")
    assert main_mod.main(["--install", "--silent", "--no-launch", "--supabase-url", "https://e.supabase.co",
                          "--anon-key", "k", "--vault", str(vault), "--hotkey", "nonsense"]) == 2


def test_main_uninstall(tmp_path, monkeypatch, restore_logging):
    from mindsetforest_tracker import winsetup
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "local"))
    folder = winsetup.install_dir()
    folder.mkdir(parents=True)
    (folder / winsetup.EXE_NAME).write_bytes(b"MZ")
    args = build_parser().parse_args(["--uninstall"])
    shown = []
    assert main_mod.run_uninstall(args, tmp_path / "data", frozen=False, ops=FakeOps(), confirm=lambda: False,
                                  show=lambda *a: shown.append(a)) == 1
    assert folder.exists() and shown == []
    assert main_mod.run_uninstall(args, tmp_path / "data", frozen=False, ops=FakeOps(), confirm=lambda: True,
                                  show=lambda *a: shown.append(a)) == 0
    assert not folder.exists() and shown[0][0] == "info"
    folder.mkdir(parents=True)
    assert main_mod.main(["--uninstall", "--silent"]) == 0 and not folder.exists()


def test_main_self_test_exit_code(tmp_path, monkeypatch, restore_logging):
    from mindsetforest_tracker import winsetup
    seen = []
    monkeypatch.setattr(winsetup, "self_test", lambda out, ops: seen.append(out) or True)
    assert main_mod.main(["--self-test", str(tmp_path / "st.json")]) == 0
    assert seen == [tmp_path / "st.json"]
    monkeypatch.setattr(winsetup, "self_test", lambda out, ops: False)
    assert main_mod.main(["--self-test", str(tmp_path / "st.json")]) == 1


@pytest.fixture
def fake_window(monkeypatch):
    """A stand-in setup_gui module, so these tests need neither tkinter nor a display."""
    opened = []
    module = types.ModuleType("mindsetforest_tracker.setup_gui")

    def run_setup_window(mode, *, data_dir, ops, source_exe):
        opened.append((mode, data_dir, source_exe))
        return 0

    module.run_setup_window = run_setup_window
    monkeypatch.setitem(sys.modules, "mindsetforest_tracker.setup_gui", module)
    return opened


def test_main_opens_the_windows(tmp_path, monkeypatch, fake_window, restore_logging):
    from mindsetforest_tracker import winsetup
    from mindsetforest_tracker.config import app_data_dir
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "local"))
    data = app_data_dir()
    assert main_mod.main(["--settings"]) == 0
    assert fake_window[-1] == ("settings", data, None)

    monkeypatch.setattr(sys, "frozen", True, raising=False)
    download = tmp_path / "Downloads" / "MindsetForestSetup.exe"
    monkeypatch.setattr(sys, "executable", str(download))
    assert main_mod.main([]) == 0
    assert fake_window[-1] == ("install", data, download)

    # The installed exe without Supabase settings: the setup is unfinished.
    installed = winsetup.installed_exe()
    monkeypatch.setattr(sys, "executable", str(installed))
    assert main_mod.main([]) == 0
    assert fake_window[-1] == ("install", data, installed)

    # Configured and already running (Start menu shortcut): the settings window instead of a second tracker.
    save_config(Config(supabase_url="https://p.supabase.co", supabase_anon_key="k", path=data / "config.json"))
    monkeypatch.setattr(main_mod.SingleInstance, "acquire", lambda self: False)
    assert main_mod.main([]) == 0
    assert fake_window[-1] == ("settings", data, installed)
    # Logged to setup.log: tracker.log belongs to the running tracker (a second writer breaks its rotation).
    assert "opening the settings window" in (data / "setup.log").read_text(encoding="utf-8")
    assert not (data / "tracker.log").exists()

    # The same at logon (the Run value's --autostart): no window, a quiet exit.
    opened = len(fake_window)
    assert main_mod.main(["--autostart"]) == 0
    assert len(fake_window) == opened and not (data / "tracker.log").exists()
    assert "Autostart: another tracker instance is already running" in (data / "setup.log").read_text(encoding="utf-8")


class Guard:
    def __init__(self, *answers):
        self.answers = list(answers)

    def acquire(self):
        return self.answers.pop(0)


def test_autostart_retires_the_zip_tracker_that_won_the_logon_race(tmp_path, monkeypatch, restore_logging):
    from mindsetforest_tracker import winsetup
    seen = []
    monkeypatch.setattr(winsetup, "replace_legacy_tracker", lambda data_dir, ops: seen.append(data_dir) or True)
    logging.getLogger().setLevel(logging.INFO)  # as main()'s setup_logging leaves it
    args = build_parser().parse_args(["--autostart"])
    assert already_running(args, Guard(True), data_dir=tmp_path, frozen=True) is None  # tracks here after all
    assert seen == [tmp_path]
    logging.getLogger("mindsetforest_tracker").info("tracking line")
    assert "tracking line" in (tmp_path / "tracker.log").read_text(encoding="utf-8")
    assert "replaced the old zip tracker" in (tmp_path / "setup.log").read_text(encoding="utf-8")
    # Replaced, but someone else got the lock first: still no window.
    assert already_running(args, Guard(False), data_dir=tmp_path, frozen=True) == 0


def test_a_second_tracker_from_the_sources_just_exits(tmp_path, restore_logging, fake_window):
    logging.getLogger().setLevel(logging.INFO)
    assert already_running(build_parser().parse_args([]), Guard(), data_dir=tmp_path, frozen=False) == 1
    assert fake_window == [] and "already running" in (tmp_path / "setup.log").read_text(encoding="utf-8")


def test_own_pids_counts_the_onefile_bootloader_only_when_frozen():
    """Run in a child, whose parent (this test) runs the same Python exe, like a onefile bootloader."""
    code = ("import os, sys; from mindsetforest_tracker.main import own_pids; "
            "print(own_pids(frozen=True, executable=sys.executable) == {os.getpid(), os.getppid()}, "
            "own_pids(frozen=False) == {os.getpid()}, "
            "own_pids(frozen=True, executable=sys.executable + '-other') == {os.getpid()})")
    out = subprocess.run([sys.executable, "-c", code], cwd=Path(main_mod.__file__).resolve().parent.parent,
                         capture_output=True, text=True, timeout=120)
    assert out.stdout.split() == ["True", "True", "True"], out.stderr
    assert own_pids(frozen=False) == {os.getpid()}


def test_a_stale_lock_held_by_our_own_bootloader_is_taken_over(tmp_path):
    lock = tmp_path / "tracker.lock"
    lock.write_text("4242")  # last session's pid, now our own bootloader's
    guard = SingleInstance(lock, is_tracker=lambda pid: True, self_pids=lambda: {os.getpid(), 4242})
    assert guard.acquire() is True and lock.read_text() == str(os.getpid())
    lock.write_text("4243")
    assert guard.acquire() is False  # a real other tracker still wins


def test_uninstall_deletes_the_program_only_after_the_last_dialog(tmp_path, monkeypatch, restore_logging):
    from mindsetforest_tracker import winsetup
    events = []

    class Ops(FakeOps):
        def delete_later(self, paths):
            events.append(("delete_later", list(paths)))

    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "local"))
    folder = winsetup.install_dir()
    folder.mkdir(parents=True)
    exe = folder / winsetup.EXE_NAME
    exe.write_bytes(b"MZ")
    monkeypatch.setattr(sys, "executable", str(exe))
    args = build_parser().parse_args(["--uninstall"])
    assert main_mod.run_uninstall(args, tmp_path / "data", frozen=True, ops=Ops(), confirm=lambda: True,
                                  show=lambda kind, text: events.append(("show", kind))) == 0
    assert events == [("show", "info"), ("delete_later", [exe, folder])]


def test_the_app_reports_its_device_name_once_signed_in(tmp_path):
    app = make_app(tmp_path, [])
    assert app.sync_worker.pending_device_name == ("dev-1", app.config.device_name)
