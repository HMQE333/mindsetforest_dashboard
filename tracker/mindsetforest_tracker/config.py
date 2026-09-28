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
DEFAULT_DASHBOARD_URL = "https://mindsetforest.app"


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
    min_session_seconds: int = 2
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
            raw = json.loads(chosen.read_text(encoding="utf-8"))
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
    cfg.supabase_url = cfg.supabase_url.rstrip("/")
    return cfg


def save_config(cfg: Config) -> None:
    """Write ``cfg`` back to the file it was loaded from (creating it if needed)."""
    target = cfg.path or app_data_dir() / CONFIG_FILE_NAME
    data = asdict(cfg)
    data.pop("path", None)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    cfg.path = target
