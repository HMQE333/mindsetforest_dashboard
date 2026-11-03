"""Save a screenshot of a screen region to the Archive with a hotkey.

Press the hotkey (``screenshot_hotkey`` in config.json, default Alt+Shift+A),
drag a rectangle on the dimmed screen (Esc cancels, a click without dragging
takes the whole monitor under the pointer) and the tracker uploads the image
to the public ``archive-images`` bucket under ``<user_id>/`` (the web app
uploads the same way) and saves an Archive note (``archive_blocks``) holding
``[image] <public url>`` and the window title as its source, tagged
``quick-capture`` and ``screenshot``.

Screenshots are an explicit action, so they work while tracking is paused.
The same hotkey rules as archive_capture apply (no Ctrl+Alt: AltGr letters).

Windows only for the overlay and the grab (tkinter on a DPI-aware thread,
Pillow's ImageGrab, the clipboard). The pure parts (the region, the path, the
note, the upload) import and are tested on Linux.
"""
from __future__ import annotations

import ctypes
import io
import logging
import secrets
import time
from typing import Any

import requests

from .archive_capture import TAG, ArchiveClient
from .auth import AuthRequired
from .sync import SyncError, SyncRejected

log = logging.getLogger(__name__)

BUCKET = "archive-images"
SCREENSHOT_TAG = "screenshot"
TITLE_PREFIX = "Zrzut ekranu – "
TITLE_CHARS = 60
DRAG_PIXELS = 4  # a smaller move is a click: the whole monitor
WEBP_QUALITY = 85

Rect = tuple[int, int, int, int]  # left, top, right, bottom in screen pixels


def selection_bbox(start: tuple[int, int], end: tuple[int, int], monitor: Rect) -> Rect | None:
    """The region to grab for a drag from ``start`` to ``end``; ``monitor`` for a plain click.

    None for a degenerate region (it cannot happen for a monitor, but a caller
    may hand over an empty one).
    """
    (x0, y0), (x1, y1) = start, end
    if abs(x1 - x0) < DRAG_PIXELS and abs(y1 - y0) < DRAG_PIXELS:
        left, top, right, bottom = monitor
    else:
        left, top, right, bottom = min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)
    if right - left < 1 or bottom - top < 1:
        return None
    return left, top, right, bottom


def storage_path(user_id: str, ext: str = "png", now: float | None = None, token: str | None = None) -> str:
    """``<user_id>/<timestamp ms>-<random>.<ext>``: the user's own folder, which the bucket's RLS allows."""
    stamp = int((time.time() if now is None else now) * 1000)
    return f"{user_id}/{stamp}-{token or secrets.token_hex(4)}.{ext}"


def public_url(supabase_url: str, path: str) -> str:
    return f"{supabase_url.rstrip('/')}/storage/v1/object/public/{BUCKET}/{path}"


def encode_image(image: Any) -> tuple[bytes, str, str]:
    """PNG, or WebP (quality 85) when that is smaller: ``(data, extension, content type)``."""
    png = io.BytesIO()
    image.save(png, format="PNG", optimize=True)
    best = (png.getvalue(), "png", "image/png")
    try:
        webp = io.BytesIO()
        image.save(webp, format="WEBP", quality=WEBP_QUALITY)
        if len(webp.getvalue()) < len(best[0]):
            best = (webp.getvalue(), "webp", "image/webp")
    except Exception:  # a Pillow without WebP
        log.debug("WebP unavailable", exc_info=True)
    return best


def screenshot_title(source: str, at: float | None = None) -> str:
    """``Zrzut ekranu – <window title>``, or the time (HH:MM) when there is no title."""
    label = " ".join((source or "").split())[:TITLE_CHARS]
    if not label:
        label = time.strftime("%H:%M", time.localtime(time.time() if at is None else at))
    return f"{TITLE_PREFIX}{label}"


def build_screenshot_block(url: str, source: str, user_id: str, at: float | None = None) -> dict:
    """The ``archive_blocks`` row for an uploaded screenshot (the twin of ``build_block``)."""
    content = f"[image] {url}\n\nSource: {source}" if source else f"[image] {url}"
    return {"user_id": user_id, "title": screenshot_title(source, at), "content": content,
            "tags": [TAG, SCREENSHOT_TAG], "pillars": []}


def upload_image(archive: ArchiveClient, supabase_url: str, data: bytes, content_type: str, ext: str) -> str:
    """Upload to ``archive-images`` with the user's login; returns the public URL.

    Raises like ``ArchiveClient.save``: SyncError (network, 5xx), SyncRejected
    (4xx, e.g. the bucket refused the path), AuthRequired (token refused twice).
    """
    path = storage_path(archive.auth.user_id, ext)
    url = f"{supabase_url.rstrip('/')}/storage/v1/object/{BUCKET}/{path}"
    for attempt in (1, 2):
        headers = {**archive.auth.headers(), "Content-Type": content_type, "x-upsert": "false"}
        try:
            resp = archive.http.post(url, headers=headers, data=data, timeout=60)
        except requests.RequestException as exc:
            raise SyncError(f"network error: {exc}") from exc
        if resp.status_code in (200, 201):
            return public_url(supabase_url, path)
        # Storage answers an expired token with 400/403 "jwt expired" as well as 401.
        expired = resp.status_code == 401 or (resp.status_code in (400, 403) and "jwt" in (resp.text or "").lower())
        if expired and attempt == 1:
            archive.auth.refresh()
            continue
        if resp.status_code == 401:
            raise AuthRequired("token rejected twice")
        if resp.status_code != 429 and 400 <= resp.status_code < 500:
            raise SyncRejected(resp.status_code, resp.text)
        raise SyncError(f"HTTP {resp.status_code}: {resp.text[:300]}")
    raise AssertionError("unreachable")  # pragma: no cover - the loop always returns or raises


# -- Windows -----------------------------------------------------------------

SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN = 76, 77, 78, 79
DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
OVERLAY_ALPHA = 0.35
ACCENT = "#8b5cf6"  # tray.ACCENT, the web app's purple


def _dpi_aware_thread() -> None:  # pragma: no cover - Windows only
    """Physical pixels on this thread, so the overlay, the metrics and ImageGrab agree.

    The tracker never sets process DPI awareness (only the setup window does), so
    this thread opts in on its own; the tray and toasts are left as they are.
    """
    user32 = ctypes.windll.user32
    try:
        user32.SetThreadDpiAwarenessContext.restype = ctypes.c_void_p
        if user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)):
            return
    except Exception:  # Windows before 10 1607
        pass
    try:
        user32.SetProcessDPIAware()
    except Exception:
        log.debug("DPI awareness unavailable", exc_info=True)


def virtual_screen() -> Rect:  # pragma: no cover - Windows only
    """Every monitor together: (left, top, right, bottom); left/top are negative left of/above the main one."""
    m = ctypes.windll.user32.GetSystemMetrics
    x, y = m(SM_XVIRTUALSCREEN), m(SM_YVIRTUALSCREEN)
    return x, y, x + m(SM_CXVIRTUALSCREEN), y + m(SM_CYVIRTUALSCREEN)


def monitor_at(x: int, y: int) -> Rect:  # pragma: no cover - Windows only
    from ctypes import wintypes

    class MONITORINFO(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", wintypes.RECT),
                    ("rcWork", wintypes.RECT), ("dwFlags", wintypes.DWORD)]

    user32 = ctypes.windll.user32
    user32.MonitorFromPoint.restype = ctypes.c_void_p
    handle = user32.MonitorFromPoint(wintypes.POINT(x, y), 2)  # MONITOR_DEFAULTTONEAREST
    info = MONITORINFO()
    info.cbSize = ctypes.sizeof(MONITORINFO)
    if not handle or not user32.GetMonitorInfoW(ctypes.c_void_p(handle), ctypes.byref(info)):
        return virtual_screen()
    r = info.rcMonitor
    return r.left, r.top, r.right, r.bottom


def select_region() -> Rect | None:  # pragma: no cover - Windows only (needs a display)
    """Dim every screen and let the user drag a rectangle; None when cancelled (Esc).

    Runs its own Tk root on the calling thread (the hotkey's), destroyed before
    returning, so the grab that follows never sees the overlay.
    """
    import tkinter as tk

    _dpi_aware_thread()
    left, top, right, bottom = virtual_screen()
    root = tk.Tk()
    root.overrideredirect(True)
    root.geometry(f"{right - left}x{bottom - top}+{left}+{top}")
    root.attributes("-topmost", True)
    root.attributes("-alpha", OVERLAY_ALPHA)
    root.configure(background="black", cursor="crosshair")
    canvas = tk.Canvas(root, background="black", highlightthickness=0, cursor="crosshair")
    canvas.pack(fill="both", expand=True)
    state: dict[str, Any] = {"start": None, "rect": None, "result": None}

    def press(event: Any) -> None:
        state["start"] = (event.x_root, event.y_root)
        state["rect"] = canvas.create_rectangle(event.x, event.y, event.x, event.y, outline=ACCENT, width=3)

    def drag(event: Any) -> None:
        if state["rect"] is not None and state["start"] is not None:
            sx, sy = state["start"]
            canvas.coords(state["rect"], sx - left, sy - top, event.x_root - left, event.y_root - top)

    def release(event: Any) -> None:
        if state["start"] is None:
            return
        end = (event.x_root, event.y_root)
        state["result"] = selection_bbox(state["start"], end, monitor_at(*end))
        root.quit()

    def cancel(_event: Any = None) -> None:
        state["result"] = None
        root.quit()

    canvas.bind("<ButtonPress-1>", press)
    canvas.bind("<B1-Motion>", drag)
    canvas.bind("<ButtonRelease-1>", release)
    root.bind("<Escape>", cancel)
    root.bind("<ButtonPress-3>", cancel)
    root.after(1, lambda: (root.lift(), root.focus_force()))
    try:
        root.mainloop()
    finally:
        root.destroy()
    return state["result"]


def grab(bbox: Rect) -> Any:  # pragma: no cover - Windows only
    from PIL import ImageGrab

    time.sleep(0.15)  # let the overlay disappear (and the compositor redraw) first
    return ImageGrab.grab(bbox=bbox, all_screens=True)


def copy_image(image: Any) -> bool:  # pragma: no cover - Windows only
    """Put the image on the clipboard (CF_DIB), so a failed save loses nothing."""
    try:
        import win32clipboard

        out = io.BytesIO()
        image.convert("RGB").save(out, format="BMP")
        dib = out.getvalue()[14:]  # without the BITMAPFILEHEADER
        win32clipboard.OpenClipboard()
        try:
            win32clipboard.EmptyClipboard()
            win32clipboard.SetClipboardData(win32clipboard.CF_DIB, dib)
        finally:
            win32clipboard.CloseClipboard()
        return True
    except Exception:
        log.debug("Could not copy the screenshot", exc_info=True)
        return False
