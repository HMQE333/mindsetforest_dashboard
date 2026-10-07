"""The setup and settings window: one Polish tkinter/ttk form for non-technical users.

``MindsetForestSetup.exe`` opens it to install the tracker; the tray's "Ustawienia..."
opens the same window later to change folders, the hotkey or the account. Saving
always goes through ``winsetup.install`` (it stops the tracker, rewrites the config and
starts it again), so installing and changing settings share one code path. Both end on
the "Gotowe" page, whose main job is the one step the installer cannot do: setting up
the Claude routine that turns transcripts into knowledge notes.

The window never refreshes or uses the saved session: a running tracker owns it, and
Supabase revokes a whole session when an old refresh token is reused. It only reads
``session.bin`` for the email, or does a fresh password sign-in.

Network and install work run in worker threads that report through a queue polled with
``after()``, so the window never freezes. tkinter is imported on first use, so the pure
helpers below import (and are tested) on Linux without tkinter or a display.
"""
from __future__ import annotations

from contextlib import suppress

import logging
import os
import queue
import re
import socket
import sys
import threading
import webbrowser
from collections.abc import Callable, Iterable, Mapping
from pathlib import Path
from typing import Any
from urllib.parse import quote

from . import winsetup
from .archive_capture import parse_hotkey
from .auth import AuthError, AuthUnavailable, SupabaseAuth
from .config import Config
from .recordings import MIRROR_FOLDERS

log = logging.getLogger(__name__)

CLAUDE_DOWNLOAD_URL = "https://claude.ai/download"
OBSIDIAN_DOWNLOAD_URL = "https://obsidian.md/download"
DEFAULT_HOTKEY = "alt+shift+s"
POLL_MS = 100

INSTALL_TAGLINE = "Instalacja trackera: czas przed komputerem, zapis do Archive, nagrania do Obsidiana."
SETTINGS_TAGLINE = "Ustawienia trackera"
ROUTINE_TITLE = "Ostatni krok: rutyna Claude (przerabia nagrania na notatki)"
ROUTINE_INTRO = ("Tracker tylko zamienia nagrania na tekst. Notatki wiedzy robi z nich Claude, w zadaniu "
                 "cyklicznym (rutynie), które ustawiasz raz w Claude Desktop:")
ROUTINE_NOTE = ("Bez rutyny nagrania będą się transkrybować, ale notatki wiedzy nie powstaną; "
                "tracker przypomni o tym powiadomieniem.")
OPEN_FOLDER_AS_VAULT = "W Obsidianie wybierz: Open folder as vault, potem ten folder:"
COPIED = "Skopiowano"

# -- hotkeys -------------------------------------------------------------------------

SHIFT_MASK = 0x1
CONTROL_MASK = 0x4
ALT_MASK_WINDOWS = 0x20000  # Tk on Windows; there Mod1 (0x8) only means Num Lock is on
ALT_MASK_X11 = 0x8          # Mod1
SUPER_KEYSYMS = frozenset({"Super_L", "Super_R", "Win_L", "Win_R"})  # X11 / Tk on Windows
_MODIFIER_OF_KEYSYM = {
    "Control_L": "ctrl", "Control_R": "ctrl", "Alt_L": "alt", "Alt_R": "alt",
    "Shift_L": "shift", "Shift_R": "shift", **{k: "win" for k in SUPER_KEYSYMS},
}
_OTHER_MODIFIER_KEYSYMS = frozenset({
    "Meta_L", "Meta_R", "Hyper_L", "Hyper_R", "ISO_Level3_Shift", "Mode_switch",
    "Caps_Lock", "Num_Lock", "Scroll_Lock",
})
_MOD_ORDER = ("ctrl", "alt", "shift", "win")  # the dashboard writes ctrl, alt, shift in this order too
_MOD_LABELS = {"ctrl": "Ctrl", "control": "Ctrl", "alt": "Alt", "shift": "Shift", "win": "Win"}
_FKEY = re.compile(r"F([1-9]|1\d|2[0-4])")
_EVERYWHERE = {f"ctrl+{k}" for k in "acvxzysfpo"}  # copy, paste, save...: as in the dashboard


def held_modifiers(state: int, *, win: bool = False, platform: str = sys.platform) -> list[str]:
    """The modifiers a tk event's ``state`` says are down, in spec order.

    Tk has no state bit for the Windows key, so the caller passes ``win`` (see ``SuperKeys``).
    """
    alt_mask = ALT_MASK_WINDOWS if platform == "win32" else ALT_MASK_X11
    held = {"ctrl": state & CONTROL_MASK, "alt": state & alt_mask, "shift": state & SHIFT_MASK, "win": win}
    return [m for m in _MOD_ORDER if held[m]]


def _key_name(keysym: str, keycode: int | None, platform: str) -> str | None:
    if platform == "win32" and keycode is not None:
        # The virtual-key code names the physical key, which is what RegisterHotKey wants:
        # Shift+1 arrives as keysym "exclam" and AltGr letters as "sacute", numpad digits differ.
        if 0x30 <= keycode <= 0x39 or 0x41 <= keycode <= 0x5A:
            return chr(keycode).lower()
        if 0x70 <= keycode <= 0x87:
            return f"f{keycode - 0x6F}"
        return None
    if len(keysym) == 1 and keysym.isascii() and keysym.isalnum():
        return keysym.lower()
    m = _FKEY.fullmatch(keysym)
    return f"f{m.group(1)}" if m else None


def hotkey_from_event(keysym: str, state: int, *, win: bool = False, keycode: int | None = None,
                      platform: str = sys.platform) -> str | None:
    """A tk KeyPress as a hotkey spec ("alt+shift+s").

    None for a modifier pressed on its own, a key with no modifier, or a key the tracker
    cannot register (it takes a-z, 0-9 and F1-F24 only).
    """
    if keysym in _MODIFIER_OF_KEYSYM or keysym in _OTHER_MODIFIER_KEYSYMS:
        return None
    key = _key_name(keysym, keycode, platform)
    mods = held_modifiers(state, win=win, platform=platform)
    if key is None or not mods:
        return None
    return "+".join([*mods, key])


def pressed_label(keysym: str, state: int, *, win: bool = False, release: bool = False,
                  platform: str = sys.platform) -> str:
    """What the capture dialog shows while only modifiers are held: "Ctrl + Alt + ..."."""
    mods = set(held_modifiers(state, win=win, platform=platform))
    own = _MODIFIER_OF_KEYSYM.get(keysym)
    if own:  # a modifier's own press is not in its state yet, and its release still is
        (mods.discard if release else mods.add)(own)
    names = [_MOD_LABELS[m] for m in _MOD_ORDER if m in mods]
    return " + ".join([*names, "..."]) if names else "..."


class SuperKeys:
    """Tracks the Windows key, which Tk reports as a key press but never in ``state``."""

    def __init__(self) -> None:
        self._down: set[str] = set()

    def press(self, keysym: str) -> None:
        if keysym in SUPER_KEYSYMS:
            self._down.add(keysym)

    def release(self, keysym: str) -> None:
        self._down.discard(keysym)

    def reset(self) -> None:
        """Forget everything: a release is lost when Windows opens the Start menu."""
        self._down.clear()

    @property
    def down(self) -> bool:
        return bool(self._down)


def hotkey_label(spec: str) -> str:
    """``"alt+shift+s"`` -> ``"Alt + Shift + S"``; ``""`` -> ``"wyłączony"``."""
    parts = [p.strip().lower() for p in (spec or "").split("+") if p.strip()]
    if not parts:
        return "wyłączony"
    return " + ".join(_MOD_LABELS.get(p, p.upper()) for p in parts)


def hotkey_problem(spec: str) -> str | None:
    """Why ``spec`` is a poor save-to-Archive hotkey (Polish), or None. "" (off) is fine.

    The same rules as the dashboard's Settings -> Keybinds, so the two never disagree.
    """
    if not spec:
        return None
    try:
        parse_hotkey(spec)
    except ValueError:
        return "Skrót to Ctrl, Alt, Shift lub Win i jedna litera, cyfra albo F1-F24."
    parts = [p.strip().lower() for p in spec.split("+") if p.strip()]
    mods = {"ctrl" if p == "control" else p for p in parts if p in _MOD_LABELS}
    key = next(p for p in parts if p not in _MOD_LABELS)
    if {"ctrl", "alt"} <= mods:
        return "Ctrl + Alt to na polskiej klawiaturze AltGr (ą, ę, ś, ż...). Wybierz inną kombinację."
    if mods == {"shift"} and not re.fullmatch(r"f\d+", key):
        return "Sam Shift pisze wielkie litery. Dodaj Ctrl albo Alt."
    if mods == {"ctrl"} and f"ctrl+{key}" in _EVERYWHERE:
        return "Tego skrótu używa każdy program (kopiuj, wklej, zapisz...). Wybierz inny."
    return None


# -- form logic (pure) ---------------------------------------------------------------

def routine_text(vault: Path) -> str:
    """The prompt the user pastes into the Claude Desktop scheduled task."""
    return winsetup.ROUTINE_TASK.format(vault=vault)


def clean_path(text: str) -> str:
    """A folder as typed or pasted: no quotes (Explorer's "Copy as path"), %VARS% and ~ expanded."""
    p = (text or "").strip().strip('"').strip()
    if not p:
        return ""
    return os.path.normpath(os.path.expandvars(os.path.expanduser(p)))


def _same_path(a: str | Path, b: str | Path) -> bool:
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


class Problem(str):
    """A Polish message from ``validate``: errors block saving, warnings only ask "Kontynuować?"."""

    warning: bool

    def __new__(cls, text: str, warning: bool = False) -> Problem:
        obj = super().__new__(cls, text)
        obj.warning = warning
        return obj


def validate(form: Mapping[str, Any]) -> list[Problem]:
    """Problems with the form (keys as in ``SetupWindow.form_values``), errors first."""
    errors: list[str] = []
    warnings: list[str] = []
    vault = str(form.get("vault_dir") or "")
    if not vault:
        errors.append("Wybierz folder vaulta Obsidian.")
    elif not os.path.isabs(vault):
        errors.append("Podaj pełną ścieżkę vaulta (z literą dysku) albo kliknij „Wybierz...”.")
    elif Path(vault).exists() and not Path(vault).is_dir():
        errors.append("Ścieżka vaulta wskazuje plik, a nie folder.")
    rec = str(form.get("recordings_dir") or "")
    if form.get("transcribe"):
        if not rec:
            errors.append("Wybierz folder z nagraniami albo wyłącz transkrypcję.")
        elif vault and _same_path(rec, vault):
            errors.append("Folder nagrań i vault muszą być różnymi folderami.")
        elif not Path(rec).is_dir():
            warnings.append("Folder nagrań jeszcze nie istnieje: tracker zacznie, gdy się pojawi.")
    hotkey = str(form.get("hotkey") or "")
    if hotkey:
        try:
            parse_hotkey(hotkey)
        except ValueError:
            errors.append(f"Nieprawidłowy skrót „{hotkey}”. Kliknij „Zmień...” i naciśnij nowy.")
        else:
            problem = hotkey_problem(hotkey)
            if problem:
                warnings.append(f"Skrót {hotkey_label(hotkey)}: {problem}")
    url = str(form.get("supabase_url") or "")
    if not url or not form.get("supabase_anon_key"):
        errors.append("Brakuje ustawień dashboardu (adres Supabase i klucz). Poczekaj, aż się pobiorą, "
                      "albo wpisz je w sekcji Zaawansowane.")
    elif not url.startswith(("https://", "http://")):
        errors.append("Adres Supabase musi zaczynać się od https://")
    if not form.get("signed_in"):
        warnings.append("Nie zalogowano: tracker policzy czas lokalnie i wyśle go, gdy zalogujesz się "
                        "z menu ikonki przy zegarze.")
    return [Problem(e) for e in errors] + [Problem(w, warning=True) for w in warnings]


def recordings_hint(path: str, detected: Path | None, how: str) -> str:
    """The line under the recordings folder: where it came from, or that it does not exist yet."""
    if not path:
        return ""
    if not Path(path).is_dir():
        return "Folder jeszcze nie istnieje: tracker zacznie, gdy się pojawi"
    if detected is not None and _same_path(path, detected):
        return "Wykryto w ustawieniach Bandicam" if how == "bandicam" else "Domyślny folder Bandicam"
    return ""


def claude_desktop_installed(env: Mapping[str, str] | None = None) -> bool:
    """True when a folder Claude Desktop creates exists (install dirs or its settings folder)."""
    env = os.environ if env is None else env
    candidates: list[Path] = []
    if env.get("LOCALAPPDATA"):
        local = Path(env["LOCALAPPDATA"])
        candidates += [local / "AnthropicClaude", local / "Programs" / "claude"]
    if env.get("APPDATA"):
        candidates.append(Path(env["APPDATA"]) / "Claude")
    return any(p.exists() for p in candidates)


def obsidian_action(vault: Path, vaults: list[winsetup.ObsidianVault], installed: bool) -> tuple[str, str]:
    """What the Obsidian section offers.

    ("open", uri) when Obsidian already knows the vault; ("choose", uri) when it is installed
    but the folder must be added by hand (no URI registers a new vault); else ("download", url).
    """
    known = winsetup.vault_registered(vault, vaults)
    if known is not None:
        return "open", "obsidian://open?vault=" + quote(known.id, safe="")
    if installed:
        return "choose", "obsidian://choose-vault"
    return "download", OBSIDIAN_DOWNLOAD_URL


def vault_choices(default: Path, vaults: Iterable[winsetup.ObsidianVault], current: str = "") -> list[str]:
    """The vault dropdown: MindsetForest's own default first, then Obsidian's vaults, no repeats."""
    out: list[str] = []
    seen: set[str] = set()
    for p in [str(default), *(str(v.path) for v in vaults), current]:
        key = os.path.normcase(os.path.normpath(p)) if p else ""
        if key and key not in seen:
            seen.add(key)
            out.append(p)
    return out


def initial_form(existing: Config | None, *, detected: Path, default_vault: Path, autostart: bool) -> dict[str, Any]:
    """The form's starting values: the saved config when there is one, detection otherwise."""
    if existing is None:
        return {
            "supabase_url": "", "supabase_anon_key": "", "dashboard_url": winsetup.DEFAULT_SITE,
            "transcribe": True, "recordings_dir": str(detected), "vault_dir": str(default_vault),
            "hotkey": DEFAULT_HOTKEY, "autostart": autostart, "device_name": socket.gethostname(),
        }
    return {
        "supabase_url": existing.supabase_url, "supabase_anon_key": existing.supabase_anon_key,
        "dashboard_url": existing.dashboard_url or winsetup.DEFAULT_SITE,
        # An empty recordings_dir is how the config says "transcription off".
        "transcribe": bool(existing.recordings_dir),
        "recordings_dir": existing.recordings_dir or str(detected),
        "vault_dir": existing.vault_dir or str(default_vault),
        "hotkey": existing.capture_hotkey, "autostart": autostart,
        "device_name": existing.device_name or socket.gethostname(),
    }


def choices_from_form(form: Mapping[str, Any]) -> winsetup.SetupChoices:
    """``SetupChoices`` for ``winsetup.install``; transcription off is an empty recordings folder."""
    return winsetup.SetupChoices(
        supabase_url=str(form.get("supabase_url") or "").strip().rstrip("/"),
        supabase_anon_key=str(form.get("supabase_anon_key") or "").strip(),
        dashboard_url=str(form.get("dashboard_url") or "").strip() or winsetup.DEFAULT_SITE,
        recordings_dir=str(form.get("recordings_dir") or "") if form.get("transcribe") else "",
        vault_dir=str(form.get("vault_dir") or ""),
        capture_hotkey=str(form.get("hotkey") or ""),
        autostart=bool(form.get("autostart", True)),
        device_name=str(form.get("device_name") or "").strip(),
    )


def signin_error_text(exc: BaseException) -> str:
    """A sign-in failure in Polish where it is a known one, else the server's own words."""
    text = str(exc)
    low = text.lower()
    if isinstance(exc, AuthUnavailable):
        return f"Serwer logowania jest niedostępny ({text}). Sprawdź internet i spróbuj ponownie."
    if "invalid login credentials" in low:
        return "Nieprawidłowy e-mail lub hasło."
    if "email not confirmed" in low:
        return "Najpierw potwierdź adres e-mail (link w wiadomości po rejestracji)."
    return f"Logowanie nie powiodło się: {text}"


def done_messages(messages: Iterable[str]) -> list[str]:
    """install()'s lines for the "Gotowe" page, minus the routine ones: the routine panel shows those."""
    return [m for m in messages if "rutyn" not in m.lower()]


def error_text(exc: BaseException) -> str:
    """``SetupError`` messages are written for the user; anything else gets its type for the log."""
    if isinstance(exc, (winsetup.SetupError, AuthError)):
        return str(exc)
    return f"Coś poszło nie tak ({type(exc).__name__}): {exc}"


# -- the window ----------------------------------------------------------------------

tk: Any = None
ttk: Any = None
filedialog: Any = None
messagebox: Any = None
tkfont: Any = None


def _import_tk() -> None:
    """tkinter on first use, so this module (and its tests) work where it is missing."""
    global tk, ttk, filedialog, messagebox, tkfont
    if tk is not None:
        return
    import tkinter
    from tkinter import filedialog as _filedialog
    from tkinter import font as _font
    from tkinter import messagebox as _messagebox
    from tkinter import ttk as _ttk

    tk, ttk, filedialog, messagebox, tkfont = tkinter, _ttk, _filedialog, _messagebox, _font


def _dpi_aware() -> None:
    """Sharp text on scaled Windows displays; the layout scales through ``SetupWindow.px``."""
    if sys.platform != "win32":
        return
    import ctypes

    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            log.debug("DPI awareness unavailable", exc_info=True)


def run_setup_window(mode: str, *, data_dir: Path, ops: winsetup.WinOps, source_exe: Path | None) -> int:
    """Show the window until it is closed: 0 after installing, saving or uninstalling, else 1."""
    if mode not in ("install", "settings"):
        raise ValueError(f"unknown setup window mode {mode!r}")
    _import_tk()
    _dpi_aware()
    root = tk.Tk()
    try:
        window = SetupWindow(root, mode, data_dir=data_dir, ops=ops, source_exe=source_exe)
    except Exception as exc:  # no console in the exe: an unseen traceback would look like nothing happened
        log.exception("The setup window could not open")
        try:
            root.withdraw()
            messagebox.showerror("MindsetForest", error_text(exc), parent=root)
            root.destroy()
        except Exception:
            log.debug("could not report the error", exc_info=True)
        return 1
    root.mainloop()
    return window.exit_code


def _grow(font: Any, by: int) -> int:
    size = int(font.cget("size"))
    return size - by if size < 0 else size + by  # negative sizes are pixels


class SetupWindow:
    """The form, its worker threads and the "Gotowe" page (see the module docstring)."""

    def __init__(self, root: Any, mode: str, *, data_dir: Path, ops: winsetup.WinOps,
                 source_exe: Path | None) -> None:
        _import_tk()
        self.root = root
        self.mode = mode
        self.data_dir = data_dir
        self.ops = ops
        self.source_exe = source_exe
        self.exit_code = 1
        self.closed = False
        self.busy = False          # installing / uninstalling
        self.signing_in = False
        self.fetching = False
        self.switching_account = False
        self.submit_after_signin = False  # "Zainstaluj" pressed with an email and password not yet sent
        self.page_name = "form"
        self.events: queue.Queue[tuple[str, bool, Any]] = queue.Queue()
        self.result: winsetup.InstallResult | None = None
        self.last_choices: winsetup.SetupChoices | None = None
        self.routine_text_widget: Any = None
        self._keep: list[Any] = []  # tk variables and images must outlive the build methods
        self.scale = max(1.0, float(root.winfo_fpixels("1i")) / 96.0)
        self.wrap = self.px(520)

        root.title("MindsetForest - instalacja" if mode == "install" else "MindsetForest - ustawienia")
        root.resizable(False, True)
        root.protocol("WM_DELETE_WINDOW", self.close)
        root.report_callback_exception = self._callback_error
        self._styles()
        self._set_icon()
        self._build_scroller()
        self._load_state()
        self._build_form()
        self._poll_id = root.after(POLL_MS, self._poll)
        root.bind("<Destroy>", self._destroyed, add="+")
        if not (self.url_var.get() and self.key_var.get()):
            self.fetch_site_config()
        self._center()

    # -- plumbing ------------------------------------------------------------------

    def px(self, n: float) -> int:
        """Pixels scaled for the display's DPI."""
        return int(round(n * self.scale))

    def _var(self, value: Any = "", kind: str = "str") -> Any:
        var = tk.BooleanVar(master=self.root, value=value) if kind == "bool" else tk.StringVar(master=self.root, value=value)
        self._keep.append(var)
        return var

    def _styles(self) -> None:
        base = tkfont.nametofont("TkDefaultFont")
        self.font_bold = base.copy()
        self.font_bold.configure(weight="bold")
        self.font_section = base.copy()
        self.font_section.configure(weight="bold", size=_grow(base, 1))
        self.font_title = base.copy()
        self.font_title.configure(weight="bold", size=_grow(base, 7))
        self.font_hotkey = base.copy()
        self.font_hotkey.configure(weight="bold", size=_grow(base, 3))
        style = ttk.Style(self.root)
        style.configure("Title.TLabel", font=self.font_title)
        style.configure("Section.TLabel", font=self.font_section)
        style.configure("Bold.TLabel", font=self.font_bold)
        style.configure("Hotkey.TLabel", font=self.font_hotkey)
        style.configure("Hint.TLabel", foreground="#5f6368")
        style.configure("Error.TLabel", foreground="#c62828")
        style.configure("Routine.TLabelframe.Label", font=self.font_section, foreground="#1b5e20")
        style.configure("Box.TLabelframe.Label", font=self.font_section)

    def _set_icon(self) -> None:
        try:
            from PIL import ImageTk

            from .tray import make_icon_image

            icon = ImageTk.PhotoImage(make_icon_image(64), master=self.root)
            self.root.iconphoto(True, icon)
            self._keep.append(icon)
        except Exception:
            log.debug("window icon unavailable", exc_info=True)

    def _build_scroller(self) -> None:
        """A canvas around the page, so small screens scroll instead of cutting the buttons off."""
        bg = ttk.Style(self.root).lookup("TFrame", "background") or self.root.cget("background")
        self.root.configure(background=bg)
        self.canvas = tk.Canvas(self.root, highlightthickness=0, borderwidth=0, background=bg,
                                width=self.px(560), height=self.px(400))
        self.vsb = ttk.Scrollbar(self.root, orient="vertical", command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=self.vsb.set)
        self.canvas.grid(row=0, column=0, sticky="nsew")
        self.vsb.grid(row=0, column=1, sticky="ns")
        self.vsb.grid_remove()
        self.root.rowconfigure(0, weight=1)
        self.root.columnconfigure(0, weight=1)
        self.page = ttk.Frame(self.canvas, padding=self.px(16))
        self._page_item = self.canvas.create_window(0, 0, window=self.page, anchor="nw")
        self.page.bind("<Configure>", self._fit)
        self.canvas.bind("<Configure>", self._canvas_resized)
        for seq in ("<MouseWheel>", "<Button-4>", "<Button-5>"):
            self.root.bind_all(seq, self._wheel, add="+")

    def _fit(self, _event: Any = None) -> None:
        need = self.page.winfo_reqheight()
        room = self.root.winfo_screenheight() - self.px(120)
        self.canvas.configure(scrollregion=(0, 0, 0, need), height=min(need, room))
        self._toggle_scrollbar()

    def _canvas_resized(self, event: Any) -> None:
        self.canvas.itemconfigure(self._page_item, width=event.width)
        self._toggle_scrollbar()

    def _toggle_scrollbar(self) -> None:
        shown = self.canvas.winfo_height() if self.canvas.winfo_ismapped() else int(self.canvas.cget("height"))
        if self.page.winfo_reqheight() > shown + 1:
            self.vsb.grid()
        else:
            self.vsb.grid_remove()

    def _wheel(self, event: Any) -> None:
        if self.closed or self.page.winfo_reqheight() <= self.canvas.winfo_height():
            return
        if getattr(event, "num", None) == 4:
            step = -1
        elif getattr(event, "num", None) == 5:
            step = 1
        else:
            delta = int(getattr(event, "delta", 0) or 0)
            step = -(delta // 120) if abs(delta) >= 120 else (-1 if delta > 0 else 1)
        self.canvas.yview_scroll(step, "units")

    def _center(self) -> None:
        self.root.update_idletasks()
        self._fit()  # <Configure> has not been delivered yet, so size the canvas now
        self.root.update_idletasks()
        w, h = self.root.winfo_reqwidth(), self.root.winfo_reqheight()
        x = max(0, (self.root.winfo_screenwidth() - w) // 2)
        y = max(0, (self.root.winfo_screenheight() - h) // 3)
        self.root.geometry(f"+{x}+{y}")
        self.root.lift()
        try:
            self.root.focus_force()
        except tk.TclError:
            pass

    def _place_over(self, top: Any) -> None:
        top.update_idletasks()
        x = self.root.winfo_rootx() + (self.root.winfo_width() - top.winfo_reqwidth()) // 2
        y = self.root.winfo_rooty() + self.px(60)
        top.geometry(f"+{max(0, x)}+{max(0, y)}")

    def _modal(self, top: Any, tries: int = 20) -> None:
        """Keep input in ``top``. The grab is retried until the window is mapped, never waited for."""
        top.transient(self.root)
        self._place_over(top)
        top.focus_force()

        def grab(left: int) -> None:
            if self.closed or not top.winfo_exists():
                return
            try:
                top.grab_set()
            except tk.TclError:  # "window not viewable" until it is mapped
                if left:
                    top.after(50, lambda: grab(left - 1))

        grab(tries)

    def _spawn(self, kind: str, fn: Callable[[], Any]) -> None:
        """Run ``fn`` in a worker thread; its result comes back as ``_on_<kind>(ok, value)``."""
        def run() -> None:
            try:
                result: tuple[bool, Any] = (True, fn())
            except Exception as exc:  # shown to the user by the handler
                log.warning("%s failed: %s", kind, exc,
                            exc_info=not isinstance(exc, (winsetup.SetupError, AuthError)))
                result = (False, exc)
            self.events.put((kind, *result))

        threading.Thread(target=run, name=f"setup-{kind}", daemon=True).start()

    def _poll(self) -> None:
        try:
            while True:
                try:
                    kind, ok, value = self.events.get_nowait()
                except queue.Empty:
                    break
                getattr(self, f"_on_{kind}")(ok, value)
        finally:
            if not self.closed:
                self._poll_id = self.root.after(POLL_MS, self._poll)

    def _callback_error(self, exc_type: type, exc: BaseException, tb: Any) -> None:
        """Any error in a button or a worker handler: say so and keep the window usable."""
        log.error("Setup window error", exc_info=(exc_type, exc, tb))
        if self.busy:
            self.busy = False
            self._refresh_buttons()
        try:
            messagebox.showerror("MindsetForest", error_text(exc), parent=self.root)
        except Exception:
            log.debug("could not show the error", exc_info=True)

    @staticmethod
    def _try(fn: Callable[[], Any], default: Any, what: str, notes: list[str] | None = None) -> Any:
        try:
            return fn()
        except Exception as exc:
            log.warning("%s failed: %s", what, exc, exc_info=True)
            if notes is not None and not isinstance(exc, NotImplementedError):
                notes.append(f"{what}: {exc}")
            return default

    def close(self, force: bool = False) -> None:
        if self.busy and not force:
            messagebox.showinfo("MindsetForest", "Poczekaj chwilę, aż skończę.", parent=self.root)
            return
        self.root.destroy()

    def _destroyed(self, event: Any) -> None:
        if event.widget is not self.root or self.closed:
            return  # every child's <Destroy> passes through the root's binding too
        self.closed = True
        try:
            self.root.after_cancel(self._poll_id)
        except Exception:
            pass
        if self.exit_code != 0:  # closed without installing: a sign-in made here is dropped
            with suppress(OSError):
                (self.data_dir / winsetup.PENDING_SESSION).unlink()

    # -- state ---------------------------------------------------------------------

    def _load_state(self) -> None:
        """Existing config, Bandicam and Obsidian detection; any failure falls back to defaults."""
        notes: list[str] = []
        legacy = self._try(lambda: winsetup.find_legacy_install(self.ops), None, "Stara instalacja", notes)
        self.existing: Config | None = self._try(
            lambda: winsetup.load_existing_config(self.data_dir, legacy), None, "Zapisane ustawienia", notes)
        fallback = (Path(Config().recordings_dir), "default")
        self.detected: tuple[Path, str] = self._try(
            lambda: winsetup.detect_bandicam_dir(self.ops), fallback, "Folder Bandicam", notes)
        autostart = True
        if self.mode == "settings":
            # The old zip install autostarts from the Startup folder; install() moves that to Run.
            autostart = self._try(lambda: self.ops.get_run(winsetup.RUN_VALUE) is not None or legacy is not None,
                                  True, "Autostart", notes)
        self.obsidian_list: list[winsetup.ObsidianVault] = self._try(
            winsetup.obsidian_vaults, [], "Vaulty Obsidiana", notes)
        self.default_vault: Path = self._try(winsetup.default_vault_dir, Path(Config().vault_dir), "Domyślny vault", notes)
        self.initial = initial_form(self.existing, detected=self.detected[0], default_vault=self.default_vault,
                                    autostart=autostart)
        self.account_email: str | None = self._saved_account()
        self.load_notes = notes

    def _saved_account(self) -> str | None:
        """The signed-in email: a sign-in made here and not yet installed, else session.bin.

        Reads the files only: no refresh, no network.
        """
        for name in (winsetup.PENDING_SESSION, winsetup.SESSION_FILE):
            try:
                auth = SupabaseAuth("", "", self.data_dir / name)
                if auth.load_saved():
                    return auth.email or auth.user_id or "?"
            except Exception:
                log.warning("Could not read the saved session %s", name, exc_info=True)
        return None

    def form_values(self) -> dict[str, Any]:
        return {
            "supabase_url": self.url_var.get().strip().rstrip("/"),
            "supabase_anon_key": self.key_var.get().strip(),
            "dashboard_url": self.site_var.get().strip(),
            "signed_in": self.account_email is not None,
            "transcribe": bool(self.transcribe_var.get()),
            "recordings_dir": clean_path(self.rec_var.get()),
            "vault_dir": clean_path(self.vault_var.get()),
            "hotkey": self.hotkey_var.get(),
            "autostart": bool(self.autostart_var.get()),
            "device_name": self.device_var.get().strip(),
        }

    # -- the form ------------------------------------------------------------------

    def _section(self, parent: Any, title: str) -> Any:
        ttk.Label(parent, text=title, style="Section.TLabel", wraplength=self.wrap).pack(
            anchor="w", pady=(self.px(12), self.px(3)))
        box = ttk.Frame(parent)
        box.pack(fill="x")
        box.columnconfigure(0, weight=1)
        return box

    def _hint(self, parent: Any, text: str = "", var: Any = None, style: str = "Hint.TLabel") -> Any:
        return ttk.Label(parent, text=text, textvariable=var, style=style, wraplength=self.wrap, justify="left")

    def _build_form(self) -> None:
        form = self.form = ttk.Frame(self.page)
        form.pack(fill="x")
        ttk.Label(form, text="MindsetForest", style="Title.TLabel").pack(anchor="w")
        tagline = INSTALL_TAGLINE if self.mode == "install" else SETTINGS_TAGLINE
        ttk.Label(form, text=tagline, wraplength=self.wrap, justify="left").pack(anchor="w", pady=(self.px(2), 0))
        if self.load_notes:
            self._hint(form, "Nie wszystko udało się wykryć automatycznie (" + "; ".join(self.load_notes)
                       + "). Sprawdź pola poniżej.", style="Error.TLabel").pack(anchor="w", pady=(self.px(6), 0))
        self.lock_while_busy: list[Any] = []
        self._account_section(form)
        self._recordings_section(form)
        self._vault_section(form)
        self._routine_teaser(form)
        self._hotkey_section(form)
        self.autostart_var = self._var(bool(self.initial["autostart"]), "bool")
        ttk.Checkbutton(form, text="Uruchamiaj przy starcie Windows", variable=self.autostart_var).pack(
            anchor="w", pady=(self.px(16), 0))
        self._advanced_section(form)
        self._bottom_buttons(form)
        self._refresh_buttons()

    def _account_section(self, parent: Any) -> None:
        box = self._section(parent, "Konto")
        px = self.px
        self.signed_in_frame = ttk.Frame(box)
        self.signed_in_frame.grid(row=0, column=0, sticky="ew")
        self.signed_in_frame.columnconfigure(0, weight=1)
        self.signed_in_var = self._var()
        ttk.Label(self.signed_in_frame, textvariable=self.signed_in_var, style="Bold.TLabel").grid(
            row=0, column=0, sticky="w")
        self.other_account_button = ttk.Button(self.signed_in_frame, text="Zaloguj inne konto",
                                               command=self._switch_account)
        self.other_account_button.grid(row=0, column=1, sticky="e", padx=(px(8), 0))

        self.signin_frame = ttk.Frame(box)
        self.signin_frame.grid(row=1, column=0, sticky="ew", pady=(px(4), 0))
        self.signin_frame.columnconfigure(1, weight=1)
        self.email_var = self._var(self.account_email if self.account_email and "@" in self.account_email else "")
        self.password_var = self._var()
        ttk.Label(self.signin_frame, text="E-mail").grid(row=0, column=0, sticky="w", pady=(0, px(4)))
        email = ttk.Entry(self.signin_frame, textvariable=self.email_var, width=10)
        email.grid(row=0, column=1, columnspan=2, sticky="ew", padx=(px(8), 0), pady=(0, px(4)))
        ttk.Label(self.signin_frame, text="Hasło").grid(row=1, column=0, sticky="w")
        password = ttk.Entry(self.signin_frame, textvariable=self.password_var, show="•", width=10)
        password.grid(row=1, column=1, sticky="ew", padx=(px(8), 0))
        password.bind("<Return>", lambda _e: self.sign_in())
        self.signin_button = ttk.Button(self.signin_frame, text="Zaloguj", command=self.sign_in)
        self.signin_button.grid(row=1, column=2, sticky="e", padx=(px(8), 0))
        self.signin_error = self._var()
        label = self.signin_error_label = self._hint(self.signin_frame, var=self.signin_error, style="Error.TLabel")
        label.grid(row=2, column=0, columnspan=3, sticky="w", pady=(px(4), 0))
        label.grid_remove()  # an empty line would leave a gap
        self.signin_error.trace_add("write", lambda *_a: label.grid() if self.signin_error.get() else label.grid_remove())
        self._hint(box, "Konto z dashboardu MindsetForest. Logujesz się raz; tracker zapamięta logowanie.").grid(
            row=2, column=0, sticky="w", pady=(px(2), 0))
        self._render_account()

    def _render_account(self) -> None:
        signed = self.account_email is not None
        if signed:
            self.signed_in_var.set(f"Zalogowano: {self.account_email}")
            self.signed_in_frame.grid()
        else:
            self.signed_in_frame.grid_remove()
        if signed and not self.switching_account:
            self.signin_frame.grid_remove()
            self.other_account_button.grid()
        else:
            self.signin_frame.grid()
            self.other_account_button.grid_remove()

    def _switch_account(self) -> None:
        # The saved session stays until a new sign-in succeeds.
        self.switching_account = True
        self._render_account()

    def _recordings_section(self, parent: Any) -> None:
        box = self._section(parent, "Nagrania (Bandicam)")
        px = self.px
        self.transcribe_var = self._var(bool(self.initial["transcribe"]), "bool")
        ttk.Checkbutton(box, text="Transkrybuj nowe nagrania MP3 z folderu", variable=self.transcribe_var,
                        command=self._recordings_changed).grid(row=0, column=0, columnspan=2, sticky="w")
        self.rec_var = self._var(self.initial["recordings_dir"])
        self.rec_entry = ttk.Entry(box, textvariable=self.rec_var, width=10)
        self.rec_entry.grid(row=1, column=0, sticky="ew", pady=(px(4), 0))
        self.rec_button = ttk.Button(box, text="Wybierz...", command=self._pick_recordings)
        self.rec_button.grid(row=1, column=1, padx=(px(8), 0), pady=(px(4), 0))
        self.rec_hint = self._var()
        self._hint(box, var=self.rec_hint).grid(row=2, column=0, columnspan=2, sticky="w")
        self.rec_var.trace_add("write", lambda *_a: self._recordings_changed())
        self._recordings_changed()

    def _recordings_changed(self) -> None:
        on = bool(self.transcribe_var.get())
        for w in (self.rec_entry, self.rec_button):
            w.state(["!disabled"] if on else ["disabled"])
        if on:
            self.rec_hint.set(recordings_hint(clean_path(self.rec_var.get()), *self.detected))
        else:
            self.rec_hint.set("Transkrypcja wyłączona. Notatki z vaulta nadal trafiają do dashboardu.")

    def _pick_recordings(self) -> None:
        current = clean_path(self.rec_var.get())
        path = filedialog.askdirectory(parent=self.root, title="Folder z nagraniami Bandicam", mustexist=False,
                                       initialdir=current if os.path.isdir(current) else str(Path.home()))
        if path:
            self.rec_var.set(str(Path(path)))

    def _vault_section(self, parent: Any) -> None:
        box = self._section(parent, "Vault Obsidian")
        self.vault_var = self._var(self.initial["vault_dir"])
        values = vault_choices(self.default_vault, self.obsidian_list, self.initial["vault_dir"])
        self.vault_combo = ttk.Combobox(box, textvariable=self.vault_var, values=values, width=10)
        self.vault_combo.grid(row=0, column=0, sticky="ew")
        for seq in ("<MouseWheel>", "<Button-4>", "<Button-5>"):
            # The combobox's own wheel binding cycles its values: scrolling the page would switch vaults.
            self.vault_combo.bind(seq, lambda e: (self._wheel(e), "break")[1])
        ttk.Button(box, text="Wybierz...", command=self._pick_vault).grid(row=0, column=1, padx=(self.px(8), 0))
        folders = " i ".join(f"{f}/" for f in MIRROR_FOLDERS)
        hint = f"Tu trafią transkrypty i notatki. Notatki z {folders} widać w dashboardzie (Archive)."
        if self.obsidian_list:
            hint += " Twoje vaulty z Obsidiana są na liście; osobny folder MindsetForest też jest w porządku."
        self._hint(box, hint).grid(row=1, column=0, columnspan=2, sticky="w", pady=(self.px(2), 0))

    def _pick_vault(self) -> None:
        current = clean_path(self.vault_var.get())
        start = current if os.path.isdir(current) else str(Path(current).parent if current else Path.home())
        path = filedialog.askdirectory(parent=self.root, title="Folder vaulta Obsidian", mustexist=False,
                                       initialdir=start if os.path.isdir(start) else str(Path.home()))
        if path:
            self.vault_var.set(str(Path(path)))

    def _routine_teaser(self, parent: Any) -> None:
        box = self._section(parent, "Rutyna Claude")
        if self.mode == "install":
            text = ("Po instalacji pokażę, jak ustawić rutynę Claude w Claude Desktop. Bez niej nagrania "
                    "zamienią się w tekst, ale notatki wiedzy nie powstaną.")
            self._hint(box, text).grid(row=0, column=0, sticky="w")
            return
        self._hint(box, "Notatki wiedzy z nagrań robi rutyna Claude w Claude Desktop. Ustawiasz ją raz.").grid(
            row=0, column=0, sticky="w")
        ttk.Button(box, text="Pokaż, jak ustawić rutynę Claude", command=self.show_routine_help).grid(
            row=1, column=0, sticky="w", pady=(self.px(4), 0))

    def _hotkey_section(self, parent: Any) -> None:
        box = self._section(parent, "Skrót: zapisz zaznaczony tekst w Archive")
        px = self.px
        self.hotkey_var = self._var(self.initial["hotkey"])
        self.hotkey_text = self._var(hotkey_label(self.initial["hotkey"]))
        self.hotkey_var.trace_add("write", lambda *_a: self.hotkey_text.set(hotkey_label(self.hotkey_var.get())))
        ttk.Label(box, textvariable=self.hotkey_text, style="Hotkey.TLabel").grid(row=0, column=0, sticky="w")
        change = ttk.Button(box, text="Zmień...", command=self.capture_hotkey)
        change.grid(row=0, column=1, padx=(px(8), 0))
        off = ttk.Button(box, text="Wyłącz", command=lambda: self.hotkey_var.set(""))
        off.grid(row=0, column=2, padx=(px(8), 0))
        self.lock_while_busy += [change, off]
        self._hint(box, "To samo ustawienie co w dashboardzie (Settings → Keybinds); zmiana działa w ciągu minuty.").grid(
            row=1, column=0, columnspan=3, sticky="w", pady=(px(2), 0))

    def _advanced_section(self, parent: Any) -> None:
        px = self.px
        self.adv_button = ttk.Button(parent, text="Zaawansowane (pokaż)", command=lambda: self._show_advanced(None))
        self.adv_button.pack(anchor="w", pady=(px(16), 0))
        self.adv_frame = ttk.Frame(parent)
        self.adv_frame.columnconfigure(1, weight=1)
        self.site_var = self._var(self.initial["dashboard_url"])
        self.url_var = self._var(self.initial["supabase_url"])
        self.key_var = self._var(self.initial["supabase_anon_key"])
        self.device_var = self._var(self.initial["device_name"])
        rows = (("Adres dashboardu", self.site_var), ("Supabase URL", self.url_var),
                ("Klucz publiczny", self.key_var), ("Nazwa urządzenia", self.device_var))
        for row, (label, var) in enumerate(rows):
            ttk.Label(self.adv_frame, text=label).grid(row=row, column=0, sticky="w", pady=(0, px(4)))
            ttk.Entry(self.adv_frame, textvariable=var, width=10).grid(
                row=row, column=1, sticky="ew", padx=(px(8), 0), pady=(0, px(4)))
        self.fetch_button = ttk.Button(self.adv_frame, text="Pobierz ustawienia", command=self.fetch_site_config)
        self.fetch_button.grid(row=0, column=2, padx=(px(8), 0), pady=(0, px(4)))
        self.advanced_note = self._var()
        self._hint(self.adv_frame, var=self.advanced_note, style="Error.TLabel").grid(
            row=len(rows), column=0, columnspan=3, sticky="w")
        self.adv_open = False

    def _show_advanced(self, show: bool | None) -> None:
        self.adv_open = (not self.adv_open) if show is None else show
        self.adv_button.configure(text="Zaawansowane (ukryj)" if self.adv_open else "Zaawansowane (pokaż)")
        if self.adv_open:
            self.adv_frame.pack(fill="x", after=self.adv_button, pady=(self.px(6), 0))
        else:
            self.adv_frame.pack_forget()

    def _bottom_buttons(self, parent: Any) -> None:
        px = self.px
        self.status_var = self._var()
        self._hint(parent, var=self.status_var).pack(anchor="w", pady=(px(10), 0))
        row = ttk.Frame(parent)
        row.pack(fill="x", pady=(px(8), 0))
        text = "Zainstaluj i uruchom" if self.mode == "install" else "Zapisz"
        self.submit_button = ttk.Button(row, text=text, command=self.submit, default="active")
        self.submit_button.pack(side="right")
        cancel = ttk.Button(row, text="Anuluj", command=self.close)
        cancel.pack(side="right", padx=(0, px(8)))
        self.lock_while_busy += [self.submit_button, cancel]
        if self.mode == "settings":
            uninstall = ttk.Button(row, text="Odinstaluj...", command=self.uninstall)
            uninstall.pack(side="left")
            self.lock_while_busy.append(uninstall)

    def _refresh_buttons(self) -> None:
        if self.page_name != "form":
            return

        def enable(widget: Any, on: bool) -> None:
            widget.state(["!disabled"] if on else ["disabled"])

        for widget in self.lock_while_busy:
            enable(widget, not self.busy)
        enable(self.signin_button, not self.busy and not self.signing_in)
        enable(self.fetch_button, not self.busy and not self.fetching)

    # -- worker actions ------------------------------------------------------------

    def fetch_site_config(self) -> None:
        """Supabase URL + public key from the dashboard's ``downloads/tracker-config.json``."""
        if self.fetching:
            return
        site = self.site_var.get().strip() or winsetup.DEFAULT_SITE
        self.fetching = True
        self.status_var.set("Pobieram ustawienia z dashboardu...")
        self._refresh_buttons()
        self._spawn("site", lambda: winsetup.fetch_site_config(site))

    def _on_site(self, ok: bool, value: Any) -> None:
        self.fetching = False
        if self.page_name != "form":
            return
        if not self.busy:
            self.status_var.set("")
        self._refresh_buttons()
        if ok:
            self.url_var.set(value["supabase_url"])
            self.key_var.set(value["supabase_anon_key"])
            if value.get("dashboard_url"):
                self.site_var.set(value["dashboard_url"])
            self.advanced_note.set("")
        else:
            self.advanced_note.set(
                f"Nie udało się pobrać ustawień z dashboardu: {error_text(value)}\nSprawdź internet i kliknij "
                "„Pobierz ustawienia” albo wpisz adres Supabase i klucz publiczny ręcznie.")
            self._show_advanced(True)

    def _signin_message(self, text: str, error: bool = True) -> None:
        self.signin_error_label.configure(style="Error.TLabel" if error else "Hint.TLabel")
        self.signin_error.set(text)

    def sign_in(self) -> bool:
        """Start a password sign-in in a worker; False when it could not start (the reason is shown)."""
        if self.signing_in or self.busy:
            return False
        email, password = self.email_var.get().strip(), self.password_var.get()
        if not email or not password:
            self._signin_message("Wpisz e-mail i hasło.")
            return False
        url, key = self.url_var.get().strip().rstrip("/"), self.key_var.get().strip()
        if not url or not key:
            self._signin_message("Brakuje ustawień dashboardu: poczekaj, aż się pobiorą, albo uzupełnij "
                                 "sekcję Zaawansowane.")
            return False
        self.signing_in = True
        self._signin_message("Loguję...", error=False)
        self._refresh_buttons()
        # A fresh password sign-in makes an independent session; the saved one is never refreshed here.
        # It waits in session.new.bin until install() has stopped the running tracker (which could
        # otherwise save its own rotated token over it) and moves it into place.
        session_path = self.data_dir / winsetup.PENDING_SESSION
        self._spawn("signin", lambda: SupabaseAuth(url, key, session_path).sign_in(email, password).email or email)
        return True

    def _on_signin(self, ok: bool, value: Any) -> None:
        self.signing_in = False
        then_submit, self.submit_after_signin = self.submit_after_signin, False
        if self.page_name != "form":
            return
        self._refresh_buttons()
        if then_submit:
            self.status_var.set("")
        if ok:
            self.account_email = value
            self.switching_account = False
            self.password_var.set("")
            self._signin_message("")
            self._render_account()
            if then_submit:
                self.submit()
        else:
            self._signin_message(signin_error_text(value))
            if then_submit:
                messagebox.showerror("MindsetForest", signin_error_text(value), parent=self.root)

    def submit(self) -> None:
        if self.busy:
            return
        if self.signing_in:
            self.submit_after_signin = True  # carry on once the sign-in answers
            self.status_var.set("Czekam na logowanie...")
            return
        typed = self.email_var.get().strip() and self.password_var.get()
        if typed and (self.account_email is None or self.switching_account) and self.sign_in():
            # Email and password typed but "Zaloguj" never pressed: sign in first, then install.
            self.submit_after_signin = True
            self.status_var.set("Loguję...")
            return
        form = self.form_values()
        problems = validate(form)
        errors = [p for p in problems if not p.warning]
        if errors:
            messagebox.showerror("MindsetForest", "\n\n".join(errors), parent=self.root)
            return
        warnings = [p for p in problems if p.warning]
        if warnings and not messagebox.askyesno(
                "MindsetForest", "\n\n".join(warnings) + "\n\nKontynuować?", parent=self.root):
            return
        choices = self.last_choices = choices_from_form(form)
        self.busy = True
        self._refresh_buttons()
        self.status_var.set("Instaluję..." if self.mode == "install" else "Zapisuję...")

        def progress(line: str) -> None:
            self.events.put(("progress", True, line))

        self._spawn("install", lambda: winsetup.install(
            choices, data_dir=self.data_dir, source_exe=self.source_exe, ops=self.ops, launch=True, progress=progress))

    def _on_progress(self, _ok: bool, line: Any) -> None:
        if self.page_name == "form":
            self.status_var.set(str(line))

    def _on_install(self, ok: bool, value: Any) -> None:
        self.busy = False
        if not ok:
            self.status_var.set("")
            self._refresh_buttons()
            messagebox.showerror("MindsetForest", error_text(value), parent=self.root)
            return
        self.exit_code = 0
        self.show_done(value)

    def uninstall(self) -> None:
        if self.busy:
            return
        if not messagebox.askyesno("MindsetForest", "Odinstalować MindsetForest Tracker? Twoje notatki i vault zostaną.",
                                   parent=self.root):
            return
        remove_data = messagebox.askyesno(
            "MindsetForest", "Usunąć też dane lokalne trackera (zapisany czas, logowanie, ustawienia)?\n\n"
            "Vault i nagrania zostaną w każdym przypadku.", default="no", parent=self.root)
        self.busy = True
        self._refresh_buttons()
        self.status_var.set("Odinstalowuję...")
        self._spawn("uninstall", lambda: winsetup.uninstall(
            data_dir=self.data_dir, ops=self.ops, remove_data=remove_data, running_exe=self.source_exe))

    def _on_uninstall(self, ok: bool, value: Any) -> None:
        self.busy = False
        if not ok:
            self.status_var.set("")
            self._refresh_buttons()
            messagebox.showerror("MindsetForest", error_text(value), parent=self.root)
            return
        self.exit_code = 0
        messagebox.showinfo("MindsetForest", "\n".join(value) or "Odinstalowano.", parent=self.root)
        self.close(force=True)

    # -- the hotkey dialog -----------------------------------------------------------

    def capture_hotkey(self) -> HotkeyDialog:
        return HotkeyDialog(self, self.hotkey_var.set)

    # -- the "Gotowe" page -----------------------------------------------------------

    def show_done(self, result: winsetup.InstallResult) -> None:
        """Replace the form with what is left to do by hand: the Claude routine, then Obsidian."""
        self.result = result
        self.page_name = "done"
        self.form.destroy()
        px = self.px
        done = self.done = ttk.Frame(self.page)
        done.pack(fill="x")
        ttk.Label(done, text="Gotowe", style="Title.TLabel").pack(anchor="w")
        lead = ("Tracker działa (ikonka drzewa przy zegarze)." if result.started else "Ustawienia zapisane.")
        ttk.Label(done, text=lead, style="Bold.TLabel", wraplength=self.wrap, justify="left").pack(
            anchor="w", pady=(px(4), 0))
        messages = done_messages(result.messages)
        if messages:
            self._hint(done, "\n".join(messages)).pack(anchor="w", pady=(px(4), 0))
        self._hint(done, "Ustawienia zmienisz później w menu ikonki: Ustawienia...").pack(anchor="w", pady=(px(4), 0))
        self._routine_panel(done, Path(result.vault)).pack(fill="x", pady=(px(16), 0))
        self._obsidian_panel(done, Path(result.vault)).pack(fill="x", pady=(px(12), 0))
        row = ttk.Frame(done)
        row.pack(fill="x", pady=(px(16), 0))
        ttk.Button(row, text="Zamknij", command=lambda: self.close(force=True), default="active").pack(side="right")
        dashboard = (self.last_choices.dashboard_url if self.last_choices else "") or winsetup.DEFAULT_SITE
        ttk.Button(row, text="Otwórz dashboard", command=lambda: self._open_url(dashboard)).pack(
            side="right", padx=(0, px(8)))
        self.canvas.yview_moveto(0)

    def _routine_panel(self, parent: Any, vault: Path, title: str = ROUTINE_TITLE) -> Any:
        """The four steps that set up the Claude routine in Claude Desktop, with copy buttons."""
        px = self.px
        wrap = self.wrap - px(70)
        box = ttk.LabelFrame(parent, text=title, style="Routine.TLabelframe", padding=px(12))
        box.columnconfigure(1, weight=1)
        ttk.Label(box, text=ROUTINE_INTRO, wraplength=wrap + px(30), justify="left").grid(
            row=0, column=0, columnspan=2, sticky="w", pady=(0, px(4)))

        def step(number: int, text: str) -> Any:
            ttk.Label(box, text=f"{number}.", style="Bold.TLabel").grid(
                row=number, column=0, sticky="nw", padx=(0, px(6)), pady=(px(6), 0))
            cell = ttk.Frame(box)
            cell.grid(row=number, column=1, sticky="ew", pady=(px(6), 0))
            cell.columnconfigure(0, weight=1)
            ttk.Label(cell, text=text, wraplength=wrap, justify="left").grid(row=0, column=0, columnspan=2, sticky="w")
            return cell

        first = step(1, "Otwórz Claude Desktop.")
        if not claude_desktop_installed():
            ttk.Label(first, text="Nie widzę go na tym komputerze.", style="Hint.TLabel").grid(
                row=1, column=0, sticky="w", pady=(px(4), 0))
            ttk.Button(first, text="Pobierz Claude Desktop", command=lambda: self._open_url(CLAUDE_DOWNLOAD_URL)).grid(
                row=1, column=1, sticky="e", pady=(px(4), 0))
        step(2, "Utwórz zadanie cykliczne (scheduled task), które uruchamia się co 2-3 godziny.")
        third = step(3, "Daj mu dostęp do folderu vaulta:")
        self._copyable_path(third, vault)
        fourth = step(4, "Jako polecenie wklej:")
        text = routine_text(vault)
        lines = max(2, min(6, len(text) // 55 + 1))
        prompt = tk.Text(fourth, height=lines, width=10, wrap="word", relief="solid", borderwidth=1,
                         padx=px(6), pady=px(4), font="TkDefaultFont", takefocus=0)
        prompt.insert("1.0", text)
        prompt.configure(state="disabled")  # still selectable, so Ctrl+C works too
        prompt.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(px(4), 0))
        self.routine_text_widget = prompt
        actions = ttk.Frame(fourth)
        actions.grid(row=2, column=0, columnspan=2, sticky="w", pady=(px(6), 0))
        self._copy_button(actions, "Kopiuj polecenie", text).pack(side="left")
        ttk.Label(box, text=ROUTINE_NOTE, style="Hint.TLabel", wraplength=wrap + px(30), justify="left").grid(
            row=5, column=0, columnspan=2, sticky="w", pady=(px(10), 0))
        return box

    def _copyable_path(self, parent: Any, path: Path, row: int = 1) -> None:
        px = self.px
        line = ttk.Frame(parent)
        line.grid(row=row, column=0, columnspan=2, sticky="ew", pady=(px(4), 0))
        line.columnconfigure(0, weight=1)
        entry = ttk.Entry(line, width=10)
        entry.insert(0, str(path))
        entry.state(["readonly"])
        entry.grid(row=0, column=0, sticky="ew")
        self._copy_button(line, "Kopiuj ścieżkę", str(path)).grid(row=0, column=1, padx=(px(8), 0))

    def _obsidian_panel(self, parent: Any, vault: Path) -> Any:
        px = self.px
        box = ttk.LabelFrame(parent, text="Obsidian", style="Box.TLabelframe", padding=px(12))
        box.columnconfigure(0, weight=1)
        vaults = self._try(winsetup.obsidian_vaults, [], "obsidian vaults")
        installed = self._try(winsetup.obsidian_installed, False, "obsidian installed")
        action, target = obsidian_action(vault, vaults, installed)
        if action == "open":
            ttk.Label(box, text="Ten vault jest już w Obsidianie.", wraplength=self.wrap - px(40)).grid(
                row=0, column=0, sticky="w")
            ttk.Button(box, text="Otwórz vault w Obsidianie", command=lambda: self._open_uri(target)).grid(
                row=1, column=0, sticky="w", pady=(px(6), 0))
            return box
        row = 0
        if action == "download":
            ttk.Label(box, text="Obsidian nie jest zainstalowany. Pobierz go, potem otwórz w nim vault.",
                      wraplength=self.wrap - px(40), justify="left").grid(row=row, column=0, sticky="w")
            ttk.Button(box, text="Pobierz Obsidian", command=lambda: self._open_url(OBSIDIAN_DOWNLOAD_URL)).grid(
                row=row + 1, column=0, sticky="w", pady=(px(6), px(8)))
            row += 2
        ttk.Label(box, text=OPEN_FOLDER_AS_VAULT, wraplength=self.wrap - px(40), justify="left").grid(
            row=row, column=0, sticky="w")
        self._copyable_path(box, vault, row=row + 1)
        if action == "choose":
            ttk.Button(box, text="Otwórz Obsidian", command=lambda: self._open_uri(target)).grid(
                row=row + 2, column=0, sticky="w", pady=(px(8), 0))
        return box

    def show_routine_help(self) -> Any:
        """The routine steps from the settings form, for the vault currently chosen there."""
        vault = Path(clean_path(self.vault_var.get()) or self.default_vault)
        top = tk.Toplevel(self.root)
        top.title("Rutyna Claude")
        top.resizable(False, False)
        frame = ttk.Frame(top, padding=self.px(16))
        frame.pack(fill="both", expand=True)
        self._routine_panel(frame, vault, title="Rutyna Claude (przerabia nagrania na notatki)").pack(fill="x")
        ttk.Button(frame, text="Zamknij", command=top.destroy).pack(anchor="e", pady=(self.px(12), 0))
        top.transient(self.root)
        self._place_over(top)
        return top

    # -- small actions ---------------------------------------------------------------

    def _copy_button(self, parent: Any, label: str, text: str) -> Any:
        """A button that copies ``text`` and says "Skopiowano" for a moment (fixed width: no jumping)."""
        button = ttk.Button(parent, text=label, width=max(len(label), len(COPIED)) + 1)
        button.configure(command=lambda: self._copy(text, button, label))
        return button

    def _copy(self, text: str, button: Any = None, label: str = "") -> bool:
        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(text)
        except tk.TclError as exc:
            messagebox.showerror("MindsetForest", f"Nie udało się skopiować: {exc}", parent=self.root)
            return False
        if button is not None:
            button.configure(text=COPIED)

            def restore() -> None:
                if button.winfo_exists():
                    button.configure(text=label)

            self.root.after(2500, restore)
        return True

    def _open_url(self, url: str) -> None:
        try:
            if not webbrowser.open(url):
                raise OSError("nie znaleziono przeglądarki")
        except Exception as exc:
            messagebox.showerror("MindsetForest", f"Nie udało się otworzyć {url}: {exc}", parent=self.root)

    def _open_uri(self, uri: str) -> None:
        """An obsidian:// link through the shell (the browser would ask first, or not know it)."""
        try:
            startfile = getattr(os, "startfile", None)
            if startfile is not None:
                startfile(uri)
            elif not webbrowser.open(uri):
                raise OSError("brak programu dla tego linku")
        except Exception as exc:
            messagebox.showerror("MindsetForest", f"Nie udało się otworzyć {uri}: {exc}", parent=self.root)


class HotkeyDialog:
    """Modal "press the new hotkey" dialog; OK is enabled only for a usable combination."""

    HINT = "Przytrzymaj Ctrl, Alt, Shift albo Win i naciśnij literę, cyfrę lub F1-F24."

    def __init__(self, owner: SetupWindow, on_accept: Callable[[str], None]) -> None:
        px = owner.px
        self.on_accept = on_accept
        self.chosen: str | None = None
        self.supers = SuperKeys()
        top = self.top = tk.Toplevel(owner.root)
        top.title("Nowy skrót")
        top.resizable(False, False)
        frame = ttk.Frame(top, padding=px(16))
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="Naciśnij nowy skrót (Esc anuluje)", style="Section.TLabel").pack(anchor="w")
        self.live = tk.StringVar(master=top, value="...")
        ttk.Label(frame, textvariable=self.live, style="Hotkey.TLabel").pack(pady=px(12))
        self.hint = tk.StringVar(master=top, value=self.HINT)
        ttk.Label(frame, textvariable=self.hint, style="Hint.TLabel", wraplength=px(360), justify="left").pack(
            anchor="w")
        row = ttk.Frame(frame)
        row.pack(fill="x", pady=(px(12), 0))
        # takefocus=False keeps the keyboard on the dialog itself, so Space or Enter never press a button.
        self.ok_button = ttk.Button(row, text="OK", command=self.accept, takefocus=False)
        self.ok_button.state(["disabled"])
        self.ok_button.pack(side="right")
        ttk.Button(row, text="Anuluj", command=top.destroy, takefocus=False).pack(side="right", padx=(0, px(8)))
        top.bind("<KeyPress>", self.press)
        top.bind("<KeyRelease>", self.release)
        top.bind("<FocusOut>", lambda _e: self.supers.reset())
        owner._modal(top)

    def accept(self) -> None:
        if self.chosen:
            self.on_accept(self.chosen)
            self.top.destroy()

    def _offer(self, spec: str | None, message: str) -> None:
        self.chosen = spec
        self.ok_button.state(["!disabled"] if spec else ["disabled"])
        self.hint.set(message)

    def press(self, event: Any) -> str:
        """Every key goes here; "break" keeps Tab, Alt and F10 from reaching the window's own bindings."""
        self.supers.press(event.keysym)
        mods = held_modifiers(event.state, win=self.supers.down)
        if event.keysym == "Escape" and not mods:
            self.top.destroy()
            return "break"
        if event.keysym in ("Return", "KP_Enter") and self.chosen and not mods:
            self.accept()
            return "break"
        spec = hotkey_from_event(event.keysym, event.state, win=self.supers.down, keycode=event.keycode)
        if spec is not None:
            self.live.set(hotkey_label(spec))
            problem = hotkey_problem(spec)
            self._offer(None if problem else spec, problem or "Kliknij OK albo naciśnij Enter.")
        elif event.keysym in _MODIFIER_OF_KEYSYM or event.keysym in _OTHER_MODIFIER_KEYSYMS:
            self.live.set(pressed_label(event.keysym, event.state, win=self.supers.down))
            self._offer(None, self.HINT)
        elif mods:
            self._offer(None, "Ten klawisz nie zadziała. Użyj litery, cyfry albo F1-F24.")
        else:
            self._offer(None, "Dodaj Ctrl, Alt, Shift albo Win, inaczej skrót działałby przy zwykłym pisaniu.")
        return "break"

    def release(self, event: Any) -> None:
        self.supers.release(event.keysym)
        if not self.chosen and event.keysym in _MODIFIER_OF_KEYSYM:
            self.live.set(pressed_label(event.keysym, event.state, win=self.supers.down, release=True))
