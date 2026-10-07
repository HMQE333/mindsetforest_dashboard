"""System tray icon (pystray) and the one tiny tkinter dialog for signing in.

The tray is the tracker's everyday UI: a status line, Pause/Resume, "Don't
track <app>", "Ustawienia..." (the setup window, as its own process), "Open
dashboard", "Sign in..." (only when no session is saved), a line naming the
save-to-Archive hotkey and Quit. Everything it does goes through
``TrayController`` so the tray has no state of its own. pystray/tkinter are
optional imports so tests run on Linux.
"""
from __future__ import annotations

import logging
import webbrowser
from collections.abc import Callable
from pathlib import Path
from typing import Any, Protocol

from PIL import Image, ImageDraw

log = logging.getLogger(__name__)

try:
    import pystray

    TRAY_AVAILABLE = True
except ImportError:  # pragma: no cover
    pystray = None
    TRAY_AVAILABLE = False


class TrayController(Protocol):
    dashboard_url: str

    def status_line(self) -> str: ...
    def sync_line(self) -> str: ...
    def is_paused(self) -> bool: ...
    def toggle_pause(self) -> None: ...
    def current_app_name(self) -> str | None: ...
    def ignore_current_app(self) -> None: ...
    def needs_login(self) -> bool: ...
    def sign_in(self, email: str, password: str) -> str | None: ...
    def capture_hint(self) -> str | None: ...
    def open_settings(self) -> None: ...
    def quit(self) -> None: ...


def make_icon_image(size: int = 64, paused: bool = False) -> Image.Image:
    """A small green tree on a dark disc (grey when paused)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size / 64
    leaf = (120, 120, 120, 255) if paused else (76, 175, 80, 255)
    draw.ellipse((2 * s, 2 * s, 62 * s, 62 * s), fill=(30, 41, 34, 255))
    draw.polygon([(32 * s, 10 * s), (14 * s, 36 * s), (50 * s, 36 * s)], fill=leaf)
    draw.polygon([(32 * s, 22 * s), (10 * s, 48 * s), (54 * s, 48 * s)], fill=leaf)
    draw.rectangle((28 * s, 46 * s, 36 * s, 56 * s), fill=(121, 85, 72, 255))
    return img


def save_ico(path: str | Path) -> None:
    """Write the tray image as a multi-size .ico (used by build.bat)."""
    make_icon_image(256).save(str(path), format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])


def format_duration(seconds: int) -> str:
    """``5s``, ``12m 30s``, ``2h 05m``."""
    seconds = max(0, int(seconds))
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m {seconds % 60:02d}s"
    return f"{seconds // 3600}h {(seconds % 3600) // 60:02d}m"


def build_icon(controller: TrayController) -> Any:
    """Create the pystray icon. Call ``icon.run()`` on the main thread."""
    if not TRAY_AVAILABLE:  # pragma: no cover
        raise RuntimeError("pystray is not installed")

    def ignore_label(_item: Any) -> str:
        app = controller.current_app_name()
        return f"Don't track {app}" if app else "Don't track (nothing in front)"

    def on_sign_in(icon: Any, _item: Any) -> None:
        show_login_dialog(controller.sign_in)

    def on_quit(icon: Any, _item: Any) -> None:
        try:
            controller.quit()
        finally:
            icon.stop()

    def on_pause(icon: Any, _item: Any) -> None:
        controller.toggle_pause()
        icon.icon = make_icon_image(paused=controller.is_paused())

    menu = pystray.Menu(
        pystray.MenuItem(lambda _i: controller.status_line(), None, enabled=False),
        pystray.MenuItem(lambda _i: controller.sync_line(), None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem(lambda _i: "Resume tracking" if controller.is_paused() else "Pause tracking", on_pause),
        pystray.MenuItem(ignore_label, lambda _i, _it: controller.ignore_current_app(),
                         enabled=lambda _i: controller.current_app_name() is not None),
        pystray.MenuItem("Ustawienia...", lambda _i, _it: controller.open_settings()),
        pystray.MenuItem("Open dashboard", lambda _i, _it: webbrowser.open(controller.dashboard_url),
                         enabled=lambda _i: bool(controller.dashboard_url)),
        pystray.MenuItem("Sign in...", on_sign_in, visible=lambda _i: controller.needs_login()),
        pystray.MenuItem(lambda _i: controller.capture_hint() or "", None, enabled=False,
                         visible=lambda _i: bool(controller.capture_hint())),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit", on_quit),
    )
    return pystray.Icon("MindsetForest", make_icon_image(), "MindsetForest Tracker", menu)


def notify(icon: Any, message: str, title: str = "MindsetForest Tracker") -> bool:
    """Balloon notification; False when it could not be handed to the icon (silently, as before).

    True does not prove the user saw it: pystray reports no failure of its own.
    """
    try:
        if icon is not None and getattr(icon, "HAS_NOTIFICATION", False):
            icon.notify(message, title)
            return True
    except Exception:  # pragma: no cover
        log.debug("notify failed", exc_info=True)
    return False


def show_login_dialog(sign_in: Callable[[str, str], str | None]) -> None:  # pragma: no cover - GUI
    """Modal email/password dialog. ``sign_in`` returns an error message or None."""
    import tkinter as tk
    from tkinter import ttk

    root = tk.Tk()
    root.title("MindsetForest - Sign in")
    root.resizable(False, False)
    root.attributes("-topmost", True)
    frame = ttk.Frame(root, padding=16)
    frame.grid()
    ttk.Label(frame, text="Email").grid(row=0, column=0, sticky="w", pady=(0, 4))
    email_var = tk.StringVar()
    ttk.Entry(frame, textvariable=email_var, width=36).grid(row=0, column=1, pady=(0, 4))
    ttk.Label(frame, text="Password").grid(row=1, column=0, sticky="w")
    password_var = tk.StringVar()
    ttk.Entry(frame, textvariable=password_var, show="*", width=36).grid(row=1, column=1)
    error_var = tk.StringVar()
    ttk.Label(frame, textvariable=error_var, foreground="#c62828", wraplength=300).grid(
        row=2, column=0, columnspan=2, sticky="w", pady=(8, 0))

    def submit(*_args: Any) -> None:
        error = sign_in(email_var.get().strip(), password_var.get())
        if error:
            error_var.set(error)
        else:
            root.destroy()

    ttk.Button(frame, text="Sign in", command=submit).grid(row=3, column=1, sticky="e", pady=(12, 0))
    root.bind("<Return>", submit)
    root.eval("tk::PlaceWindow . center")
    root.mainloop()
