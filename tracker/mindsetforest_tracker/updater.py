"""Self-update from the tracker-latest GitHub release, with no clicks.

CI publishes ``tracker-latest.json`` next to ``MindsetForestSetup.exe``:
``{"version", "sha256", "url"}``. A short while after start and then every
12 hours the tracker reads it; when the version is newer it downloads the exe
to a temp folder, checks its SHA-256 (a mismatch is logged and the file
deleted) and, once the user is away (no input for 10 minutes) or the tracker
has only just started, runs it as ``--install --silent``. That is the same
upgrade CI tests end to end: the setup asks this tracker to quit through
``quit.request`` (the open session is flushed and synced), replaces the
program and starts the new one. Never while a save to Archive is in flight.

The new tracker compares ``__version__`` with the one stored in the ``kv``
table and shows one toast "Zaktualizowano do <version>".

Off when running from the sources (not a frozen exe) or with ``auto_update``
false in config.json (tray: "Aktualizuj automatycznie").
"""
from __future__ import annotations

import hashlib
import logging
import re
import shutil
import sys
import tempfile
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

log = logging.getLogger(__name__)

MANIFEST_URL = ("https://github.com/HMQE333/mindsetforest_dashboard/releases/download/"
                "tracker-latest/tracker-latest.json")
FIRST_CHECK_SECONDS = 120.0
CHECK_EVERY_SECONDS = 12 * 3600.0
POLL_SECONDS = 60.0               # how often a downloaded update looks for a moment to install
IDLE_SECONDS = 10 * 60.0          # no keyboard/mouse input this long counts as "away"
STARTUP_SECONDS = 10 * 60.0       # within this of the start, installing interrupts nothing yet
RETRY_SECONDS = 24 * 3600.0       # an installer that ran but left this version running is not rerun sooner
TIMEOUT = 20.0
DOWNLOAD_TIMEOUT = 120.0
MAX_EXE_BYTES = 300 * 1024 * 1024
KV_VERSION = "app_version"                # the version that last ran: a change means "updated"
KV_ATTEMPT = "update_attempt"             # "<version> <epoch>" of the last installer started
UPDATED_TITLE = "MindsetForest Tracker"
DOWNLOAD_DIR = "mindsetforest-update"
_SHA256 = re.compile(r"^[0-9a-f]{64}$")


class UpdateError(Exception):
    """A manifest or download that must not be installed."""


def parse_version(text: str) -> tuple[int, ...]:
    """``"1.10.2"`` -> ``(1, 10, 2)``; ValueError for anything but dot-separated numbers."""
    parts = str(text).strip().lstrip("vV").split(".")
    if not parts or not all(p.isdigit() for p in parts):
        raise ValueError(f"not a version: {text!r}")
    return tuple(int(p) for p in parts)


def is_newer(remote: str, local: str) -> bool:
    """True when ``remote`` is a higher version than ``local`` (1.10 > 1.9; 1.5 == 1.5.0)."""
    a, b = list(parse_version(remote)), list(parse_version(local))
    width = max(len(a), len(b))
    return a + [0] * (width - len(a)) > b + [0] * (width - len(b))


@dataclass(frozen=True)
class Release:
    version: str
    sha256: str
    url: str


def parse_manifest(data: Any) -> Release:
    """Validate ``tracker-latest.json``; UpdateError on anything missing or odd."""
    if not isinstance(data, dict):
        raise UpdateError("manifest is not a JSON object")
    version, sha, url = data.get("version"), data.get("sha256"), data.get("url")
    if not isinstance(version, str):
        raise UpdateError("manifest has no version")
    try:
        parse_version(version)
    except ValueError as exc:
        raise UpdateError(str(exc)) from exc
    if not isinstance(sha, str) or not _SHA256.match(sha.strip().lower()):
        raise UpdateError("manifest sha256 is not 64 hex digits")
    if not isinstance(url, str) or urlparse(url).scheme != "https" or not urlparse(url).netloc:
        raise UpdateError("manifest url is not https")
    return Release(version.strip(), sha.strip().lower(), url.strip())


def fetch_manifest(http: Any = requests, url: str = MANIFEST_URL, timeout: float = TIMEOUT) -> Release:
    try:
        resp = http.get(url, timeout=timeout, headers={"Accept": "application/json"})
    except requests.RequestException as exc:
        raise UpdateError(f"manifest unreachable: {exc}") from exc
    if resp.status_code != 200:
        raise UpdateError(f"manifest HTTP {resp.status_code}")
    try:
        data = resp.json()
    except ValueError as exc:
        raise UpdateError("manifest is not JSON") from exc
    return parse_manifest(data)


def download(release: Release, dest_dir: Path, http: Any = requests, timeout: float = DOWNLOAD_TIMEOUT) -> Path:
    """Download the setup exe into ``dest_dir`` and check its SHA-256; nothing is left behind on failure."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    final = dest_dir / f"MindsetForestSetup-{release.version}.exe"
    part = final.with_name(final.name + ".part")
    digest = hashlib.sha256()
    size = 0
    try:
        with http.get(release.url, timeout=timeout, stream=True) as resp:
            if resp.status_code != 200:
                raise UpdateError(f"download HTTP {resp.status_code}")
            with open(part, "wb") as fh:
                for chunk in resp.iter_content(chunk_size=256 * 1024):
                    if not chunk:
                        continue
                    size += len(chunk)
                    if size > MAX_EXE_BYTES:
                        raise UpdateError("download is larger than any setup exe")
                    digest.update(chunk)
                    fh.write(chunk)
        got = digest.hexdigest()
        if got != release.sha256:
            raise UpdateError(f"SHA-256 mismatch: expected {release.sha256}, got {got}")
        part.replace(final)
        return final
    except requests.RequestException as exc:
        raise UpdateError(f"download failed: {exc}") from exc
    finally:
        part.unlink(missing_ok=True)


def idle_seconds() -> float | None:
    """Seconds since the last keyboard/mouse input (GetLastInputInfo); None off Windows or on failure."""
    if sys.platform != "win32":
        return None
    try:  # pragma: no cover - Windows only
        import ctypes
        from ctypes import wintypes

        class LASTINPUTINFO(ctypes.Structure):
            _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]

        info = LASTINPUTINFO(cbSize=ctypes.sizeof(LASTINPUTINFO))
        if not ctypes.windll.user32.GetLastInputInfo(ctypes.byref(info)):
            return None
        now = ctypes.windll.kernel32.GetTickCount() & 0xFFFFFFFF
        return ((now - info.dwTime) & 0xFFFFFFFF) / 1000.0  # both wrap after 49.7 days
    except Exception:  # pragma: no cover
        log.debug("GetLastInputInfo failed", exc_info=True)
        return None


def can_update(*, frozen: bool, enabled: bool) -> bool:
    """Only an installed exe updates itself, and only while ``auto_update`` is on."""
    return frozen and enabled


def good_moment(*, now: float, started_at: float, idle: float | None, busy: bool) -> bool:
    """Install now? Never during a capture; right after start, or once the user has been away 10 minutes."""
    if busy:
        return False
    if 0 <= now - started_at < STARTUP_SECONDS:
        return True
    return idle is not None and idle >= IDLE_SECONDS


def installer_argv(exe: Path) -> list[str]:
    """The silent upgrade CI tests: it stops this tracker gracefully and starts the new one."""
    return [str(exe), "--install", "--silent"]


def _launch_detached(argv: list[str]) -> None:  # pragma: no cover - Windows only
    from .winsetup import WinOps

    WinOps().launch_detached(argv, cwd=Path(argv[0]).parent)


def updated_message(store: Any, version: str) -> str | None:
    """"Zaktualizowano do <version>" once, when this version is newer than the one that last ran."""
    try:
        previous = store.get_kv(KV_VERSION)
        if previous == version:
            return None
        store.set_kv(KV_VERSION, version)
        if previous and is_newer(version, previous):
            return f"Zaktualizowano do {version}"
    except Exception:
        log.debug("Could not compare with the previous version", exc_info=True)
    return None


class Updater:
    """Background thread: check, download, wait for a good moment, start the installer."""

    def __init__(self, *, version: str, store: Any, enabled: Callable[[], bool],
                 busy: Callable[[], bool] = lambda: False, frozen: bool | None = None,
                 http: Any = None, clock: Callable[[], float] = time.time,
                 idle: Callable[[], float | None] = idle_seconds,
                 launch: Callable[[list[str]], None] = _launch_detached,
                 download_dir: Path | None = None) -> None:
        self.version = version
        self.store = store
        self.enabled = enabled
        self.busy = busy
        self.frozen = bool(getattr(sys, "frozen", False)) if frozen is None else frozen
        self.http = http if http is not None else requests.Session()
        self.clock = clock
        self.idle = idle
        self.launch = launch
        self.download_dir = download_dir or Path(tempfile.gettempdir()) / DOWNLOAD_DIR
        self.started_at = clock()
        self.pending: tuple[Release, Path] | None = None
        self.launched = False
        self._last_check: float | None = None
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, name="mf-updater", daemon=True)

    def start(self) -> None:
        if not self.frozen:
            log.info("Auto-update off: running from the sources")
            return
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:  # pragma: no cover - threads
        if self._stop.wait(FIRST_CHECK_SECONDS):
            return
        while not self._stop.is_set():
            try:
                self.step()
            except Exception:
                log.exception("update step failed")
            self._stop.wait(POLL_SECONDS)

    def step(self) -> str:
        """One pass; returns what happened (for tests and the log): off / wait / current / failed / pending / launched."""
        if self.launched:
            return "launched"
        if not can_update(frozen=self.frozen, enabled=self.enabled()):
            return "off"
        now = self.clock()
        if self.pending is None:
            if self._last_check is not None and now - self._last_check < CHECK_EVERY_SECONDS:
                return "wait"
            self._last_check = now
            result = self.check()
            if result != "pending":
                return result
        return self.try_install(now)

    def check(self) -> str:
        try:
            release = fetch_manifest(self.http)
        except UpdateError as exc:
            log.info("Update check: %s", exc)
            return "failed"
        if not is_newer(release.version, self.version):
            log.info("Update check: %s is current (latest %s)", self.version, release.version)
            self._clean_downloads()
            return "current"
        if self._recently_attempted(release.version):
            log.info("Update to %s was started recently and did not take; not again yet", release.version)
            return "failed"
        self._clean_downloads()
        try:
            path = download(release, self.download_dir, self.http)
        except (UpdateError, OSError) as exc:
            log.warning("Update to %s refused: %s", release.version, exc)
            return "failed"
        log.info("Update %s downloaded and verified (%s)", release.version, path)
        self.pending = (release, path)
        return "pending"

    def try_install(self, now: float) -> str:
        release, path = self.pending  # type: ignore[misc]
        if not good_moment(now=now, started_at=self.started_at, idle=self.idle(), busy=self.busy()):
            return "pending"
        if not path.is_file():
            log.warning("Downloaded update %s vanished; downloading again at the next check", path)
            self.pending = None
            return "failed"
        try:
            self.store.set_kv(KV_ATTEMPT, f"{release.version} {now:.0f}")
        except Exception:
            log.debug("Could not store the update attempt", exc_info=True)
        log.info("Installing update %s -> %s: %s", self.version, release.version, path)
        try:
            self.launch(installer_argv(path))
        except Exception:
            log.exception("Could not start the update installer")
            return "failed"
        # The installer asks this tracker to quit through quit.request and starts the new one.
        self.launched = True
        return "launched"

    def _recently_attempted(self, version: str) -> bool:
        try:
            raw = (self.store.get_kv(KV_ATTEMPT) or "").split()
            return len(raw) == 2 and raw[0] == version and 0 <= self.clock() - float(raw[1]) < RETRY_SECONDS
        except (ValueError, TypeError):
            return False
        except Exception:
            log.debug("Could not read the update attempt", exc_info=True)
            return False

    def _clean_downloads(self) -> None:
        """Old setup exes in the temp folder; one still running (locked) is left for next time."""
        try:
            entries = list(self.download_dir.iterdir()) if self.download_dir.is_dir() else []
        except OSError:
            return
        for entry in entries:
            try:
                if entry.is_dir():
                    shutil.rmtree(entry, ignore_errors=True)
                else:
                    entry.unlink()
            except OSError:
                pass
