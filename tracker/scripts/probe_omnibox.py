"""Opens Edge and Chrome on a test page and checks the tracker reads the domain from the address bar.

CI runs it on windows-latest (.github/workflows/tracker-windows.yml). Run it by hand to see what
the reader finds on a PC, e.g. after a browser update:

    python scripts\\probe_omnibox.py
    python scripts\\probe_omnibox.py --browser brave --url https://example.org

Every browser starts with a fresh throw-away profile (--user-data-dir), so none of your tabs,
logins or settings are opened or changed, and it is closed again at the end. For each browser
window it prints the address bar's ClassName, Name and ControlType, the host read and how long
the read took (the first one includes the search for the address bar). --raw also prints the
text the address bar shows. Exit code 0 when every browser found gave the expected host, 1 when
one did not, 2 when a browser named with --require (or every browser) is not installed.
"""
from __future__ import annotations

import argparse
import ctypes
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mindsetforest_tracker.browser_url import OmniboxReader, host_from_omnibox  # noqa: E402

CANDIDATES = {
    "edge": (r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
             r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
    "chrome": (r"%ProgramFiles%\Google\Chrome\Application\chrome.exe",
               r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe",
               r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
    "brave": (r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe",
              r"%LocalAppData%\BraveSoftware\Brave-Browser\Application\brave.exe"),
}
BROWSER_WINDOW_CLASS = "Chrome_WidgetWin_1"
RESEND_SECONDS = 15  # open the page again (a new active tab) if a first-run page took the window


def find_exe(name: str) -> Path | None:
    for pattern in CANDIDATES[name]:
        path = Path(os.path.expandvars(pattern))
        if "%" not in str(path) and path.is_file():
            return path
    return None


def process_tree(pid: int) -> set[int]:
    import psutil

    try:
        proc = psutil.Process(pid)
        return {pid} | {p.pid for p in proc.children(recursive=True)}
    except psutil.Error:
        return {pid}


def kill_tree(proc: subprocess.Popen) -> None:
    import psutil

    try:
        family = psutil.Process(proc.pid).children(recursive=True) + [psutil.Process(proc.pid)]
    except psutil.Error:
        family = []
    for p in family:
        try:
            p.kill()
        except psutil.Error:
            pass
    psutil.wait_procs(family, timeout=10)


def browser_windows(pids: set[int]) -> list[tuple[int, str]]:
    """Visible top-level browser windows of ``pids``: (hwnd, title)."""
    user32 = ctypes.WinDLL("user32")
    enum_proc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    user32.EnumWindows.argtypes = [enum_proc, ctypes.c_void_p]
    user32.GetWindowThreadProcessId.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
    user32.IsWindowVisible.argtypes = [ctypes.c_void_p]
    user32.GetClassNameW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_int]
    user32.GetWindowTextW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_int]
    found: list[tuple[int, str]] = []

    def visit(hwnd, _param):
        pid = ctypes.c_ulong()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value in pids and user32.IsWindowVisible(hwnd):
            cls = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd, cls, 256)
            if cls.value == BROWSER_WINDOW_CLASS:
                title = ctypes.create_unicode_buffer(512)
                user32.GetWindowTextW(hwnd, title, 512)
                found.append((int(hwnd), title.value))
        return True

    user32.EnumWindows(enum_proc(visit), None)
    return found


def probe(name: str, exe: Path, url: str, expect: str, timeout: float, raw: bool) -> bool:
    print(f"== {name}: {exe}", flush=True)
    profile = Path(tempfile.mkdtemp(prefix=f"mf-probe-{name}-"))
    launch = [str(exe), f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check",
              "--disable-sync"]
    proc = subprocess.Popen([*launch, "--new-window", url])
    reader = OmniboxReader(backoff_seconds=0)  # keep searching: windows appear while the browser starts
    started = time.monotonic()
    resent = started
    printed: dict[int, tuple[str, str | None, str]] = {}
    try:
        while time.monotonic() - started < timeout:
            for hwnd, title in browser_windows(process_tree(proc.pid)):
                t0 = time.perf_counter()
                host = reader.host(hwnd)
                ms = (time.perf_counter() - t0) * 1000
                info = reader.describe(hwnd, value=raw)
                if printed.get(hwnd) != (title, host, repr(info)):  # print what changed, not every poll
                    printed[hwnd] = (title, host, repr(info))
                    print(f"   window {hwnd:#x} {title!r}: host={host!r} in {ms:.0f} ms, address bar {info}",
                          flush=True)
                if host == expect:
                    print(f"OK {name}: the address bar gave {expect!r} after {time.monotonic() - started:.1f} s",
                          flush=True)
                    return True
            if time.monotonic() - resent > RESEND_SECONDS:
                resent = time.monotonic()
                print(f"   opening {url} again", flush=True)
                subprocess.Popen([*launch, url])  # handed to the running browser: a new, active tab
            time.sleep(0.5)
        print(f"FAIL {name}: no window gave {expect!r} within {timeout:.0f} s "
              f"(reads {reader.reads}, failures {reader.failures}, UIA {'off' if reader.disabled else 'on'})",
              flush=True)
        return False
    finally:
        kill_tree(proc)
        shutil.rmtree(profile, ignore_errors=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--browser", action="append", choices=sorted(CANDIDATES),
                        help="browser to try (repeatable; default: edge and chrome)")
    parser.add_argument("--require", action="append", choices=sorted(CANDIDATES), default=[],
                        help="fail when this browser is not installed (repeatable)")
    parser.add_argument("--url", default="https://example.com")
    parser.add_argument("--expect", help="host the reader must give (default: the URL's host)")
    parser.add_argument("--timeout", type=float, default=45.0, help="seconds per browser")
    parser.add_argument("--raw", action="store_true", help="also print the address bar's text")
    args = parser.parse_args(argv)
    if sys.platform != "win32":
        print("probe_omnibox.py runs on Windows only", file=sys.stderr)
        return 2
    expect = args.expect or host_from_omnibox(args.url)
    names = list(dict.fromkeys(args.browser or ["edge", "chrome"]))
    names += [n for n in args.require if n not in names]
    results: dict[str, bool] = {}
    missing: list[str] = []
    for name in names:
        exe = find_exe(name)
        if exe is None:
            print(f"-- {name}: not installed, skipped", flush=True)
            missing.append(name)
            continue
        results[name] = probe(name, exe, args.url, expect, args.timeout, args.raw)
    if any(name in missing for name in args.require) or not results:
        print(f"Missing: {', '.join(missing) or 'every browser'}", flush=True)
        return 2
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
