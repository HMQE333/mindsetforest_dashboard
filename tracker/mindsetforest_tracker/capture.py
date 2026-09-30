"""Foreground sampling on Windows.

Every tick the sampler reports the foreground process exe, the CURRENT window
title (re-read every tick, so a long-running editor session follows the file
you are in), seconds since the last keyboard/mouse input (``GetLastInputInfo``)
and whether the screen is locked (no foreground window, or the foreground
process is ``LockApp.exe`` / ``LogonUI.exe``).

Sleep is not detected here: ``sessions.SessionTracker`` sees the wall-clock
jump between two consecutive samples and closes the open session at the last
good tick.

While the tracker's own window is in front (the tray menu or the sign-in
dialog) the sampler keeps reporting the previous app with ``own_window=True``
so the real session is not split and the tray menu is not rebuilt underneath
the user.

All win32 imports are guarded so the module (and the tests) import on Linux;
``FakeSampler`` replaces ``WindowsSampler`` there.
"""
from __future__ import annotations

import ctypes
import logging
import os
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, replace
from typing import Protocol

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


@dataclass(frozen=True)
class Sample:
    """One observation of the desktop at a tick."""

    exe: str = ""
    title: str = ""
    idle_seconds: float = 0.0
    locked: bool = False
    own_window: bool = False


class Sampler(Protocol):
    def sample(self) -> Sample: ...


if WIN32_AVAILABLE:  # pragma: no cover - Windows only

    class _LASTINPUTINFO(ctypes.Structure):
        _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]

    _user32 = ctypes.windll.user32
    _kernel32 = ctypes.windll.kernel32

    def idle_seconds() -> float:
        """Seconds since the last keyboard/mouse input (0 when unavailable)."""
        info = _LASTINPUTINFO()
        info.cbSize = ctypes.sizeof(info)
        if not _user32.GetLastInputInfo(ctypes.byref(info)):
            return 0.0
        elapsed_ms = (_kernel32.GetTickCount() - info.dwTime) & 0xFFFFFFFF
        return elapsed_ms / 1000.0

    class WindowsSampler:
        """Reads the foreground window through the win32 API."""

        def __init__(self) -> None:
            self._names: dict[int, str] = {}
            self._samples_since_flush = 0
            self._own_pid = os.getpid()
            self._last_good = Sample()

        def _exe_name(self, pid: int) -> str:
            self._samples_since_flush += 1
            if self._samples_since_flush >= PID_CACHE_TTL_SAMPLES:
                self._names.clear()
                self._samples_since_flush = 0
            name = self._names.get(pid)
            if name is None:
                try:
                    name = psutil.Process(pid).name()
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    name = ""
                self._names[pid] = name
            return name

        def sample(self) -> Sample:
            idle = idle_seconds()
            try:
                hwnd = win32gui.GetForegroundWindow()
                if not hwnd:
                    return Sample(idle_seconds=idle, locked=True)
                _, pid = win32process.GetWindowThreadProcessId(hwnd)
                if pid == self._own_pid:
                    return replace(self._last_good, idle_seconds=idle, own_window=True)
                exe = self._exe_name(pid)
                if exe.lower() in LOCK_PROCESSES:
                    return Sample(exe=exe, idle_seconds=idle, locked=True)
                if exe.lower() in SHELL_OVERLAYS and self._last_good.exe:
                    return replace(self._last_good, idle_seconds=idle)
                title = win32gui.GetWindowText(hwnd) or ""
                self._last_good = Sample(exe=exe, title=title, idle_seconds=idle)
                return self._last_good
            except Exception as exc:  # win32 can throw during logoff/UAC prompts
                log.debug("sample failed: %s", exc)
                return Sample(idle_seconds=idle)

else:

    def idle_seconds() -> float:
        """Not available off Windows."""
        return 0.0


class FakeSampler:
    """Replays a fixed sequence of samples (tests and non-Windows dev runs)."""

    def __init__(self, samples: Iterable[Sample] = ()) -> None:
        self._samples: Iterator[Sample] = iter(list(samples))
        self._last = Sample(exe="python.exe", title="fake window")

    def sample(self) -> Sample:
        self._last = next(self._samples, self._last)
        return self._last


def default_sampler() -> Sampler:
    """``WindowsSampler`` on Windows, a static ``FakeSampler`` elsewhere."""
    if WIN32_AVAILABLE:  # pragma: no cover
        return WindowsSampler()
    log.warning("win32 not available: using FakeSampler (no real capture)")
    return FakeSampler()
