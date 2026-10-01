"""Save the text selected in any app to the Archive with a hotkey.

Select text anywhere (Chrome, a PDF, Word, a chat) and press the hotkey
(``capture_hotkey`` in config.json, default Alt+Shift+S). The tracker copies
the selection the way Ctrl+C does and saves it as an Archive note
(``archive_blocks``) under the signed-in account, tagged ``quick-capture``,
with the window title as its source. A balloon says what happened.

The copied text stays on the clipboard, so a failed save (offline) loses
nothing: paste it into the Archive inbox later.

Ctrl+Alt combinations are avoided: on Polish and other AltGr keyboards
Ctrl+Alt+S types "ś", and a global hotkey there would swallow the letter.

Windows only (RegisterHotKey, keybd_event, the clipboard). The pure parts
(hotkey parsing, the note, the upload) import and are tested on Linux.
"""
from __future__ import annotations

import ctypes
import logging
import re
import threading
import time
from collections.abc import Callable
from typing import Any

import requests

from .auth import AuthRequired, SupabaseAuth
from .sync import SyncError, SyncRejected

log = logging.getLogger(__name__)

TABLE = "archive_blocks"
TAG = "quick-capture"
TITLE_CHARS = 60
MAX_CHARS = 200_000

MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN, MOD_NOREPEAT = 0x1, 0x2, 0x4, 0x8, 0x4000
MODIFIERS = {"alt": MOD_ALT, "ctrl": MOD_CONTROL, "control": MOD_CONTROL, "shift": MOD_SHIFT, "win": MOD_WIN}

# Browser names at the end of a window title: "Page - Google Chrome" -> "Page".
BROWSER_SUFFIX = re.compile(
    r"\s+[-–—]\s+(?:Google Chrome|Microsoft​?\s?Edge|Mozilla Firefox|Brave|Opera|Vivaldi|Chromium)\s*$"
)


def parse_hotkey(spec: str) -> tuple[int, int]:
    """``"alt+shift+s"`` -> (RegisterHotKey modifiers, virtual-key code).

    Needs at least one modifier and exactly one key: a letter, a digit or F1-F24.
    """
    parts = [p.strip().lower() for p in spec.split("+") if p.strip()]
    mods = 0
    key: str | None = None
    for p in parts:
        if p in MODIFIERS:
            mods |= MODIFIERS[p]
        elif key is None:
            key = p
        else:
            raise ValueError(f"more than one key in {spec!r}")
    if key is None or mods == 0:
        raise ValueError(f"{spec!r} needs a modifier and a key, e.g. alt+shift+s")
    if len(key) == 1 and key.isascii() and key.isalnum():
        return mods, ord(key.upper())
    m = re.fullmatch(r"f([1-9]|1\d|2[0-4])", key)
    if m:
        return mods, 0x70 + int(m.group(1)) - 1
    raise ValueError(f"unknown key {key!r} in {spec!r}")


def clean_source(title: str) -> str:
    """The window title without the browser's name."""
    return BROWSER_SUFFIX.sub("", (title or "").strip()).strip()


def build_block(text: str, source: str, user_id: str) -> dict | None:
    """The ``archive_blocks`` row for a captured selection, or None when it is empty."""
    body = (text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not body:
        return None
    body = body[:MAX_CHARS]
    title = re.sub(r"\s+", " ", body[:TITLE_CHARS]).strip()
    content = f"{body}\n\nSource: {source}" if source else body
    return {"user_id": user_id, "title": title, "content": content, "tags": [TAG], "pillars": []}


class ArchiveClient:
    """Writes captured notes through PostgREST with the tracker's own login."""

    def __init__(self, supabase_url: str, anon_key: str, auth: SupabaseAuth,
                 http: Any | None = None, timeout: float = 20.0) -> None:
        base = supabase_url.rstrip("/")
        self.url = f"{base}/rest/v1/{TABLE}?select=id,title"
        self.embed_url = f"{base}/functions/v1/ai-embed-block"
        self.anon_key = anon_key
        self.auth = auth
        self.http = http or requests.Session()
        self.timeout = timeout

    def save(self, text: str, source: str = "") -> dict | None:
        """Insert one note; returns ``{"id", "title"}``, or None for empty text."""
        row = build_block(text, source, self.auth.user_id)
        if row is None:
            return None
        for attempt in (1, 2):
            headers = {**self.auth.headers(), "Content-Type": "application/json", "Prefer": "return=representation"}
            try:
                resp = self.http.post(self.url, headers=headers, json=row, timeout=self.timeout)
            except requests.RequestException as exc:
                raise SyncError(f"network error: {exc}") from exc
            if resp.status_code in (200, 201):
                body = resp.json()
                return body[0] if isinstance(body, list) and body else {"id": None, "title": row["title"]}
            if resp.status_code == 401 and attempt == 1:
                self.auth.refresh()
                continue
            if resp.status_code == 401:
                raise AuthRequired("token rejected twice")
            if resp.status_code != 429 and 400 <= resp.status_code < 500:
                raise SyncRejected(resp.status_code, resp.text)
            raise SyncError(f"HTTP {resp.status_code}: {resp.text[:300]}")
        return None  # pragma: no cover - the loop always returns or raises

    def embed(self, block_id: str) -> None:
        """Best effort: index the note for semantic search, as the web app does."""
        try:
            self.http.post(self.embed_url, headers={**self.auth.headers(), "Content-Type": "application/json"},
                           json={"action": "embed", "blockId": block_id}, timeout=60)
        except Exception as exc:
            log.info("Embedding skipped for %s: %s", block_id, exc)


# -- Windows -----------------------------------------------------------------

VK_SHIFT, VK_CONTROL, VK_MENU, VK_LWIN, VK_RWIN, VK_C = 0x10, 0x11, 0x12, 0x5B, 0x5C, 0x43
KEYEVENTF_KEYUP = 0x2
WM_HOTKEY, WM_QUIT = 0x0312, 0x0012
CF_UNICODETEXT = 13


def foreground_title() -> str:  # pragma: no cover - Windows only
    try:
        import win32gui

        return win32gui.GetWindowText(win32gui.GetForegroundWindow()) or ""
    except Exception:
        return ""


def read_selection(timeout: float = 1.0) -> str | None:  # pragma: no cover - Windows only
    """Copy the selection in the window in front (Ctrl+C) and return it.

    Waits for the hotkey's own modifiers to be let go first, otherwise the
    app would see Alt+Shift+Ctrl+C. Returns None when nothing was copied.
    """
    import win32clipboard

    user32 = ctypes.windll.user32
    deadline = time.time() + 1.0
    while time.time() < deadline and any(user32.GetAsyncKeyState(vk) & 0x8000 for vk in (VK_SHIFT, VK_CONTROL, VK_MENU, VK_LWIN, VK_RWIN)):
        time.sleep(0.02)
    before = user32.GetClipboardSequenceNumber()
    user32.keybd_event(VK_CONTROL, 0, 0, 0)
    user32.keybd_event(VK_C, 0, 0, 0)
    user32.keybd_event(VK_C, 0, KEYEVENTF_KEYUP, 0)
    user32.keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0)
    end = time.time() + timeout
    while time.time() < end and user32.GetClipboardSequenceNumber() == before:
        time.sleep(0.03)
    if user32.GetClipboardSequenceNumber() == before:
        return None
    for _ in range(10):  # another app may hold the clipboard for a moment
        try:
            win32clipboard.OpenClipboard()
            try:
                if not win32clipboard.IsClipboardFormatAvailable(CF_UNICODETEXT):
                    return None
                return win32clipboard.GetClipboardData(CF_UNICODETEXT)
            finally:
                win32clipboard.CloseClipboard()
        except Exception:
            time.sleep(0.05)
    return None


class HotkeyListener(threading.Thread):  # pragma: no cover - Windows only
    """Registers one global hotkey and calls ``on_press`` (on its own thread) when it fires."""

    def __init__(self, spec: str, on_press: Callable[[], None], on_fail: Callable[[str], None] | None = None) -> None:
        super().__init__(name="mf-hotkey", daemon=True)
        self.spec = spec
        self.on_press = on_press
        self.on_fail = on_fail
        self._thread_id = 0

    def run(self) -> None:
        from ctypes import wintypes

        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32
        self._thread_id = kernel32.GetCurrentThreadId()
        try:
            mods, vk = parse_hotkey(self.spec)
        except ValueError as exc:
            log.error("capture_hotkey: %s", exc)
            if self.on_fail:
                self.on_fail(f"Hotkey {self.spec!r} is not valid")
            return
        if not user32.RegisterHotKey(None, 1, mods | MOD_NOREPEAT, vk):
            log.error("Could not register %s (another app uses it?)", self.spec)
            if self.on_fail:
                self.on_fail(f"{self.spec} is taken by another app; set capture_hotkey in config.json")
            return
        log.info("Save-to-Archive hotkey: %s", self.spec)
        msg = wintypes.MSG()
        try:
            while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
                if msg.message == WM_HOTKEY:
                    threading.Thread(target=self._fire, name="mf-capture-text", daemon=True).start()
        finally:
            user32.UnregisterHotKey(None, 1)

    def _fire(self) -> None:
        try:
            self.on_press()
        except Exception:
            log.exception("capture failed")

    def stop(self) -> None:
        if self._thread_id:
            ctypes.windll.user32.PostThreadMessageW(self._thread_id, WM_QUIT, 0, 0)
