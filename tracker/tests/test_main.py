import json
import os

from mindsetforest_tracker.auth import SupabaseAuth, Tokens
from mindsetforest_tracker.capture import FakeSampler, Sample
from mindsetforest_tracker.config import load_config
from mindsetforest_tracker.main import SingleInstance, TrackerApp
from mindsetforest_tracker.sessions import SessionTracker, iso_utc
from mindsetforest_tracker.store import Store
from mindsetforest_tracker.sync import SyncClient, SyncWorker
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
