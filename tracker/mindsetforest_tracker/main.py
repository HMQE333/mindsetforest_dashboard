"""Wiring: config -> store -> auth -> sampler -> session tracker -> sync -> tray.

``TrackerApp`` owns the capture thread and implements ``tray.TrayController``.
``main()`` adds logging, the single-instance guard and the tray loop. This is
the only module with process-level state.
"""
from __future__ import annotations

import argparse
import logging
import logging.handlers
import os
import sys
import threading
import time
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

import psutil

from . import tray
from .archive_capture import ArchiveClient, HotkeyListener, clean_source, foreground_title, read_selection
from .auth import AuthError, AuthUnavailable, SupabaseAuth
from .capture import Sampler, default_sampler
from .config import Config, app_data_dir, load_config, save_config
from .privacy import is_private
from .sessions import LOCKED_APP, SessionTracker, iso_utc
from .store import Store
from .sync import SyncClient, SyncError, SyncStatus, SyncWorker

log = logging.getLogger("mindsetforest_tracker")
PURGE_EVERY_SECONDS = 24 * 3600
MENU_REFRESH_SECONDS = 5


def setup_logging(path: Path, console: bool) -> None:
    """Rotating log file (1 MB x 3) plus stderr when ``console``."""
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    path.parent.mkdir(parents=True, exist_ok=True)
    file_handler = logging.handlers.RotatingFileHandler(path, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    file_handler.setFormatter(fmt)
    root.addHandler(file_handler)
    if console:
        stream = logging.StreamHandler()
        stream.setFormatter(fmt)
        root.addHandler(stream)


TRACKER_MARKERS = ("mindsetforest", "run_tracker")


def pid_is_tracker(pid: int) -> bool:
    """True when ``pid`` is a live process that looks like this tracker.

    PIDs are reused after a hard shutdown, so a lock file naming a live pid is
    only honoured when that process's name, exe or command line mentions the
    tracker (``MindsetForestTracker.exe``, ``run_tracker.py``,
    ``mindsetforest_tracker``).
    """
    try:
        proc = psutil.Process(pid)
    except psutil.Error:
        return False
    parts: list[str] = []
    for getter in (proc.name, proc.exe, lambda: " ".join(proc.cmdline())):
        try:
            parts.append(getter() or "")
        except (psutil.AccessDenied, psutil.ZombieProcess):
            continue
        except psutil.NoSuchProcess:
            return False
    text = " ".join(parts).lower()
    return any(marker in text for marker in TRACKER_MARKERS)


class SingleInstance:
    """Pid-file guard so two trackers never run for the same user.

    A stale lock (pid gone, or reused by an unrelated process) is taken over.
    """

    def __init__(self, path: Path, is_tracker: Callable[[int], bool] = pid_is_tracker) -> None:
        self.path = path
        self.is_tracker = is_tracker

    def acquire(self) -> bool:
        try:
            other = int(self.path.read_text().strip())
        except (OSError, ValueError):
            other = 0
        if other and other != os.getpid() and self.is_tracker(other):
            return False
        if other and other != os.getpid():
            log.warning("Taking over stale lock file (pid %d is not a tracker)", other)
        self.path.write_text(str(os.getpid()))
        return True

    def release(self) -> None:
        try:
            if int(self.path.read_text().strip()) == os.getpid():
                self.path.unlink()
        except (OSError, ValueError):
            pass


class TrackerApp:
    """Runs the capture loop and answers the tray. Thread-safe via one lock."""

    def __init__(self, config: Config, store: Store, auth: SupabaseAuth, sampler: Sampler,
                 tracker: SessionTracker, client: SyncClient, sync_worker: SyncWorker,
                 device_id: str, clock: Callable[[], float] = time.time,
                 archive: ArchiveClient | None = None) -> None:
        self.clock = clock
        self.config = config
        self.store = store
        self.auth = auth
        self.sampler = sampler
        self.tracker = tracker
        self.client = client
        self.sync_worker = sync_worker
        self.device_id = device_id
        self.dashboard_url = config.dashboard_url
        self.icon = None
        self._lock = threading.Lock()
        self._paused = False
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._capture_loop, name="mf-capture", daemon=True)
        self._last_flush = clock()
        self._last_menu_refresh = clock()
        self._last_purge = 0.0
        self._login_notified = False
        self.archive = archive
        self._private_keywords = list(config.private_keywords)
        sync_worker.on_status = self.on_sync_status
        sync_worker.on_private_keywords = self.on_private_keywords

    # -- lifecycle -----------------------------------------------------------

    def start(self) -> None:
        self.sync_worker.start()
        self._thread.start()
        log.info("Tracking started (device %s, %s)", self.device_id, self.config.device_name)

    def _capture_loop(self) -> None:  # pragma: no cover - threads
        while not self._stop.is_set():
            try:
                self.tick(self.clock())
            except Exception:
                log.exception("tick failed")
            self._stop.wait(self.config.tick_seconds)

    def tick(self, ts: float) -> None:
        """One capture step at wall-clock ``ts``."""
        sample = None if self._paused else self.sampler.sample()
        with self._lock:
            for session in self.tracker.feed(ts, sample):
                self.store.upsert_session(session, self.device_id)
            if ts - self._last_flush >= self.config.sync_seconds:
                self._flush_open()
                self._last_flush = ts
        menu_open = sample is not None and sample.own_window
        if not menu_open and ts - self._last_menu_refresh >= MENU_REFRESH_SECONDS:
            self._last_menu_refresh = ts
            self._refresh_menu()
        if ts - self._last_purge >= PURGE_EVERY_SECONDS:
            self._last_purge = ts
            removed = self.store.purge_synced_older_than(90)
            if removed:
                log.info("Purged %d synced rows older than 90 days", removed)

    def _refresh_menu(self) -> None:
        """pystray caches the menu; rebuild it so dynamic labels stay current."""
        icon = self.icon
        if icon is None:
            return
        try:
            icon.update_menu()
        except Exception:
            log.debug("update_menu failed", exc_info=True)

    def _flush_open(self) -> None:
        """Write the open session so a long one is visible before it closes."""
        current = self.tracker.current
        if current and current.seconds >= max(1, self.config.min_session_seconds):
            self.store.upsert_session(current, self.device_id)

    def quit(self) -> None:
        """Flush the open session, sync once, close the store."""
        self._stop.set()
        if self._thread.is_alive():
            self._thread.join(timeout=5)
        with self._lock:
            for session in self.tracker.close_current(self.clock()):
                self.store.upsert_session(session, self.device_id)
        self.sync_worker.stop()
        self.sync_worker.sync_once()
        self.store.close()
        log.info("Tracker stopped")

    # -- TrayController ------------------------------------------------------

    def status_line(self) -> str:
        if self._paused:
            return "Paused"
        current = self.tracker.current
        if current is None:
            return "Nothing in front"
        prefix = "Idle: " if current.idle else ""
        return f"{prefix}{current.app_key} - {tray.format_duration(current.seconds)}"

    def sync_line(self) -> str:
        status = self.sync_worker.status
        if not self.auth.has_session or status.needs_login:
            return "Not signed in"
        if status.last_error:
            return f"Sync error: {status.last_error[:60]}"
        if status.last_sync_at:
            return f"Last sync {datetime.fromtimestamp(status.last_sync_at):%H:%M:%S}"
        return "Not synced yet"

    def is_paused(self) -> bool:
        return self._paused

    def toggle_pause(self) -> None:
        with self._lock:
            self._paused = not self._paused
            if self._paused:
                for session in self.tracker.close_current(self.clock()):
                    self.store.upsert_session(session, self.device_id)
        log.info("Tracking %s", "paused" if self._paused else "resumed")
        self._refresh_menu()

    def current_app_name(self) -> str | None:
        current = self.tracker.current
        if current is None or current.app == LOCKED_APP or self._paused:
            return None
        return current.app

    def ignore_current_app(self) -> None:
        """Add the app in front to ``ignored_apps`` and forget its open session."""
        with self._lock:
            current = self.tracker.discard_current()
            if current is None:
                return
            name = current.app
            if not self.config.is_ignored(name):
                self.config.ignored_apps.append(name)
                try:
                    save_config(self.config)
                except OSError as exc:
                    log.error("Could not save config: %s", exc)
            self.tracker.set_ignored(self.config.ignored_apps)
            started_at = iso_utc(current.started_at)
            was_stored = self.store.delete_session(started_at)
        if was_stored:
            try:
                self.client.delete(self.device_id, started_at)
            except Exception as exc:
                log.warning("Could not delete uploaded session for %s: %s", name, exc)
        log.info("Not tracking %s from now on", name)
        self._refresh_menu()
        tray.notify(self.icon, f"{name} will not be tracked")

    def needs_login(self) -> bool:
        return not self.auth.has_session or self.sync_worker.status.needs_login

    def sign_in(self, email: str, password: str) -> str | None:
        if not email or not password:
            return "Enter your email and password."
        try:
            self.auth.sign_in(email, password)
        except AuthError as exc:
            return str(exc)
        self._login_notified = False
        self.sync_worker.request_sync()
        log.info("Signed in as %s", email)
        self._refresh_menu()
        return None

    def on_private_keywords(self, keywords: list[str]) -> None:
        """The dashboard's never-record keywords, on top of config.json's own."""
        with self._lock:  # the capture thread feeds the tracker under the same lock
            self._private_keywords = [*self.config.private_keywords, *keywords]
            self.tracker.set_private_keywords(self._private_keywords)

    # -- save selection to Archive ---------------------------------------------

    def capture_hint(self) -> str | None:
        """Tray line naming the hotkey, or None when it is off."""
        hotkey = self.config.capture_hotkey
        return f"Save selection to Archive: {hotkey.title()}" if hotkey and self.archive else None

    def save_text(self, text: str | None, window_title: str) -> str:
        """Save captured text as an Archive note; returns the balloon message.

        The source line is the window title without the browser name, left
        out for a window the tracker treats as private.
        """
        if self.archive is None:
            return "Saving to Archive is not set up (supabase_url in config.json)"
        if self.needs_login():
            return "Sign in from the tray menu to save to Archive"
        if not text or not text.strip():
            return "Nothing selected: select some text, then press the hotkey"
        source = "" if is_private(window_title, keywords=self._private_keywords) else clean_source(window_title)
        try:
            saved = self.archive.save(text, source)
        except AuthUnavailable as exc:
            log.warning("Save to Archive failed: %s", exc)
            return "Couldn't save (no connection?). The text is still on your clipboard."
        except AuthError:
            return "Sign in again from the tray menu to save to Archive"
        except SyncError as exc:
            log.warning("Save to Archive failed: %s", exc)
            return "Couldn't save (no connection?). The text is still on your clipboard."
        if saved and saved.get("id"):
            threading.Thread(target=self.archive.embed, args=(saved["id"],), name="mf-embed", daemon=True).start()
        title = (saved or {}).get("title") or "note"
        log.info("Saved selection to Archive (%d chars)", len(text))
        return f"Saved to Archive: {title}"

    def capture_selection(self) -> None:  # pragma: no cover - Windows only (hotkey thread)
        title = foreground_title()
        message = self.save_text(read_selection(), title)
        tray.notify(self.icon, message)

    def on_sync_status(self, status: SyncStatus) -> None:
        if status.needs_login and not self._login_notified:
            self._login_notified = True
            tray.notify(self.icon, "Sign in from the tray menu to sync your computer time")
        elif not status.needs_login:
            self._login_notified = False


def build_app(config: Config, data_dir: Path, sampler: Sampler | None = None) -> TrackerApp:
    """Construct every component from a config (no threads started)."""
    store = Store(data_dir / "tracker.db")
    device_id = store.device_id()
    auth = SupabaseAuth(config.supabase_url, config.supabase_anon_key, data_dir / "session.bin")
    tracker = SessionTracker(tick_seconds=config.tick_seconds, idle_minutes=config.idle_minutes,
                             min_seconds=config.min_session_seconds, ignored_apps=config.ignored_apps,
                             private_keywords=config.private_keywords)
    client = SyncClient(config.supabase_url, config.supabase_anon_key, auth)
    worker = SyncWorker(store, client, interval_seconds=config.sync_seconds)
    archive = ArchiveClient(config.supabase_url, config.supabase_anon_key, auth) if config.supabase_url else None
    return TrackerApp(config, store, auth, sampler or default_sampler(), tracker, client, worker, device_id,
                      archive=archive)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mindsetforest-tracker")
    parser.add_argument("--config", type=Path, help="path to config.json")
    parser.add_argument("--console", action="store_true", help="also log to stderr")
    parser.add_argument("--no-tray", action="store_true", help="run without a tray icon (Ctrl+C to stop)")
    args = parser.parse_args(argv)

    data_dir = app_data_dir()
    setup_logging(data_dir / "tracker.log", console=args.console or not getattr(sys, "frozen", False))
    guard = SingleInstance(data_dir / "tracker.lock")
    if not guard.acquire():
        log.error("Another tracker instance is already running; exiting")
        return 1
    try:
        config = load_config(args.config)
        log.info("Config from %s", config.path)
        if not config.supabase_url or not config.supabase_anon_key:
            log.error("supabase_url / supabase_anon_key missing in config.json; tracking locally only")
        app = build_app(config, data_dir)
        if app.auth.load_saved():
            log.info("Loaded saved session for %s", app.auth.email or app.auth.user_id)
        else:
            log.info("No saved session: sign in from the tray menu")
        app.start()
        if config.capture_hotkey and app.archive is not None and sys.platform == "win32":
            HotkeyListener(config.capture_hotkey, app.capture_selection,
                           on_fail=lambda msg: tray.notify(app.icon, msg)).start()
        if tray.TRAY_AVAILABLE and not args.no_tray:
            icon = tray.build_icon(app)
            app.icon = icon

            def setup(icon_ready) -> None:
                icon_ready.visible = True
                if app.needs_login():
                    tray.notify(icon_ready, "Sign in from the tray menu to sync your computer time")

            icon.run(setup=setup)
        else:
            log.info("Running without tray; press Ctrl+C to stop")
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                app.quit()
    finally:
        guard.release()
    return 0
