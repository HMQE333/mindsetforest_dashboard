"""Foreground sampling on Windows.

Every tick the sampler reports the foreground process exe, the CURRENT window
title (re-read every tick, so a long-running editor session follows the file
you are in), seconds since the last keyboard/mouse input (``GetLastInputInfo``)
and whether the screen is locked (no foreground window, or the foreground
process is ``LockApp.exe`` / ``LogonUI.exe``).

For a Chromium browser it also reports the domain of the active tab
(``Sample.host``), read from the address bar (``browser_url``) only when the
window or its title changes (``HostReader``). ``browser_domains`` off in
config.json means no UI Automation at all.

Sleep is not detected here: ``sessions.SessionTracker`` sees the wall-clock
jump between two consecutive samples and closes the open session at the last
good tick.

While the tracker's own window is in front (the tray menu or the sign-in
dialog) the sampler keeps reporting the previous app with ``own_window=True``
so the real session is not split and the tray menu is not rebuilt underneath
the user.

All win32 imports are guarded so the module (and the tests) import on Linux.
``WindowsSampler`` takes its few win32 calls from ``api`` (the tests pass a
fake); ``FakeSampler`` replaces it in non-Windows dev runs.
"""
from __future__ import annotations

import ctypes
import logging
import os
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass, replace
from typing import Any, Protocol

from .browser_url import CHROMIUM_EXES, OmniboxReader
from .normalize import BROWSERS

log = logging.getLogger(__name__)

try:  # pragma: no cover - Windows only
    import psutil
    import win32gui
    import win32process

    WIN32_AVAILABLE = True
except ImportError:  # pragma: no cover
    WIN32_AVAILABLE = False

LOCK_PROCESSES = {"lockapp.exe", "logonui.exe"}
# Windows shell overlays (Start, search, the emoji/clipboard picker, notifications)
# open over the app in use for a moment. They are not an app of their own: the
# sample keeps reporting the app underneath, so a glance at Start neither splits
# a session nor adds unassigned time.
SHELL_OVERLAYS = {
    "searchhost.exe", "searchapp.exe", "searchui.exe", "startmenuexperiencehost.exe",
    "shellexperiencehost.exe", "shellhost.exe", "pickerhost.exe", "textinputhost.exe",
}
PID_CACHE_TTL_SAMPLES = 600
# Reads of the address bar after one that gave nothing (user typing, page still loading).
HOST_RETRIES = 3
GW_OWNER = 4


@dataclass(frozen=True)
class Sample:
    """One observation of the desktop at a tick."""

    exe: str = ""
    title: str = ""
    idle_seconds: float = 0.0
    locked: bool = False
    own_window: bool = False
    # Domain of a Chromium browser's active tab ("chatgpt.com", or "newtab", "file", an
    # internal scheme), "" when unknown. Never a path or a query (browser_url.host_from_omnibox).
    host: str = ""


class Sampler(Protocol):
    def sample(self) -> Sample: ...


class HostReader:
    """When to ask the address bar: on a new window or title, plus ``HOST_RETRIES`` retries after nothing came.

    One read per title change is about one UI Automation call a minute;
    asking every tick would be sixty. The reader itself is made on first use,
    so on the capture thread that calls ``host``: COM objects stay on the
    thread that made them.
    """

    def __init__(self, reader_factory: Callable[[], Any] = OmniboxReader) -> None:
        self._factory = reader_factory
        self._reader: Any = None
        self._broken = False
        self._key: tuple[int, str] | None = None
        self._host = ""
        self._tries = 0

    def host(self, hwnd: int, title: str) -> str:
        """Host of the active tab of ``hwnd`` showing ``title``, "" when unknown."""
        key = (hwnd, title)
        if key != self._key:
            self._key, self._host, self._tries = key, "", 0
        elif self._host or self._tries > HOST_RETRIES:
            return self._host
        reader = self._get_reader()
        if reader is None:
            return ""
        self._tries += 1
        try:
            self._host = reader.host(hwnd) or ""
        except Exception as exc:  # the reader catches its own errors; never let one stop the capture loop
            log.debug("host read failed: %s", exc)
            self._host = ""
        return self._host

    def prune(self, is_window: Callable[[int], bool]) -> None:
        """Let the reader drop what it keeps for closed windows."""
        reader = self._reader
        if reader is None:
            return
        try:
            reader.forget({h for h in reader.windows() if is_window(h)})
        except Exception as exc:
            log.debug("pruning the host cache failed: %s", exc)

    def _get_reader(self) -> Any:
        if self._reader is None and not self._broken:
            try:
                self._reader = self._factory()
            except Exception as exc:
                self._broken = True
                log.warning("Browser domains are off: the address bar reader could not start (%s)", exc)
        return self._reader


if WIN32_AVAILABLE:  # pragma: no cover - Windows only

    class _LASTINPUTINFO(ctypes.Structure):
        _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]

    _user32 = ctypes.windll.user32
    _kernel32 = ctypes.windll.kernel32
    _GetWindow = ctypes.WinDLL("user32").GetWindow  # own instance: argtypes stay local
    _GetWindow.argtypes = [ctypes.c_void_p, ctypes.c_uint]
    _GetWindow.restype = ctypes.c_void_p

    def idle_seconds() -> float:
        """Seconds since the last keyboard/mouse input (0 when unavailable)."""
        info = _LASTINPUTINFO()
        info.cbSize = ctypes.sizeof(info)
        if not _user32.GetLastInputInfo(ctypes.byref(info)):
            return 0.0
        elapsed_ms = (_kernel32.GetTickCount() - info.dwTime) & 0xFFFFFFFF
        return elapsed_ms / 1000.0

    class Win32Api:
        """The win32 calls ``WindowsSampler`` makes."""

        idle_seconds = staticmethod(idle_seconds)

        @staticmethod
        def foreground() -> int:
            return win32gui.GetForegroundWindow()

        @staticmethod
        def pid(hwnd: int) -> int:
            return win32process.GetWindowThreadProcessId(hwnd)[1]

        @staticmethod
        def title(hwnd: int) -> str:
            return win32gui.GetWindowText(hwnd) or ""

        @staticmethod
        def owner(hwnd: int) -> int:
            return _GetWindow(hwnd, GW_OWNER) or 0

        @staticmethod
        def is_window(hwnd: int) -> bool:
            return bool(win32gui.IsWindow(hwnd))

        @staticmethod
        def process_name(pid: int) -> str:
            try:
                return psutil.Process(pid).name()
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                return ""

else:

    def idle_seconds() -> float:
        """Not available off Windows."""
        return 0.0


class WindowsSampler:
    """Reads the foreground window through the win32 API.

    ``api`` makes the win32 calls (``Win32Api`` on Windows; the tests pass a
    fake). ``browser_domains=False`` never creates the address-bar reader.
    """

    def __init__(self, *, browser_domains: bool = True, api: Any = None,
                 reader_factory: Callable[[], Any] = OmniboxReader) -> None:
        if api is None:
            if not WIN32_AVAILABLE:
                raise RuntimeError("win32 is not available: pass api= or use FakeSampler")
            api = Win32Api()  # pragma: no cover - Windows only
        self._api = api
        self._names: dict[int, str] = {}
        self._samples_since_flush = 0
        self._own_pid = os.getpid()
        self._last_good = Sample()
        self._hosts = HostReader(reader_factory) if browser_domains else None

    def _exe_name(self, pid: int) -> str:
        self._samples_since_flush += 1
        if self._samples_since_flush >= PID_CACHE_TTL_SAMPLES:
            self._names.clear()
            self._samples_since_flush = 0
            if self._hosts is not None:
                self._hosts.prune(self._api.is_window)
        name = self._names.get(pid)
        if name is None:
            name = self._api.process_name(pid)
            self._names[pid] = name
        return name

    def sample(self) -> Sample:
        idle = self._api.idle_seconds()
        try:
            hwnd = self._api.foreground()
            if not hwnd:
                return Sample(idle_seconds=idle, locked=True)
            pid = self._api.pid(hwnd)
            if pid == self._own_pid:
                return replace(self._last_good, idle_seconds=idle, own_window=True)
            exe = self._exe_name(pid)
            name = exe.lower()
            if name in LOCK_PROCESSES:
                return Sample(exe=exe, idle_seconds=idle, locked=True)
            # Shell overlays, and a browser's own popups ("Save password?", a print or file
            # dialog: windows a browser window owns) keep the tab underneath.
            if self._last_good.exe and (name in SHELL_OVERLAYS or (name in BROWSERS and self._api.owner(hwnd))):
                return replace(self._last_good, idle_seconds=idle)
            title = self._api.title(hwnd)
            host = self._hosts.host(hwnd, title) if self._hosts is not None and name in CHROMIUM_EXES else ""
            self._last_good = Sample(exe=exe, title=title, idle_seconds=idle, host=host)
            return self._last_good
        except Exception as exc:  # win32 can throw during logoff/UAC prompts
            log.debug("sample failed: %s", exc)
            return Sample(idle_seconds=idle)


class FakeSampler:
    """Replays a fixed sequence of samples (tests and non-Windows dev runs)."""

    def __init__(self, samples: Iterable[Sample] = ()) -> None:
        self._samples: Iterator[Sample] = iter(list(samples))
        self._last = Sample(exe="python.exe", title="fake window")

    def sample(self) -> Sample:
        self._last = next(self._samples, self._last)
        return self._last


def default_sampler(browser_domains: bool = True) -> Sampler:
    """``WindowsSampler`` on Windows, a static ``FakeSampler`` elsewhere."""
    if WIN32_AVAILABLE:  # pragma: no cover
        return WindowsSampler(browser_domains=browser_domains)
    log.warning("win32 not available: using FakeSampler (no real capture)")
    return FakeSampler()
