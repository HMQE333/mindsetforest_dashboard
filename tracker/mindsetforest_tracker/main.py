"""Wiring: config -> store -> auth -> sampler -> session tracker -> sync -> tray.

``TrackerApp`` owns the capture thread and implements ``tray.TrayController``.
``main()`` adds logging, the single-instance guard and the tray loop. This is
the only module with process-level state.

One exe is the setup and the tracker, so ``main()`` first decides what this
start is for (``decide_action``): the setup or settings window, a silent
install, an uninstall, CI's self-test, or tracking. The setup modules
(``winsetup``, ``setup_gui`` with tkinter) are imported only by the branches
that use them, so the tracker itself never needs them.
"""
from __future__ import annotations

import argparse
import contextlib
import logging
import logging.handlers
import ntpath
import os
import subprocess
import sys
import threading
import time
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

import psutil

from . import __version__, tray
from .recordings import IntakeState, IntakeWorker, KosClient, VaultMirror
from .archive_capture import (
    ArchiveClient, HotkeyListener, clean_source, foreground_title, parse_hotkey, read_selection,
)
from .auth import AuthError, AuthUnavailable, SupabaseAuth
from .capture import Sampler, default_sampler
from .config import DEFAULT_DASHBOARD_URL, LEGACY_DASHBOARD_URLS, Config, app_data_dir, load_config, save_config
from .privacy import is_private
from .sessions import LOCKED_APP, SessionTracker, iso_utc
from .store import Store
from .sync import SyncClient, SyncError, SyncStatus, SyncWorker

log = logging.getLogger("mindsetforest_tracker")
PURGE_EVERY_SECONDS = 24 * 3600
MENU_REFRESH_SECONDS = 5
# The setup creates this file in the data dir to ask a running tracker to quit
# (same name as winsetup.QUIT_REQUEST; a file works across versions, no IPC).
QUIT_REQUEST_FILE = "quit.request"
QUIT_CHECK_SECONDS = 1.0
# Written to the data dir while the server refuses the saved login (same name as winsetup.NEEDS_LOGIN):
# the settings window reads it instead of refreshing the session, which would sign the tracker out.
NEEDS_LOGIN_FILE = "needs_login"
DEFAULT_HOTKEY = "alt+shift+s"
LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def _add_log_file(path: Path) -> None:
    """A rotating log file (1 MB x 3), opened only when the first record arrives."""
    path.parent.mkdir(parents=True, exist_ok=True)
    handler = logging.handlers.RotatingFileHandler(path, maxBytes=1_000_000, backupCount=3, encoding="utf-8",
                                                   delay=True)
    handler.setFormatter(logging.Formatter(LOG_FORMAT))
    logging.getLogger().addHandler(handler)


def setup_logging(path: Path, console: bool) -> None:
    """Rotating log file (1 MB x 3) plus stderr when ``console``."""
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    _add_log_file(path)
    if console:
        stream = logging.StreamHandler()
        stream.setFormatter(logging.Formatter(LOG_FORMAT))
        root.addHandler(stream)


def _log_to(path: Path) -> None:
    """Swap the log file for ``path``; the console handler, if any, stays."""
    _close_file_logs()
    _add_log_file(path)


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


def own_pids(*, frozen: bool | None = None, executable: str | None = None) -> set[int]:
    """This process, plus the onefile bootloader that started it.

    The onefile exe runs as two processes, the bootloader and its Python
    child, so a stale tracker.lock pid reused by our own bootloader is not
    another tracker. Only when frozen and only when the parent runs the same
    exe: from a source checkout the parent can be the real tracker (the tray
    starts the settings window), which must not count as self.
    """
    pids = {os.getpid()}
    if not (bool(getattr(sys, "frozen", False)) if frozen is None else frozen):
        return pids
    try:
        parent = psutil.Process(os.getppid())
        if same_path(parent.exe(), executable or sys.executable):
            pids.add(parent.pid)
    except (psutil.Error, OSError, ValueError):
        pass
    return pids


class SingleInstance:
    """Pid-file guard so two trackers never run for the same user.

    A stale lock (pid gone, or reused by an unrelated process or by our own
    onefile bootloader) is taken over.
    """

    def __init__(self, path: Path, is_tracker: Callable[[int], bool] = pid_is_tracker,
                 self_pids: Callable[[], set[int]] = own_pids) -> None:
        self.path = path
        self.is_tracker = is_tracker
        self.self_pids = self_pids

    def acquire(self) -> bool:
        try:
            other = int(self.path.read_text().strip())
        except (OSError, ValueError):
            other = 0
        if other and other not in self.self_pids() and self.is_tracker(other):
            return False
        if other and other != os.getpid():
            log.warning("Taking over stale lock file (pid %d is not another tracker)", other)
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
                 archive: ArchiveClient | None = None,
                 hotkey_factory: Callable[..., Any] | None = None,
                 quit_request: Path | None = None, login_marker: Path | None = None) -> None:
        self.clock = clock
        self.config = config
        self.store = store
        self.auth = auth
        self.sampler = sampler
        self.tracker = tracker
        self.client = client
        self.sync_worker = sync_worker
        self.device_id = device_id
        url = (config.dashboard_url or "").strip()
        # The zip version's placeholder domain belongs to nobody: never open it.
        self.dashboard_url = DEFAULT_DASHBOARD_URL if not url or url in LEGACY_DASHBOARD_URLS else url
        self.login_marker = login_marker
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
        # The save-to-Archive hotkey: config.json's until the dashboard sets one.
        self._hotkey_factory = hotkey_factory
        self._hotkey_listener: Any = None
        self._hotkey_spec: str | None = None
        self._hotkey_lock = threading.Lock()
        self.intake: Any = None
        # Graceful quit when the setup asks (upgrade, settings saved, uninstall).
        self.quit_request = quit_request
        self.shutdown_event = threading.Event()  # set once quit() is done, whoever asked
        self._last_quit_check: float | None = None
        self._shutdown_requested = False
        self._shutdown_lock = threading.Lock()
        self._quit_lock = threading.Lock()
        self._closed = False
        sync_worker.on_status = self.on_sync_status
        sync_worker.on_capture_hotkey = self.on_capture_hotkey
        sync_worker.on_private_keywords = self.on_private_keywords
        sync_worker.on_hotkey_pushed = self.on_hotkey_pushed
        if getattr(config, "capture_hotkey_push", False):
            # Chosen in the setup window: the dashboard's value would win at the next pull.
            sync_worker.pending_hotkey = config.capture_hotkey
        # The dashboard names devices by this (unless the user named it there); else it shows the random id.
        sync_worker.pending_device_name = (device_id, config.device_name or "")

    # -- lifecycle -----------------------------------------------------------

    def start(self) -> None:
        if self.quit_request is not None:
            try:  # a request left over from a setup that killed the old tracker is not for us
                self.quit_request.unlink(missing_ok=True)
            except OSError as exc:
                log.warning("Could not remove %s: %s", self.quit_request, exc)
        self.sync_worker.start()
        if self.intake is not None:
            self.intake.start()
        self._thread.start()
        self.apply_capture_hotkey(self.config.capture_hotkey)
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
        self._check_quit_request(ts)

    def _check_quit_request(self, ts: float) -> None:
        """Quit when the setup has created the quit-request file (looked for at most once a second)."""
        if self.quit_request is None or self._shutdown_requested:
            return
        last = self._last_quit_check
        if last is not None and 0 <= ts - last < QUIT_CHECK_SECONDS:
            return
        self._last_quit_check = ts
        try:
            if not self.quit_request.is_file():
                return
        except OSError:
            return
        try:
            self.quit_request.unlink(missing_ok=True)
        except OSError as exc:  # quit anyway; the next start removes it
            log.warning("Quit request seen but not removed: %s", exc)
        log.info("Quit requested by setup")
        self.request_shutdown()

    def request_shutdown(self) -> None:
        """Quit from any thread without blocking it.

        The quit request is noticed on the capture thread and ``quit`` joins
        that thread, so the work runs on a thread of its own. When it is done
        the tray loop is stopped and ``shutdown_event`` is set, which ends
        ``main()`` either way (tray or no tray).
        """
        with self._shutdown_lock:
            if self._shutdown_requested:
                return
            self._shutdown_requested = True
        threading.Thread(target=self._shutdown, name="mf-shutdown").start()

    def _shutdown(self) -> None:
        try:
            self.quit()
        except Exception:
            log.exception("quit failed")
        finally:
            icon = self.icon
            if icon is not None:
                try:
                    icon.stop()
                except Exception:
                    log.debug("icon.stop failed", exc_info=True)
            self.shutdown_event.set()

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
        """Flush the open session, sync once, close the store.

        Runs once: the tray's Quit can arrive while a quit request is being
        handled, and the second caller just waits for the first.
        """
        with self._quit_lock:
            if self._closed:
                return
            self._closed = True
            self._stop.set()
            if self._thread.is_alive() and threading.current_thread() is not self._thread:
                self._thread.join(timeout=5)
            with self._lock:
                for session in self.tracker.close_current(self.clock()):
                    self.store.upsert_session(session, self.device_id)
            self.apply_capture_hotkey("")
            if self.intake is not None:
                self.intake.stop()
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
        if self.login_marker is not None:
            with contextlib.suppress(OSError):
                self.login_marker.unlink()
        self.sync_worker.request_sync()
        log.info("Signed in as %s", email)
        self._refresh_menu()
        return None

    def open_settings(self) -> None:
        """Open the setup window in settings mode, as a process of its own.

        pystray holds this process's main thread and tkinter wants one too, and
        saving in the window restarts the tracker, so it cannot live in here.
        """
        argv = settings_argv(bool(getattr(sys, "frozen", False)), sys.executable)
        try:
            if sys.platform == "win32":
                # Detached, and without PyInstaller's variables: a onefile child would
                # otherwise reuse this process's unpack folder, gone when the tracker restarts.
                from .winsetup import WinOps

                WinOps().launch_detached(argv)
            else:
                subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL, start_new_session=True)
        except Exception as exc:
            log.exception("Could not open the settings window")
            tray.notify(self.icon, f"Nie udało się otworzyć ustawień ({exc}).")
            return
        log.info("Settings window opened: %s", " ".join(argv))

    def on_hotkey_pushed(self) -> None:
        """The setup window's hotkey reached the dashboard: stop sending it."""
        with self._lock:
            if not getattr(self.config, "capture_hotkey_push", False):
                return
            self.config.capture_hotkey_push = False
            try:
                save_config(self.config)
            except OSError as exc:
                log.error("Could not save config: %s", exc)

    def on_private_keywords(self, keywords: list[str]) -> None:
        """The dashboard's never-record keywords, on top of config.json's own."""
        with self._lock:  # the capture thread feeds the tracker under the same lock
            self._private_keywords = [*self.config.private_keywords, *keywords]
            self.tracker.set_private_keywords(self._private_keywords)

    # -- save selection to Archive ---------------------------------------------

    def capture_hint(self) -> str | None:
        """Tray line naming the hotkey, or None when it is off."""
        hotkey = self._hotkey_spec if self._hotkey_spec is not None else self.config.capture_hotkey
        return f"Save selection to Archive: {hotkey.title()}" if hotkey and self.archive else None

    def on_capture_hotkey(self, spec: str | None) -> None:
        """The dashboard's hotkey after a sync; None (never set there) falls back to config.json."""
        if spec is not None:
            self._remember_hotkey(spec)
        self.apply_capture_hotkey(self.config.capture_hotkey if spec is None else spec)

    def _remember_hotkey(self, spec: str) -> None:
        """Save the dashboard's hotkey in config.json, so the settings window shows the one in use.

        Not while our own choice waits to be pushed: a failed push is followed
        by a pull of the old value, which must not replace the user's new one.
        Saved only on a change (this runs every minute) and only a valid spec.
        """
        spec = (spec or "").strip().lower()
        if spec:
            try:
                parse_hotkey(spec)
            except ValueError:
                return
        with self._lock:
            if spec == (self.config.capture_hotkey or "").strip().lower():
                return
            if getattr(self.config, "capture_hotkey_push", False) or self.sync_worker.pending_hotkey is not None:
                return
            self.config.capture_hotkey = spec
            try:
                save_config(self.config)
            except OSError as exc:
                log.error("Could not save config: %s", exc)

    def apply_capture_hotkey(self, spec: str) -> None:
        """Switch the global hotkey to ``spec`` ("" turns it off); no-op when unchanged."""
        spec = (spec or "").strip().lower()
        with self._hotkey_lock:
            if spec == self._hotkey_spec:
                return
            if self._hotkey_listener is not None:
                self._hotkey_listener.stop()
                self._hotkey_listener = None
            self._hotkey_spec = spec
            if spec and self.archive is not None and self._hotkey_factory is not None:
                listener = self._hotkey_factory(spec, self.capture_selection,
                                                on_fail=lambda msg: tray.notify(self.icon, msg))
                listener.start()
                self._hotkey_listener = listener
        log.info("Save-to-Archive hotkey: %s", spec or "off")
        self._refresh_menu()

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
        self._mark_login(status)
        if status.needs_login and not self._login_notified:
            self._login_notified = True
            tray.notify(self.icon, "Sign in from the tray menu to sync your computer time")
        elif not status.needs_login:
            self._login_notified = False

    def _mark_login(self, status: SyncStatus) -> None:
        """Keep the needs_login marker in step: there while the login is refused, gone after a good sync."""
        marker = self.login_marker
        if marker is None:
            return
        try:
            if status.needs_login:
                if not marker.exists():
                    marker.write_text((status.last_error or "sign in required") + "\n", encoding="utf-8")
            elif status.last_error is None:
                marker.unlink(missing_ok=True)
        except OSError as exc:
            log.warning("Could not update %s: %s", marker, exc)


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
    app = TrackerApp(config, store, auth, sampler or default_sampler(), tracker, client, worker, device_id,
                     archive=archive, hotkey_factory=HotkeyListener if sys.platform == "win32" else None,
                     quit_request=data_dir / QUIT_REQUEST_FILE, login_marker=data_dir / NEEDS_LOGIN_FILE)
    if config.supabase_url and config.vault_dir:
        # An empty recordings_dir turns transcription off; the vault is still mirrored.
        kos = KosClient(config.supabase_url, config.supabase_anon_key, auth)

        def notify(message: str) -> bool:
            """Show a balloon; False when it cannot be shown yet (no icon, or not on screen yet)."""
            icon = app.icon
            if icon is None or not getattr(icon, "visible", False):
                return False
            return tray.notify(icon, message)

        app.intake = IntakeWorker(
            Path(config.recordings_dir) if config.recordings_dir else None, Path(config.vault_dir),
            config.session_gap_minutes, kos, IntakeState.load(data_dir / "recordings.json"),
            notify=notify, mirror=VaultMirror(Path(config.vault_dir), kos), since=config.recordings_since,
        )
    return app


# -- one exe: what this start is for ------------------------------------------------

ACTIONS = ("self-test", "uninstall", "silent-install", "install-gui", "settings-gui", "tracker")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="mindsetforest-tracker")
    parser.add_argument("--config", type=Path, help="path to config.json")
    parser.add_argument("--console", action="store_true", help="also log to stderr")
    parser.add_argument("--no-tray", action="store_true", help="run without a tray icon (Ctrl+C to stop)")
    parser.add_argument("--autostart", action="store_true",
                        help="started with Windows: if a tracker already runs, exit quietly (no settings window)")
    setup = parser.add_argument_group("setup (the same exe installs, configures and removes the tracker)")
    setup.add_argument("--setup", action="store_true", help="open the setup window")
    setup.add_argument("--settings", action="store_true", help="open the settings window")
    setup.add_argument("--install", action="store_true", help="install or upgrade (with --silent: no window)")
    setup.add_argument("--uninstall", action="store_true", help="remove the program (with --silent: no questions)")
    setup.add_argument("--silent", action="store_true", help="no window, for --install and --uninstall")
    setup.add_argument("--remove-data", action="store_true",
                       help="with --uninstall: also delete the local data (never the vault or recordings)")
    setup.add_argument("--self-test", type=Path, metavar="PATH", help="run the smoke checks, write JSON to PATH")
    setup.add_argument("--no-launch", action="store_true", help="with --install: do not start the tracker")
    setup.add_argument("--no-autostart", action="store_true", help="with --install: do not start with Windows")
    setup.add_argument("--recordings", metavar="DIR", help="with --install: the folder with MP3 recordings")
    setup.add_argument("--no-transcribe", action="store_true", help="with --install: no transcription")
    setup.add_argument("--skip-existing", action="store_true",
                       help="with --install: a new recordings folder's MP3s already there are not transcribed")
    setup.add_argument("--vault", metavar="DIR", help="with --install: the Obsidian vault folder")
    setup.add_argument("--hotkey", metavar="SPEC", help='with --install: save-to-Archive hotkey ("" = off)')
    setup.add_argument("--site", metavar="URL", help="with --install: the dashboard to fetch settings from")
    setup.add_argument("--supabase-url", metavar="URL", help="with --install: Supabase URL")
    setup.add_argument("--anon-key", metavar="KEY", help="with --install: Supabase publishable key")
    return parser


def same_path(a: Path | str, b: Path | str, *, windows: bool | None = None) -> bool:
    """Same file: compared resolved, and ignoring case on Windows."""
    windows = sys.platform == "win32" if windows is None else windows

    def key(p: Path | str) -> str:
        try:
            text = str(Path(p).resolve())
        except (OSError, RuntimeError):
            text = os.path.abspath(p)
        return ntpath.normcase(text) if windows else text

    return key(a) == key(b)


def decide_action(args: argparse.Namespace, *, frozen: bool, exe: Path, installed: Path, configured: bool) -> str:
    """What this start of the exe is for: one of ``ACTIONS``.

    Explicit flags win. Then a frozen exe that is not the installed copy is
    the downloaded setup, and an installed one without Supabase settings has
    an unfinished setup: both open the setup window. Everything else tracks
    (and a source checkout always tracks unless told otherwise).
    """
    if getattr(args, "self_test", None):
        return "self-test"
    if getattr(args, "uninstall", False):
        return "uninstall"
    if getattr(args, "install", False):
        return "silent-install" if getattr(args, "silent", False) else "install-gui"
    if getattr(args, "setup", False):
        return "install-gui"
    if getattr(args, "settings", False):
        return "settings-gui"
    if frozen and not same_path(exe, installed):
        return "install-gui"
    if frozen and not configured:
        return "install-gui"
    return "tracker"


def settings_argv(frozen: bool, executable: str) -> list[str]:
    """The command that opens the settings window: the exe itself, or run_tracker.py in a checkout."""
    if frozen:
        return [executable, "--settings"]
    return [executable, str(Path(__file__).resolve().parent.parent / "run_tracker.py"), "--settings"]


def _configured(config: Config) -> bool:
    return bool(config.supabase_url and config.supabase_anon_key)


def silent_choices(args: argparse.Namespace, existing: Config | None, ops: Any,
                   fetch: Callable[[str], dict] | None = None) -> Any:
    """``SetupChoices`` for ``--install --silent``: flags, then the existing config, then the window's defaults.

    The existing config comes before the defaults so a silent upgrade keeps
    the folders and hotkey the user chose. Supabase settings come from the
    flags, else from the dashboard's published file, else from that config.
    """
    from . import winsetup

    fetch = fetch or winsetup.fetch_site_config
    url, key = (args.supabase_url or "").strip(), (args.anon_key or "").strip()
    site = (args.site or "").strip().rstrip("/") + "/" if (args.site or "").strip() else ""
    dashboard = site or winsetup.site_for(existing.dashboard_url if existing is not None else "")
    if not (url and key):
        try:
            fetched = fetch(site or winsetup.DEFAULT_SITE)
        except winsetup.SetupError as exc:
            if existing is None or not _configured(existing):
                raise
            log.warning("Keeping the Supabase settings of the existing config: %s", exc)
            fetched = {"supabase_url": existing.supabase_url, "supabase_anon_key": existing.supabase_anon_key}
        url, key = url or fetched["supabase_url"], key or fetched["supabase_anon_key"]
        dashboard = fetched.get("dashboard_url") or dashboard
    if args.no_transcribe:
        recordings = ""
    elif args.recordings:
        recordings = args.recordings
    elif existing is not None:
        recordings = existing.recordings_dir
    else:
        recordings = str(winsetup.detect_bandicam_dir(ops)[0])
    vault = args.vault or (existing.vault_dir if existing is not None else "") or str(winsetup.default_vault_dir())
    if args.hotkey is not None:
        hotkey = args.hotkey
    else:
        hotkey = existing.capture_hotkey if existing is not None else DEFAULT_HOTKEY
    # An upgrade keeps autostart as the user left it (off stays off); a fresh install turns it on.
    autostart = not args.no_autostart
    if autostart and (existing is not None or winsetup.installed_exe().exists()):
        try:
            autostart = winsetup.autostart_enabled(ops)
        except Exception as exc:  # unreadable: keep it on rather than drop it
            log.warning("Could not read the autostart setting: %s", exc)
    return winsetup.SetupChoices(
        supabase_url=url, supabase_anon_key=key, dashboard_url=dashboard, recordings_dir=recordings,
        vault_dir=vault, capture_hotkey=hotkey.strip().lower(), autostart=autostart,
        # Only a hotkey given on the command line goes to the dashboard; otherwise the account's stays.
        push_hotkey=args.hotkey is not None,
        # Old MP3s go out only from a folder named after Bandicam (or when the folder is unchanged).
        include_existing=not args.skip_existing and "bandicam" in (recordings or "").lower(),
    )


def silent_install(args: argparse.Namespace, data_dir: Path, *, frozen: bool, ops: Any = None) -> int:
    """``--install --silent``: 0 when installed, 2 on any problem (the reason is in setup.log)."""
    from . import winsetup

    ops = ops if ops is not None else winsetup.WinOps()
    try:
        existing = winsetup.load_existing_config(data_dir, winsetup.find_legacy_install(ops), ops)
        choices = silent_choices(args, existing, ops)
        result = winsetup.install(choices, data_dir=data_dir, source_exe=Path(sys.executable) if frozen else None,
                                  ops=ops, launch=not args.no_launch)
    except winsetup.SetupError as exc:
        log.error("Setup failed: %s", exc)
        return 2
    except Exception:
        log.exception("Setup failed")
        return 2
    for line in result.messages:
        log.info("Setup: %s", line)
    log.info("Installed %s (config %s, tracker started: %s)", result.exe, result.config_path, result.started)
    return 0


def run_uninstall(args: argparse.Namespace, data_dir: Path, *, frozen: bool, ops: Any = None,
                  confirm: Callable[[], bool] | None = None,
                  show: Callable[[str, str], None] | None = None) -> int:
    """``--uninstall``: asks first unless ``--silent``; 0 when removed, 1 when cancelled, 2 on failure.

    The program file is deleted only after the final message box: the cleanup
    waits for this process to exit, so a dialog left open never beats it.
    (``winsetup.uninstall`` closes our log file itself when the data goes.)
    """
    from . import winsetup

    ops = ops if ops is not None else winsetup.WinOps()
    if show is None:
        show = (lambda _kind, _text: None) if args.silent else _show_message
    if not args.silent and not (confirm or _confirm_uninstall)():
        log.info("Uninstall cancelled")
        return 1
    try:
        result = winsetup.uninstall(data_dir=data_dir, ops=ops, remove_data=args.remove_data,
                                    running_exe=Path(sys.executable) if frozen else None)
    except Exception as exc:
        log.exception("Uninstall failed")
        show("error", f"Nie udało się odinstalować MindsetForest Tracker: {exc}")
        return 2
    show("info", "\n".join(["Odinstalowano MindsetForest Tracker.", "", *result.messages]))
    winsetup.schedule_cleanup(ops, result.pending_delete)
    return 0


def _confirm_uninstall() -> bool:  # pragma: no cover - GUI
    """Yes/no before removing the program. Windows has already asked once, so a dialog that
    cannot be shown does not block the uninstall."""
    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        try:
            return bool(messagebox.askyesno(
                "MindsetForest", "Odinstalować MindsetForest Tracker? Twoje notatki i vault zostaną.", parent=root))
        finally:
            root.destroy()
    except Exception:
        log.warning("Could not ask before uninstalling; going ahead", exc_info=True)
        return True


def _show_message(kind: str, text: str) -> None:  # pragma: no cover - GUI
    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        try:
            (messagebox.showerror if kind == "error" else messagebox.showinfo)("MindsetForest", text, parent=root)
        finally:
            root.destroy()
    except Exception:
        log.warning("Could not show a message: %s", text, exc_info=True)


def _close_file_logs() -> None:
    """Stop writing log files (they would keep the data dir from being deleted on Windows)."""
    root = logging.getLogger()
    for handler in list(root.handlers):
        if isinstance(handler, logging.FileHandler):
            root.removeHandler(handler)
            handler.close()


def open_window(mode: str, *, data_dir: Path, frozen: bool) -> int:
    """The setup window, "install" or "settings". tkinter is imported only here."""
    from . import winsetup
    from .setup_gui import run_setup_window

    return run_setup_window(mode, data_dir=data_dir, ops=winsetup.WinOps(),
                            source_exe=Path(sys.executable) if frozen else None)


def run_setup_action(action: str, args: argparse.Namespace, *, data_dir: Path, frozen: bool) -> int:
    """Every action except "tracker"."""
    from . import winsetup

    if action == "self-test":
        try:
            return 0 if winsetup.self_test(args.self_test, winsetup.WinOps()) else 1
        except Exception:
            log.exception("Self-test failed")
            return 1
    if action == "silent-install":
        return silent_install(args, data_dir, frozen=frozen)
    if action == "uninstall":
        return run_uninstall(args, data_dir, frozen=frozen)
    try:
        return open_window("install" if action == "install-gui" else "settings", data_dir=data_dir, frozen=frozen)
    except Exception:
        log.exception("The setup window failed")
        raise


def already_running(args: argparse.Namespace, guard: SingleInstance, *, data_dir: Path, frozen: bool) -> int | None:
    """Another tracker holds the lock: the exit code, or None when this start should track after all.

    Nothing here writes tracker.log: it belongs to the running tracker, and a
    second process rotating it fails on Windows. A logon start (``--autostart``)
    never opens a window: it exits quietly, unless the old zip tracker (its
    Startup shortcut is back) won the race; that one is retired and this start
    takes over. A Start menu click opens the settings window instead.
    """
    _log_to(data_dir / "setup.log")
    if getattr(args, "autostart", False):
        from . import winsetup

        try:
            replaced = winsetup.replace_legacy_tracker(data_dir, winsetup.WinOps())
        except Exception:
            log.warning("Checking for the old zip tracker failed", exc_info=True)
            replaced = False
        if replaced and guard.acquire():
            log.info("Autostart: replaced the old zip tracker; tracking here")
            _log_to(data_dir / "tracker.log")
            return None
        log.info("Autostart: another tracker instance is already running; exiting")
        return 0
    if frozen:  # the Start menu shortcut while the tracker runs: show the settings instead
        log.info("Another tracker instance is already running; opening the settings window")
        return run_setup_action("settings-gui", args, data_dir=data_dir, frozen=frozen)
    log.error("Another tracker instance is already running; exiting")
    return 1


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    frozen = bool(getattr(sys, "frozen", False))
    exe = Path(sys.executable)
    data_dir = app_data_dir()
    installed = exe
    if frozen:
        from .winsetup import installed_exe

        installed = installed_exe()
    action = decide_action(args, frozen=frozen, exe=exe, installed=installed,
                           configured=_configured(load_config(args.config)))
    console = args.console or not frozen
    if action != "tracker":
        # Its own log: a second process rotating tracker.log fails on Windows.
        setup_logging(data_dir / "setup.log", console=console)
        log.info("MindsetForest %s: %s (%s)", __version__, action, exe)
        return run_setup_action(action, args, data_dir=data_dir, frozen=frozen)

    setup_logging(data_dir / "tracker.log", console=console)  # the file opens with the first record
    guard = SingleInstance(data_dir / "tracker.lock")
    if not guard.acquire():
        code = already_running(args, guard, data_dir=data_dir, frozen=frozen)
        if code is not None:
            return code
    try:
        config = load_config(args.config)  # again, now that a bad file can be logged
        log.info("Tracker %s, config from %s", __version__, config.path)
        if not _configured(config):
            log.error("supabase_url / supabase_anon_key missing in config.json; tracking locally only")
        app = build_app(config, data_dir)
        if app.auth.load_saved():
            log.info("Loaded saved session for %s", app.auth.email or app.auth.user_id)
        else:
            log.info("No saved session: sign in from the tray menu")
        app.start()
        if tray.TRAY_AVAILABLE and not args.no_tray:
            icon = tray.build_icon(app)
            app.icon = icon

            def setup(icon_ready) -> None:
                icon_ready.visible = True
                if app.shutdown_event.is_set():  # a quit request came before the icon existed
                    icon_ready.stop()
                    return
                if app.needs_login():
                    tray.notify(icon_ready, "Sign in from the tray menu to sync your computer time")

            icon.run(setup=setup)
        else:
            log.info("Running without tray; press Ctrl+C to stop")
            try:
                while not app.shutdown_event.wait(1.0):  # a timeout keeps Ctrl+C working on Windows
                    pass
            except KeyboardInterrupt:
                app.quit()
    finally:
        guard.release()
    return 0
