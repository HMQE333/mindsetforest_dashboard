"""Configuration: ``config.json`` next to the exe or in ``%APPDATA%\\MindsetForest``.

Only plain values live here. The device id is persisted by ``store.Store``
(SQLite ``kv`` table) because the database is always writable, while a
``config.json`` next to the exe may sit in a read-only folder.
"""
from __future__ import annotations

import json
import logging
import os
import socket
import sys
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path

log = logging.getLogger(__name__)

APP_DIR_NAME = "MindsetForest"
CONFIG_FILE_NAME = "config.json"
DEFAULT_DASHBOARD_URL = "https://hmqe333.github.io/mindsetforest_dashboard/"
# The placeholder the zip version shipped with; nobody owns that domain, so it means "not set".
LEGACY_DASHBOARD_URLS = frozenset({"https://mindsetforest.app", "https://mindsetforest.app/"})
FOLDERID_DOCUMENTS = "{FDD39AD0-238F-46AF-ADB4-6C85480369C7}"
FOLDERID_VIDEOS = "{18989B1D-99B5-455B-841C-AB7C74E4DDFC}"


def _known_folder(guid: str) -> Path | None:
    """``SHGetKnownFolderPath`` for ``guid``; None off Windows or on any failure.

    Documents may be redirected to OneDrive or moved by the user, so
    ``~/Documents`` is only a guess; the shell knows the real folder.
    """
    if sys.platform != "win32":
        return None
    try:  # pragma: no cover - Windows only
        import ctypes
        import uuid
        from ctypes import wintypes

        class GUID(ctypes.Structure):
            _fields_ = [("Data1", wintypes.DWORD), ("Data2", wintypes.WORD), ("Data3", wintypes.WORD),
                        ("Data4", ctypes.c_ubyte * 8)]

        folder_id = GUID.from_buffer_copy(uuid.UUID(guid).bytes_le)
        out = ctypes.c_wchar_p()
        shell32 = ctypes.WinDLL("shell32")  # own instance: argtypes stay local to this call
        fn = shell32.SHGetKnownFolderPath
        fn.argtypes = [ctypes.POINTER(GUID), wintypes.DWORD, wintypes.HANDLE, ctypes.POINTER(ctypes.c_wchar_p)]
        fn.restype = ctypes.c_long
        hr = fn(ctypes.byref(folder_id), 0, None, ctypes.byref(out))
        try:
            return Path(out.value) if hr == 0 and out.value else None
        finally:
            ctypes.WinDLL("ole32").CoTaskMemFree(out)  # freed whether or not the call succeeded
    except Exception:  # pragma: no cover
        log.debug("SHGetKnownFolderPath(%s) failed", guid, exc_info=True)
        return None


def documents_dir() -> Path:
    """The user's Documents folder, following OneDrive or a moved folder on Windows."""
    return _known_folder(FOLDERID_DOCUMENTS) or Path.home() / "Documents"


def videos_dir() -> Path:
    """The user's Videos folder (Bandicam 6.1+ records there when Documents is on OneDrive)."""
    return _known_folder(FOLDERID_VIDEOS) or Path.home() / "Videos"


def legacy_or_known(name: str) -> Path:
    """``~/Documents/<name>`` when that folder exists, else ``<name>`` in the real Documents folder.

    The zip version always used ~/Documents. With Documents on OneDrive the
    known folder is elsewhere, and following it would move an existing vault
    away from its notes (and the mirror would then empty the dashboard).
    """
    try:
        legacy = Path.home() / "Documents" / name
        if legacy.is_dir():
            return legacy
    except (OSError, RuntimeError):
        pass
    return documents_dir() / name


@dataclass
class Config:
    """User-editable settings. Unknown keys in the file are ignored."""

    supabase_url: str = ""
    supabase_anon_key: str = ""
    dashboard_url: str = DEFAULT_DASHBOARD_URL
    idle_minutes: float = 3.0
    tick_seconds: float = 1.0
    sync_seconds: float = 60.0
    device_name: str = field(default_factory=socket.gethostname)
    ignored_apps: list[str] = field(default_factory=list)
    # Never-record keywords on top of the built-in adult list. The dashboard's
    # list (Stats -> Computer -> Private) is pulled at every sync and added to it.
    private_keywords: list[str] = field(default_factory=list)
    min_session_seconds: int = 2
    # Global hotkey that saves the selected text to the Archive ("" turns it off).
    capture_hotkey: str = "alt+shift+s"
    # Set by the setup window: the tracker pushes capture_hotkey to the dashboard once and
    # clears it (the dashboard's value wins at every sync, so a new choice must reach it).
    capture_hotkey_push: bool = False
    # Knowledge OS: MP3s in this folder are transcribed and written to the Obsidian vault, and
    # the vault's Knowledge/ and Sessions/ notes are copied to the dashboard. Empty
    # recordings_dir turns transcription off. Change vault_dir any time; new notes go there.
    recordings_dir: str = field(default_factory=lambda: str(legacy_or_known("Bandicam")))
    vault_dir: str = field(default_factory=lambda: str(legacy_or_known("MindsetForest Vault")))
    # Recordings last written before this time (epoch seconds) are left alone; 0 = no cutoff.
    # Set by the setup when a folder full of old recordings should not all be transcribed.
    recordings_since: float = 0.0
    # Recordings starting within this many minutes of the previous one's end are one session.
    session_gap_minutes: float = 20.0
    path: Path | None = field(default=None, compare=False)

    def is_ignored(self, app_name: str) -> bool:
        """True when ``app_name`` (display name) is on the don't-track list."""
        wanted = app_name.strip().lower()
        return any(a.strip().lower() == wanted for a in self.ignored_apps)


def app_data_dir() -> Path:
    """Folder for the database, log, lock and saved session.

    ``%APPDATA%\\MindsetForest`` on Windows, ``~/.mindsetforest`` elsewhere.
    ``MINDSETFOREST_HOME`` overrides both (used by tests and dev runs).
    """
    override = os.environ.get("MINDSETFOREST_HOME")
    if override:
        base = Path(override)
    elif sys.platform == "win32" and os.environ.get("APPDATA"):
        base = Path(os.environ["APPDATA"]) / APP_DIR_NAME
    else:
        base = Path.home() / ".mindsetforest"
    base.mkdir(parents=True, exist_ok=True)
    return base


def exe_dir() -> Path:
    """Folder of the running exe (PyInstaller) or of the ``tracker/`` checkout."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def config_search_paths() -> list[Path]:
    """Where ``config.json`` is looked for, in priority order."""
    return [exe_dir() / CONFIG_FILE_NAME, app_data_dir() / CONFIG_FILE_NAME]


def load_config(path: Path | None = None) -> Config:
    """Load the first config file found (or ``path``); missing file gives defaults."""
    candidates = [path] if path else config_search_paths()
    chosen = next((p for p in candidates if p.is_file()), candidates[-1])
    raw: dict = {}
    if chosen.is_file():
        try:
            raw = json.loads(chosen.read_text(encoding="utf-8-sig"))  # PowerShell writes a BOM
        except (OSError, ValueError) as exc:
            log.error("Could not read %s: %s (using defaults)", chosen, exc)
    known = {f.name for f in fields(Config)} - {"path"}
    values = {k: v for k, v in raw.items() if k in known}
    cfg = Config(**values, path=chosen)
    if not cfg.device_name:
        cfg.device_name = socket.gethostname()
    cfg.idle_minutes = max(0.5, float(cfg.idle_minutes))
    cfg.tick_seconds = min(10.0, max(0.2, float(cfg.tick_seconds)))
    cfg.sync_seconds = max(10.0, float(cfg.sync_seconds))
    cfg.min_session_seconds = max(0, int(cfg.min_session_seconds))
    cfg.ignored_apps = [str(a) for a in (cfg.ignored_apps or [])]
    cfg.private_keywords = [str(k) for k in (cfg.private_keywords or [])]
    cfg.supabase_url = cfg.supabase_url.rstrip("/")
    cfg.capture_hotkey = str(cfg.capture_hotkey or "").strip().lower()
    cfg.capture_hotkey_push = str(cfg.capture_hotkey_push).strip().lower() in ("true", "1")
    cfg.recordings_dir = os.path.expandvars(os.path.expanduser(str(cfg.recordings_dir or "").strip()))
    cfg.vault_dir = os.path.expandvars(os.path.expanduser(str(cfg.vault_dir or "").strip()))
    cfg.session_gap_minutes = max(1.0, float(cfg.session_gap_minutes))
    try:
        cfg.recordings_since = max(0.0, float(cfg.recordings_since or 0))
    except (TypeError, ValueError):
        cfg.recordings_since = 0.0
    return cfg


def save_config(cfg: Config) -> None:
    """Write ``cfg`` back to the file it was loaded from (creating it if needed)."""
    target = cfg.path or app_data_dir() / CONFIG_FILE_NAME
    data = asdict(cfg)
    data.pop("path", None)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    cfg.path = target
