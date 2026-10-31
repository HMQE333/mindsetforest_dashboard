"""Windows toasts with a button, and a short sound, for the save-to-Archive hotkey.

A pystray balloon has no button and is easy to miss, so a save shows a toast
(winotify) with "Otwórz w Archive". winotify hands the toast to PowerShell,
which survives PyInstaller with no extra data files. The sound plays even when
Windows mutes notifications (Focus assist), so a save is never silent.

Both are optional: off Windows, or without winotify, ``toast`` returns False
and the caller falls back to the balloon.
"""
from __future__ import annotations

import logging
import tempfile
from pathlib import Path

log = logging.getLogger(__name__)

try:
    from winotify import Notification, audio

    TOASTS_AVAILABLE = True
except ImportError:  # Linux, or a build without winotify
    Notification = audio = None
    TOASTS_AVAILABLE = False

APP_ID = "MindsetForest Tracker"
OPEN_ARCHIVE = "Otwórz w Archive"
_icon_path: str | None = None


def _icon() -> str:
    """The tray tree as a PNG once per run: a toast takes a file path, not an image."""
    global _icon_path
    if _icon_path is None:
        try:
            from .tray import make_icon_image

            path = Path(tempfile.gettempdir()) / "mindsetforest-toast.png"
            make_icon_image(128).save(path)
            _icon_path = str(path)
        except Exception:
            log.debug("toast icon unavailable", exc_info=True)
            _icon_path = ""
    return _icon_path


def toast(title: str, message: str, open_url: str | None = None) -> bool:
    """Show a toast, with an "Otwórz w Archive" button when ``open_url`` is given; False if it could not."""
    if not TOASTS_AVAILABLE:
        return False
    try:
        note = Notification(app_id=APP_ID, title=title, msg=message, icon=_icon(), duration="short")
        note.set_audio(audio.Silent, loop=False)  # beep() already played, toast or not
        if open_url:
            note.add_actions(label=OPEN_ARCHIVE, launch=open_url)
        note.show()
        return True
    except Exception:
        log.debug("toast failed", exc_info=True)
        return False


def beep(ok: bool = True) -> None:
    """The system's own short sound (asynchronous); a warning tone for a failed save."""
    try:
        import winsound

        winsound.MessageBeep(winsound.MB_OK if ok else winsound.MB_ICONEXCLAMATION)
    except Exception:  # not Windows, or no sound device
        pass
