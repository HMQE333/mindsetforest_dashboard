"""Install, upgrade and uninstall the tracker for one Windows user, without admin rights.

One exe is both the setup and the tracker. The setup window (``setup_gui``),
``--install --silent``, ``--uninstall`` and CI's ``--self-test`` all land here.
The program goes to ``%LOCALAPPDATA%\\Programs\\MindsetForest``; the settings go
to the data dir (``config.app_data_dir()``), where an upgrade rewrites only
``config.json``, so the device id, the login and the transcription state survive.

Every Windows side effect (registry, shortcuts, processes) goes through
``WinOps``, so the logic runs and is tested on Linux with a fake. Nothing here
touches the saved session: Supabase rotates refresh tokens, and a second
process refreshing it would sign the running tracker out.
"""
from __future__ import annotations

import copy
import json
import logging
import ntpath
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager, suppress
from dataclasses import dataclass, field
from pathlib import Path, PurePath
from typing import Any

import psutil
import requests

from . import __version__
from .archive_capture import parse_hotkey
from .config import (
    CONFIG_FILE_NAME, DEFAULT_DASHBOARD_URL, LEGACY_DASHBOARD_URLS, Config, _known_folder, documents_dir,
    legacy_or_known, load_config, save_config, videos_dir,
)
from .recordings import ensure_system_notes

log = logging.getLogger(__name__)

APP_DIR_NAME = "MindsetForest"            # under %LOCALAPPDATA%\Programs
EXE_NAME = "MindsetForestTracker.exe"
RUN_VALUE = "MindsetForest Tracker"       # HKCU\Software\Microsoft\Windows\CurrentVersion\Run value name
UNINSTALL_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\MindsetForestTracker"
LEGACY_STARTUP_LNK = "MindsetForest Tracker.lnk"
START_MENU_LNK = "MindsetForest.lnk"
DEFAULT_SITE = DEFAULT_DASHBOARD_URL
QUIT_REQUEST = "quit.request"             # file in data dir; the tracker quits gracefully when it appears
# A sign-in made in the setup window is saved to pending_session_path(), not over session.bin: a tracker
# still running could save its own rotated token over it. install() moves it into place once the tracker
# has stopped. One file per window, so two open windows never adopt each other's login.
PENDING_SESSION = "session.new.bin"       # the name used before it was per window; still cleaned up
SESSION_FILE = "session.bin"
# Left in the data dir by the tracker when the server refused its login (main.NEEDS_LOGIN_FILE): the
# settings window never refreshes the session itself, so this is how it learns the login is gone.
NEEDS_LOGIN = "needs_login"
AUTOSTART_ARG = "--autostart"             # in the Run value: a logon start, told apart from a Start menu click
ROUTINE_TASK = "Open my Obsidian vault at {vault}. Read _SYSTEM/routine-prompt.md and do exactly what it says."

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
# Task Manager's Startup tab stores "disabled" here; it would silently override the choice made in setup.
STARTUP_APPROVED_KEY = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
BANDICAM_KEY = r"Software\BANDISOFT\BANDICAM\OPTION"
BANDICAM_VALUE = "sOutputFolder"
FOLDERID_STARTUP = "{B97D20BB-F46A-4C97-BA10-5E3608430854}"
FOLDERID_PROGRAMS = "{A77F5D77-2E2B-44C3-A6A2-ABA601054A51}"
LOCK_FILE = "tracker.lock"

_DETACHED_PROCESS = 0x00000008
_CREATE_NEW_PROCESS_GROUP = 0x00000200
_CREATE_NO_WINDOW = 0x08000000
_COPY_ATTEMPTS = 5
_retry_sleep = time.sleep  # tests replace it
_PENDING_MAX_AGE = 24 * 3600              # a window's unused sign-in older than this is dropped
_SUPABASE_URL = re.compile(r"https://[a-z0-9-]+\.supabase\.co/?")


class SetupError(Exception):
    """A problem the user can act on; the message is shown as is (Polish)."""


# -- Windows side effects --------------------------------------------------------


class WinOps:
    """Thin wrapper over winreg, WScript.Shell, the known folders and subprocess.

    Off Windows the writers (``set_run``, ``write_uninstall_entry``,
    ``delete_later``) do nothing, the readers return None and the rest raise
    NotImplementedError. Tests pass a fake with the same methods.
    """

    def set_run(self, name: str, command: str | None) -> None:
        """Per-user autostart (HKCU Run value ``name``); None deletes it."""
        if sys.platform != "win32":
            return
        import winreg  # pragma: no cover - Windows only

        with suppress(OSError):  # pragma: no cover - best effort; the Run value is what matters
            _delete_value(STARTUP_APPROVED_KEY, name)
        if command is None:  # pragma: no cover
            _delete_value(RUN_KEY, name)
            return
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:  # pragma: no cover
            winreg.SetValueEx(key, name, 0, winreg.REG_SZ, command)

    def get_run(self, name: str) -> str | None:
        if sys.platform != "win32":
            return None
        found = _read_value(RUN_KEY, name)  # pragma: no cover - Windows only
        return found[0] if found and isinstance(found[0], str) else None  # pragma: no cover

    def write_uninstall_entry(self, values: dict[str, str | int] | None) -> None:
        """The "Apps & features" entry (HKCU, so no admin); None deletes it."""
        if sys.platform != "win32":
            return
        import winreg  # pragma: no cover - Windows only

        if values is None:  # pragma: no cover
            with suppress(FileNotFoundError):
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY)
            return
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY, 0, winreg.KEY_SET_VALUE) as key:  # pragma: no cover
            for name, value in values.items():
                if isinstance(value, int):
                    winreg.SetValueEx(key, name, 0, winreg.REG_DWORD, int(value))
                else:
                    winreg.SetValueEx(key, name, 0, winreg.REG_SZ, str(value))

    def create_shortcut(self, lnk: Path, target: Path, args: str = "", workdir: Path | None = None,
                        description: str = "") -> None:
        if sys.platform != "win32":
            raise NotImplementedError("shortcuts exist only on Windows")
        lnk.parent.mkdir(parents=True, exist_ok=True)  # pragma: no cover - Windows only
        with _com():  # pragma: no cover
            _save_shortcut(lnk, target, args, workdir or target.parent, description)

    def shortcut_target(self, lnk: Path) -> tuple[str, str, str] | None:
        """(target, arguments, working dir) of an existing .lnk, else None."""
        if sys.platform != "win32" or not lnk.is_file():
            return None
        with _com():  # pragma: no cover - Windows only
            return _read_shortcut(lnk)

    def startup_dir(self) -> Path:
        """shell:startup, where the old zip version put its autostart shortcut."""
        if sys.platform != "win32":
            raise NotImplementedError("the Startup folder exists only on Windows")
        return _known_folder(FOLDERID_STARTUP) or _start_menu_programs() / "Startup"  # pragma: no cover

    def programs_dir(self) -> Path:
        """The user's Start menu Programs folder."""
        if sys.platform != "win32":
            raise NotImplementedError("the Start menu exists only on Windows")
        return _known_folder(FOLDERID_PROGRAMS) or _start_menu_programs()  # pragma: no cover

    def read_bandicam_output(self) -> str | None:
        """Bandicam's output folder as stored (absent until the user changes it once)."""
        if sys.platform != "win32":
            return None
        found = _read_value(BANDICAM_KEY, BANDICAM_VALUE)  # pragma: no cover - Windows only
        return found[0] if found and isinstance(found[0], str) else None  # pragma: no cover

    def launch_detached(self, argv: list[str], cwd: Path | None = None) -> None:
        """Start ``argv`` so it outlives this process and owns no console."""
        if sys.platform != "win32":
            raise NotImplementedError("starting the tracker is Windows only")
        subprocess.Popen(  # pragma: no cover - Windows only
            argv, cwd=str(cwd) if cwd else None, env=_child_env(), close_fds=True,
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=_DETACHED_PROCESS | _CREATE_NEW_PROCESS_GROUP,
        )

    def delete_later(self, paths: list[Path]) -> None:
        """Delete ``paths`` once this process and its onefile bootloader have exited.

        A running exe cannot delete itself, and the uninstaller may sit behind a
        message box for minutes, so a fixed delay is not enough: the hidden
        cleanup waits for both processes (at most 10 minutes), then retries.
        """
        if sys.platform != "win32":
            return
        argv, extra = cleanup_command(paths, sorted(_own_pids()))  # pragma: no cover - Windows only
        subprocess.Popen(  # pragma: no cover
            argv, cwd=tempfile.gettempdir(), env=_child_env(extra), close_fds=True,
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=_CREATE_NO_WINDOW | _CREATE_NEW_PROCESS_GROUP,
        )


# Waits for MF_WAIT_PIDS, then deletes MF_DELETE_0..MF_DELETE_<COUNT-1> for up to a minute (a virus
# scanner may hold the exe a moment longer). Single quotes only: the script is one argv item, so
# no shell ever parses it, and no path is ever part of it.
CLEANUP_SCRIPT = (
    "$ErrorActionPreference = 'SilentlyContinue'; "
    "$ids = @($env:MF_WAIT_PIDS -split ',' | Where-Object { $_ } | ForEach-Object { [int]$_ }); "
    "if ($ids.Count) { Wait-Process -Id $ids -Timeout 600 }; "
    "$paths = @(); "
    "for ($i = 0; $i -lt [int]$env:MF_DELETE_COUNT; $i++) { "
    "$paths += [Environment]::GetEnvironmentVariable('MF_DELETE_' + $i) }; "
    "for ($try = 0; $try -lt 30; $try++) { "
    "$left = @($paths | Where-Object { $_ -and (Test-Path -LiteralPath $_) }); "
    "if (-not $left.Count) { break }; "
    "foreach ($p in $left) { Remove-Item -LiteralPath $p -Recurse -Force }; "
    "Start-Sleep -Seconds 2 }"
)


def cleanup_command(paths: list[Path], wait_pids: list[int],
                    powershell: str | None = None) -> tuple[list[str], dict[str, str]]:
    """The argv for ``WinOps.delete_later`` plus the environment variables its script reads.

    The paths and pids travel in environment variables, so no folder name
    (spaces, quotes, &, %, $) is ever parsed by a shell. A folder is removed
    with everything in it, so callers never pass one that holds the vault.
    """
    env: dict[str, str] = {"MF_WAIT_PIDS": ",".join(str(p) for p in wait_pids),
                           "MF_DELETE_COUNT": str(len(paths))}
    for i, p in enumerate(paths):
        env[f"MF_DELETE_{i}"] = str(p)
    if powershell is None:
        system = os.environ.get("SystemRoot") or r"C:\Windows"
        found = ntpath.join(system, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
        powershell = found if os.path.isfile(found) else "powershell.exe"
    return [powershell, "-NoProfile", "-NonInteractive", "-Command", CLEANUP_SCRIPT], env


def _own_pids() -> set[int]:
    # Imported on call, like _pid_is_tracker: main imports this module.
    from .main import own_pids

    return own_pids()


def schedule_cleanup(ops: WinOps, paths: list[Path]) -> bool:
    """Hand ``paths`` to the cleanup that runs after this process exits; call it as the very last step.

    After any final dialog: the cleanup waits for this process, so it never
    races a message box the user is still reading. False when it could not start.
    """
    if not paths:
        return False
    try:
        ops.delete_later(list(paths))
    except Exception:
        log.warning("Scheduling the deletion of %s failed", ", ".join(map(str, paths)), exc_info=True)
        return False
    log.info("Scheduled for deletion after exit: %s", ", ".join(map(str, paths)))
    return True


def _child_env(extra: dict[str, str] | None = None) -> dict[str, str]:
    """This process's environment without PyInstaller's bootstrap variables.

    A onefile exe started from another one would otherwise reuse the parent's
    unpack folder, which is deleted when the parent exits.
    """
    env = {k: v for k, v in os.environ.items() if not (k.startswith("_PYI_") or k == "_MEIPASS2")}
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        for name in ("TCL_LIBRARY", "TK_LIBRARY"):
            if env.get(name, "").startswith(meipass):
                env.pop(name)
    env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    env.update(extra or {})
    return env


def _read_value(subkey: str, name: str) -> tuple[Any, int] | None:  # pragma: no cover - Windows only
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, subkey) as key:
            return winreg.QueryValueEx(key, name)
    except OSError:
        return None


def _delete_value(subkey: str, name: str) -> None:  # pragma: no cover - Windows only
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, subkey, 0, winreg.KEY_SET_VALUE) as key:
            winreg.DeleteValue(key, name)
    except FileNotFoundError:
        pass


@contextmanager
def _com() -> Iterator[None]:  # pragma: no cover - Windows only
    """COM for the calling thread: the setup window runs install() in a worker thread."""
    import pythoncom

    try:
        pythoncom.CoInitialize()
        initialised = True
    except pythoncom.com_error:  # already initialised in another mode: usable as is
        initialised = False
    try:
        yield
    finally:
        if initialised:
            pythoncom.CoUninitialize()


def _save_shortcut(lnk: Path, target: Path, args: str, workdir: Path,
                   description: str) -> None:  # pragma: no cover - Windows only
    # Its own function so the COM objects are released before CoUninitialize.
    import win32com.client

    shortcut = win32com.client.Dispatch("WScript.Shell").CreateShortcut(str(lnk))
    shortcut.TargetPath = str(target)
    shortcut.Arguments = args
    shortcut.WorkingDirectory = str(workdir)
    shortcut.Description = description
    shortcut.IconLocation = f"{target},0"
    shortcut.Save()


def _read_shortcut(lnk: Path) -> tuple[str, str, str]:  # pragma: no cover - Windows only
    import win32com.client

    shortcut = win32com.client.Dispatch("WScript.Shell").CreateShortcut(str(lnk))
    return str(shortcut.TargetPath or ""), str(shortcut.Arguments or ""), str(shortcut.WorkingDirectory or "")


# -- folders ----------------------------------------------------------------------


def _local_appdata() -> Path:
    value = os.environ.get("LOCALAPPDATA")
    return Path(value) if value else Path.home() / "AppData" / "Local"


def _roaming_appdata() -> Path:
    value = os.environ.get("APPDATA")
    return Path(value) if value else Path.home() / "AppData" / "Roaming"


def _start_menu_programs() -> Path:
    return _roaming_appdata() / "Microsoft" / "Windows" / "Start Menu" / "Programs"


def install_dir() -> Path:
    """Per-user program folder: no admin rights, and Windows' own place for that."""
    return _local_appdata() / "Programs" / APP_DIR_NAME


def installed_exe() -> Path:
    return install_dir() / EXE_NAME


def default_vault_dir() -> Path:
    """The zip version's ~/Documents vault when it exists, else one in the real Documents folder."""
    return legacy_or_known("MindsetForest Vault")


def _path_key(path: Path | str) -> str:
    """Comparable form of a path: absolute, links resolved, case folded on Windows."""
    p = Path(path)
    try:
        p = p.expanduser().resolve()
    except (OSError, RuntimeError):
        p = Path(os.path.abspath(p))
    return os.path.normcase(str(p))


def _same_path(a: Path | str, b: Path | str) -> bool:
    return _path_key(a) == _path_key(b)


def _inside(path: Path | str, folder: Path | str) -> bool:
    """True when ``path`` is ``folder`` or anywhere under it."""
    return PurePath(_path_key(path)).is_relative_to(PurePath(_path_key(folder)))


def _user_path(text: str) -> Path:
    """A folder typed or picked by the user, with ~ and %VARS% expanded like config.load_config does."""
    return Path(os.path.expandvars(os.path.expanduser(text.strip())))


def detect_bandicam_dir(ops: WinOps) -> tuple[Path, str]:
    """Bandicam's recordings folder and how it was found.

    Bandicam's own setting first ("bandicam"); it is absent until the user
    changes the folder once. Then the defaults that exist: Documents\\Bandicam
    ("documents"), Videos\\Bandicam ("videos": Bandicam 6.1+ when Documents is
    on OneDrive). Nothing found: Documents\\Bandicam ("default").
    """
    try:
        raw = ops.read_bandicam_output()
    except Exception:
        log.debug("Reading Bandicam's output folder failed", exc_info=True)
        raw = None
    text = (raw or "").strip().strip('"').strip()
    if text:
        return Path(ntpath.expandvars(text)), "bandicam"
    documents = documents_dir() / "Bandicam"
    if documents.is_dir():
        return documents, "documents"
    videos = videos_dir() / "Bandicam"
    if videos.is_dir():
        return videos, "videos"
    return documents, "default"


# -- Obsidian ---------------------------------------------------------------------


@dataclass(frozen=True)
class ObsidianVault:
    path: Path
    id: str          # obsidian.json key (16 hex chars); use it in obsidian://open?vault=<id>
    ts: int          # last opened, ms since epoch


def obsidian_vaults(appdata: Path | None = None) -> list[ObsidianVault]:
    """Vaults Obsidian knows, most recently opened first; [] on any problem.

    Read only: obsidian.json is Obsidian's own file and it rewrites it while
    running, so a half-written file is retried a few times and never written.
    """
    path = (appdata or _roaming_appdata()) / "obsidian" / "obsidian.json"
    data: Any = None
    for attempt in range(3):
        try:
            data = json.loads(path.read_text(encoding="utf-8-sig"))
            break
        except json.JSONDecodeError:
            if attempt == 2:
                return []
            _retry_sleep(0.2)
        except (OSError, UnicodeDecodeError):
            return []
    vaults = data.get("vaults") if isinstance(data, dict) else None
    if not isinstance(vaults, dict):
        return []
    found: list[ObsidianVault] = []
    for vault_id, info in vaults.items():
        raw = info.get("path") if isinstance(info, dict) else None
        if not isinstance(raw, str) or not raw.strip():
            continue
        folder = Path(raw)
        try:
            if not folder.is_dir():
                continue
        except OSError:
            continue
        stamp = info.get("ts")
        ts = int(stamp) if isinstance(stamp, (int, float)) and not isinstance(stamp, bool) else 0
        found.append(ObsidianVault(folder, str(vault_id), ts))
    found.sort(key=lambda v: v.ts, reverse=True)
    return found


def obsidian_installed(appdata: Path | None = None) -> bool:
    """Obsidian has run at least once for this user (it keeps its settings there)."""
    return ((appdata or _roaming_appdata()) / "obsidian").is_dir()


def vault_registered(vault: Path, vaults: list[ObsidianVault]) -> ObsidianVault | None:
    """The known vault that is exactly ``vault``: only those open with obsidian://open?vault=."""
    key = _path_key(vault)
    return next((v for v in vaults if _path_key(v.path) == key), None)


# -- dashboard settings -----------------------------------------------------------


def site_for(url: str | None) -> str:
    """The dashboard to use for ``url``: the real one when it is empty or the old placeholder.

    The zip version's default was https://mindsetforest.app, a domain nobody
    owns; settings (and so a password) must never be fetched from it.
    """
    text = (url or "").strip()
    placeholders = {u.rstrip("/").lower() for u in LEGACY_DASHBOARD_URLS}
    if not text or text.rstrip("/").lower() in placeholders:
        return DEFAULT_SITE
    return text.rstrip("/") + "/"


def fetch_site_config(site: str, http: Any = requests, timeout: float = 10) -> dict:
    """Supabase URL and public key published by the dashboard build.

    They are public (the site's JS has them) but not in the repo, so the exe
    fetches them instead of carrying them. Only over https and only a
    ``*.supabase.co`` project: the password typed next goes to that address.
    """
    base = (site or "").strip().rstrip("/")
    if not base:
        raise SetupError("Podaj adres dashboardu.")
    if not base.lower().startswith("https://"):
        raise SetupError(f"Adres dashboardu musi zaczynać się od https:// ({base}).")
    base += "/"
    url = base + "downloads/tracker-config.json"
    hint = "Wpisz Supabase URL i klucz publiczny w sekcji Zaawansowane."
    try:
        resp = http.get(url, timeout=timeout)
    except Exception as exc:
        raise SetupError(f"Nie udało się pobrać ustawień z {base} ({exc}). Sprawdź internet. {hint}") from exc
    if resp.status_code != 200:
        raise SetupError(f"Dashboard nie udostępnia ustawień trackera (HTTP {resp.status_code}: {url}). {hint}")
    try:
        data = resp.json()
    except ValueError as exc:
        raise SetupError(f"Ustawienia z dashboardu są nieczytelne ({url}). {hint}") from exc
    supabase_url = data.get("supabase_url") if isinstance(data, dict) else None
    key = data.get("supabase_anon_key") if isinstance(data, dict) else None
    if not (isinstance(supabase_url, str) and isinstance(key, str) and key.strip()):
        raise SetupError(f"Ustawienia z dashboardu są niepełne ({url}). {hint}")
    if not _SUPABASE_URL.fullmatch(supabase_url.strip().lower()):
        raise SetupError(f"Dashboard {base} podaje nieoczekiwany adres Supabase ({supabase_url.strip()}). {hint}")
    return {"supabase_url": supabase_url.strip().rstrip("/"), "supabase_anon_key": key.strip(),
            "dashboard_url": base}


# -- configuration ----------------------------------------------------------------


def find_legacy_install(ops: WinOps) -> Path | None:
    """Folder of the old zip install, found through its Startup-folder shortcut.

    The zip version autostarts ``pythonw run_tracker.py`` (or its own built
    exe) from that folder, and its config.json lives there.
    """
    try:
        lnk = ops.startup_dir() / LEGACY_STARTUP_LNK
        if not lnk.is_file():
            return None
        found = ops.shortcut_target(lnk)
    except Exception:
        log.debug("Looking for the old Startup shortcut failed", exc_info=True)
        return None
    if not found:
        return None
    target, _args, workdir = found
    folder = Path(workdir) if workdir else Path(target).parent if target else None
    if folder is not None and (folder / "run_tracker.py").is_file():
        return folder
    exe = Path(target) if target else None
    if exe is not None and exe.name.lower() == EXE_NAME.lower() and exe.is_file() \
            and not _same_path(exe, installed_exe()):
        return exe.parent  # the old one-folder build; its config.json sits next to it
    return None


def _existing_config_file(data_dir: Path, legacy_dir: Path | None) -> Path | None:
    """Which config.json the running tracker really uses.

    The zip tracker read its own folder's file first and %APPDATA%'s only as a
    fallback, and saved "Don't track" back to it, so while the zip install is
    live its file wins. Once this version is installed (its exe exists) the data
    dir's file is the live one, even if the old Startup shortcut came back.
    """
    data = data_dir / CONFIG_FILE_NAME
    legacy = legacy_dir / CONFIG_FILE_NAME if legacy_dir else None
    if legacy is not None and legacy.is_file() and not (data.is_file() and installed_exe().is_file()):
        return legacy
    if data.is_file():
        return data
    return None


def load_existing_config(data_dir: Path, legacy_dir: Path | None, ops: WinOps | None = None) -> Config | None:
    """The config an upgrade starts from (see ``_existing_config_file``), or None.

    Keys missing from the file are resolved the way the zip tracker did, not
    from today's defaults: its config.json never had the folders, and it used
    ~/Documents even when Documents lives on OneDrive. A vault that silently
    moved would leave the notes behind and empty the dashboard's mirror.
    """
    path = _existing_config_file(data_dir, legacy_dir)
    if path is None:
        return None
    cfg = load_config(path)
    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    if "vault_dir" not in raw:
        cfg.vault_dir = str(legacy_or_known("MindsetForest Vault"))
    if "recordings_dir" not in raw:
        documents = Path.home() / "Documents" / "Bandicam"
        if documents.is_dir():
            cfg.recordings_dir = str(documents)
        elif ops is not None:
            cfg.recordings_dir = str(detect_bandicam_dir(ops)[0])
        else:
            cfg.recordings_dir = str(legacy_or_known("Bandicam"))
    cfg.dashboard_url = site_for(raw.get("dashboard_url") if isinstance(raw.get("dashboard_url"), str) else "")
    return cfg


@dataclass
class SetupChoices:
    supabase_url: str
    supabase_anon_key: str
    dashboard_url: str
    recordings_dir: str          # "" = transcription off
    vault_dir: str
    capture_hotkey: str          # "" = off
    autostart: bool = True
    device_name: str = ""        # "" keeps existing / hostname
    # The user picked the hotkey here (window: changed it; silent: --hotkey), so it goes to the dashboard.
    push_hotkey: bool = False
    # A newly chosen recordings folder: also transcribe the MP3s already in it (else only newer ones).
    include_existing: bool = True


def _same_folder_text(a: str, b: str) -> bool:
    if not a.strip() or not b.strip():
        return a.strip() == b.strip()
    return _same_path(_user_path(a), _user_path(b))


def merged_config(existing: Config | None, choices: SetupChoices, data_dir: Path) -> Config:
    """``existing`` with the setup choices applied; everything setup does not ask about is kept.

    The dashboard's hotkey wins at every sync, so a hotkey the user picked here
    is flagged for pushing. Only then: an untouched form (a fresh install on a
    second PC) must not overwrite the hotkey the account already has.
    """
    cfg = copy.deepcopy(existing) if existing is not None else Config()
    cfg.supabase_url = choices.supabase_url.strip().rstrip("/") or cfg.supabase_url
    cfg.supabase_anon_key = choices.supabase_anon_key.strip() or cfg.supabase_anon_key
    cfg.dashboard_url = site_for(choices.dashboard_url.strip() or cfg.dashboard_url)
    recordings = choices.recordings_dir.strip()
    if recordings and (existing is None or not _same_folder_text(recordings, existing.recordings_dir or "")):
        cfg.recordings_since = 0.0 if choices.include_existing else time.time()
    cfg.recordings_dir = recordings
    cfg.vault_dir = choices.vault_dir.strip()
    cfg.capture_hotkey_push = bool(choices.push_hotkey or (existing.capture_hotkey_push if existing else False))
    cfg.capture_hotkey = choices.capture_hotkey.strip().lower()
    if choices.device_name.strip():
        cfg.device_name = choices.device_name.strip()
    cfg.path = data_dir / CONFIG_FILE_NAME
    return cfg


# -- stopping the running tracker -------------------------------------------------


def _pid_is_tracker(pid: int) -> bool:
    # Imported on call: main imports this module, and main pulls in the tray.
    from .main import pid_is_tracker

    return pid_is_tracker(pid)


def _alive(proc: psutil.Process) -> bool:
    """Running and not a zombie; ``is_running`` also notices a reused pid."""
    try:
        return proc.is_running() and proc.status() != psutil.STATUS_ZOMBIE
    except psutil.Error:
        return False


def _with_bootloader(proc: psutil.Process) -> list[psutil.Process]:
    """The tracker plus, for a onefile exe, the launcher process that keeps the exe file open."""
    family = [proc]
    with suppress(psutil.Error, OSError):
        parent = proc.parent()
        if parent is not None and parent.pid != os.getpid() and parent.exe() and parent.exe() == proc.exe():
            family.append(parent)
    return family


def _lock_pid(data_dir: Path) -> int | None:
    """The pid written in tracker.lock, or None."""
    try:
        pid = int((data_dir / LOCK_FILE).read_text().strip())
    except (OSError, ValueError):
        return None
    return pid if pid > 0 else None


def stop_running_tracker(data_dir: Path, timeout: float = 10.0, *, is_tracker: Callable[[int], bool] = _pid_is_tracker,
                         sleep: Callable[[float], None] = time.sleep,
                         clock: Callable[[], float] = time.monotonic,
                         self_pids: Callable[[], set[int]] = _own_pids) -> bool:
    """Ask the running tracker to quit, then make sure it did. True if one was running.

    The quit request lets it flush the open session and sync; terminate and
    kill are the fallback for an old version that does not know the request.
    A stale lock pid now used by this process or its own onefile bootloader is
    not a tracker: stopping it would kill the setup itself.
    """
    quit_file = data_dir / QUIT_REQUEST
    try:
        pid = _lock_pid(data_dir)
        if pid is None or pid in self_pids() or not is_tracker(pid):
            return False
        try:
            proc = psutil.Process(pid)
        except psutil.Error:
            return False
        family = _with_bootloader(proc)
        try:
            quit_file.write_text("quit\n", encoding="utf-8")
        except OSError as exc:
            log.warning("Could not write %s: %s", quit_file, exc)
        deadline = clock() + timeout
        while clock() < deadline and any(_alive(p) for p in family):
            sleep(0.2)
        if _alive(proc):
            log.warning("Tracker pid %d did not quit within %.1f s; terminating it", pid, timeout)
            _terminate(proc)
        deadline = clock() + 3
        while clock() < deadline and any(_alive(p) for p in family):
            sleep(0.2)
        log.info("Stopped the running tracker (pid %d)", pid)
        return True
    finally:
        with suppress(OSError):
            quit_file.unlink()


def _terminate(proc: psutil.Process) -> None:
    try:
        proc.terminate()
        proc.wait(timeout=3)
    except psutil.TimeoutExpired:
        with suppress(psutil.Error):
            proc.kill()
            proc.wait(timeout=3)
    except psutil.NoSuchProcess:
        pass
    except psutil.Error as exc:
        log.warning("Could not stop tracker pid %d: %s", proc.pid, exc)


# -- install / uninstall ----------------------------------------------------------


@dataclass
class InstallResult:
    exe: Path
    config_path: Path
    vault: Path
    started: bool
    legacy_removed: bool
    messages: list[str] = field(default_factory=list)  # Polish, one line each


def _dev_python() -> str:
    """pythonw next to python on Windows, so a dev tracker opens no console window."""
    exe = Path(sys.executable)
    if sys.platform == "win32" and exe.name.lower() == "python.exe" and (exe.parent / "pythonw.exe").is_file():
        return str(exe.parent / "pythonw.exe")
    return sys.executable


def _dev_script() -> Path:
    return Path(__file__).resolve().parent.parent / "run_tracker.py"


def _command_line(argv: list[str]) -> str:
    return " ".join(f'"{a}"' for a in argv)


def _validate(choices: SetupChoices) -> Path:
    if not choices.vault_dir.strip():
        raise SetupError("Wybierz folder vaulta Obsidian.")
    hotkey = choices.capture_hotkey.strip().lower()
    if hotkey:
        try:
            parse_hotkey(hotkey)
        except ValueError as exc:
            raise SetupError(f"Skrót {hotkey} jest nieprawidłowy: potrzebny Ctrl, Alt, Shift lub Win "
                             "i jedna litera, cyfra albo F1-F24 (np. alt+shift+s).") from exc
    return _user_path(choices.vault_dir)


def _copy_exe(source: Path, target: Path) -> None:
    """Copy the setup exe over the installed one, retrying while Windows still holds the old file.

    The bytes are streamed (no alternate data streams), so the download's
    "from the internet" mark does not follow the installed exe into autostart.
    A running exe cannot be overwritten but can be renamed, so the old file is
    moved aside when a plain replace is refused.
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    fresh = target.with_name(target.name + ".new")
    aside = target.with_name(target.name + ".old")
    try:
        with open(source, "rb") as src, open(fresh, "wb") as dst:
            shutil.copyfileobj(src, dst, 1024 * 1024)
    except OSError as exc:
        with suppress(OSError):
            fresh.unlink()
        raise SetupError(f"Nie mogę skopiować programu do {target.parent} ({exc}).") from exc
    error: OSError | None = None
    for attempt in range(_COPY_ATTEMPTS):
        try:
            os.replace(fresh, target)
            return
        except OSError as exc:
            error = exc
        try:
            with suppress(OSError):
                aside.unlink()
            os.replace(target, aside)
            os.replace(fresh, target)
            return
        except OSError as exc:
            error = exc
            if not target.exists() and aside.exists():
                with suppress(OSError):
                    os.replace(aside, target)
        if attempt < _COPY_ATTEMPTS - 1:
            _retry_sleep(1)
    with suppress(OSError):
        fresh.unlink()
    raise SetupError(f"Nie mogę podmienić pliku {target} ({error}). Zamknij okna MindsetForest "
                     "(także Ustawienia) i spróbuj ponownie.")


def _recordings_messages(recordings_dir: str) -> list[str]:
    """Create the recordings folder only when it is Bandicam's default (harmless), and say what applies."""
    if not recordings_dir:
        return ["Transkrypcja nagrań wyłączona."]
    folder = _user_path(recordings_dir)
    if not folder.exists() and _same_path(folder, documents_dir() / "Bandicam"):
        with suppress(OSError):
            folder.mkdir(parents=True, exist_ok=True)
    if folder.is_dir():
        return [f"Nowe nagrania MP3 z {folder} będą transkrybowane."]
    return [f"Folder nagrań {folder} jeszcze nie istnieje: tracker zacznie, gdy się pojawi."]


def _routine_messages(vault: Path) -> list[str]:
    return [
        # The same steps as setup_gui.ROUTINE_STEPS, README.md and TrackerDownload.tsx (Claude Desktop's labels).
        "Ostatni krok: ustaw rutynę Claude w Claude Desktop: Scheduled > New task > Set up manually, "
        f"częstotliwość Hourly, folder zadania {vault}, uruchamiana lokalnie na tym komputerze (nie w chmurze). "
        "Bez niej nagrania się transkrybują, ale notatki wiedzy nie powstaną.",
        "Polecenie rutyny: " + ROUTINE_TASK.format(vault=vault),
    ]


def pending_session_path(data_dir: Path, pid: int | None = None) -> Path:
    """Where the setup window process ``pid`` (default: this one) keeps a sign-in until install()."""
    return data_dir / f"session.new.{pid or os.getpid()}.bin"


def adopt_pending_session(data_dir: Path, pending: Path | None) -> bool:
    """Move the sign-in in ``pending`` into session.bin; call only with the tracker stopped.

    That new login answers the tracker's needs_login marker, so the marker goes too.
    """
    if pending is None or not pending.is_file():
        return False
    try:
        os.replace(pending, data_dir / SESSION_FILE)
    except OSError as exc:
        raise SetupError(f"Nie mogę zapisać logowania w {data_dir / SESSION_FILE} ({exc}).") from exc
    with suppress(OSError):
        (data_dir / NEEDS_LOGIN).unlink()
    return True


def _drop_stale_pending_sessions(data_dir: Path, now: float | None = None) -> None:
    """Sign-ins left by windows that closed without installing (or crashed), after a day."""
    cutoff = (time.time() if now is None else now) - _PENDING_MAX_AGE
    with suppress(OSError):
        for path in data_dir.glob("session.new*.bin"):
            with suppress(OSError):
                if path.stat().st_mtime < cutoff:
                    path.unlink()


def login_expired(data_dir: Path) -> bool:
    """The tracker found its saved login refused by the server (and nobody has signed in since)."""
    return (data_dir / NEEDS_LOGIN).is_file()


def autostart_enabled(ops: WinOps) -> bool:
    """The tracker starts with Windows: our Run value, or the zip version's Startup shortcut.

    A Run value that cannot be read raises (unless the shortcut answers anyway):
    "unknown" must not read as "off", or saving the settings would delete the
    Run value. The caller picks the fallback (the window ticks the box).
    """
    error: Exception | None = None
    try:
        if ops.get_run(RUN_VALUE) is not None:
            return True
    except Exception as exc:
        error = exc
    try:
        if (ops.startup_dir() / LEGACY_STARTUP_LNK).is_file():
            return True
    except Exception:
        log.debug("Could not look for the old Startup shortcut", exc_info=True)
    if error is not None:
        raise error
    return False


def replace_legacy_tracker(data_dir: Path, ops: WinOps) -> bool:
    """At logon the zip tracker (its Startup shortcut is back) won tracker.lock: retire it.

    The same migration install() does: the shortcut goes and the old tracker is
    stopped, so the installed exe can take the lock. False, with nothing done,
    when there is no such shortcut or the lock belongs to the installed exe.
    """
    try:
        lnk = ops.startup_dir() / LEGACY_STARTUP_LNK
        if not lnk.is_file():
            return False
    except Exception:
        return False
    pid = _lock_pid(data_dir)
    if pid is None:
        return False
    try:
        holder = psutil.Process(pid).exe()
    except (psutil.Error, OSError):
        holder = ""
    if holder and _same_path(holder, installed_exe()):
        return False
    try:
        lnk.unlink()
    except OSError:
        log.warning("Could not remove the old Startup shortcut %s", lnk, exc_info=True)
    log.info("The old zip tracker (pid %d, %s) started at logon; replacing it", pid, holder or "?")
    stop_running_tracker(data_dir)
    return True


def _prepare_vault(vault: Path) -> None:
    """Create the vault with its _SYSTEM notes and prove it is writable (a drive may be unplugged)."""
    try:
        vault.mkdir(parents=True, exist_ok=True)
        ensure_system_notes(vault)
        probe = vault / "_SYSTEM" / f".mindsetforest-write-test-{os.getpid()}"
        probe.write_bytes(b"")
        probe.unlink()
    except OSError as exc:
        raise SetupError(f"Nie mogę przygotować vaulta w {vault} ({exc}). Sprawdź, czy dysk jest podłączony, "
                         "albo wybierz inny folder.") from exc


def install(choices: SetupChoices, *, data_dir: Path, source_exe: Path | None, ops: WinOps,
            launch: bool = True, progress: Callable[[str], None] = lambda s: None,
            pending_session: Path | None = None) -> InstallResult:
    """Install or upgrade in place, then start the tracker.

    Safe to run again: a newer setup exe replaces the program, keeps every
    config field it does not ask about and leaves the data dir (login, device
    id, history) alone. ``source_exe`` None is a dev run from the sources:
    nothing is copied or registered, the tracker starts as ``run_tracker.py``.
    ``pending_session`` is the calling window's sign-in (``pending_session_path``).
    Only a bad choice, an unwritable vault, a failed copy or an unwritable config
    raise SetupError; the vault is checked before the tracker is stopped, and a
    failure after the stop starts the old tracker again. Autostart, shortcut
    and start-up failures become messages.
    """
    def step(text: str) -> None:
        log.info("Setup: %s", text)
        progress(text)

    step("Sprawdzam ustawienia...")
    vault = _validate(choices)
    dev = source_exe is None
    exe = _dev_script() if dev else installed_exe()
    run_argv = [_dev_python(), str(exe)] if dev else [str(exe)]
    messages: list[str] = []
    legacy_dir = find_legacy_install(ops)
    had_exe = not dev and exe.exists()

    step("Przygotowuję vault Obsidian...")
    _prepare_vault(vault)

    step("Zatrzymuję działający tracker...")
    stopped = stop_running_tracker(data_dir)
    if stopped:
        messages.append("Zatrzymano działający tracker.")
    try:
        if adopt_pending_session(data_dir, pending_session):
            messages.append("Zapisano nowe logowanie.")
        _drop_stale_pending_sessions(data_dir)
        # Read only now: a stopping tracker may save config.json once more (e.g. the hotkey push flag).
        existing = load_existing_config(data_dir, legacy_dir, ops)
        upgrade = existing is not None or had_exe

        if not dev:
            step("Kopiuję program...")
            try:
                same = exe.exists() and source_exe.samefile(exe)
            except OSError:
                same = False
            if not same:
                _copy_exe(source_exe, exe)
            with suppress(OSError):
                exe.with_name(exe.name + ".old").unlink()

        step("Zapisuję ustawienia...")
        cfg = merged_config(existing, choices, data_dir)
        try:
            data_dir.mkdir(parents=True, exist_ok=True)
            save_config(cfg)
        except OSError as exc:
            raise SetupError(f"Nie mogę zapisać ustawień w {cfg.path} ({exc}).") from exc
    except SetupError:
        if stopped and launch:
            _restart_after_failure(ops, run_argv, exe)
        raise
    if dev:
        messages.append(f"Tryb deweloperski: tracker startuje ze źródeł ({exe}).")
        if (exe.parent / CONFIG_FILE_NAME).is_file():
            messages.append(f"Uwaga: w tym trybie tracker czyta najpierw {exe.parent / CONFIG_FILE_NAME}.")
    elif upgrade:
        messages.append(f"Zaktualizowano tracker do wersji {__version__}. Logowanie i dane zostały.")
    else:
        messages.append(f"Zainstalowano tracker {__version__} w {exe.parent}.")
    if not cfg.supabase_url or not cfg.supabase_anon_key:
        messages.append("Brak adresu Supabase: tracker liczy czas tylko na tym komputerze.")
    messages.extend(_recordings_messages(cfg.recordings_dir))

    step("Sprawdzam starą wersję...")
    legacy_removed = False
    try:
        legacy_lnk = ops.startup_dir() / LEGACY_STARTUP_LNK
        if legacy_lnk.is_file():
            legacy_lnk.unlink()
            legacy_removed = True
            messages.append("Usunięto stary autostart wersji z ZIP-a."
                            + (f" Jej folder możesz skasować: {legacy_dir}" if legacy_dir else ""))
    except NotImplementedError:
        pass
    except Exception as exc:
        log.warning("Removing the old Startup shortcut failed", exc_info=True)
        messages.append(f"Nie udało się usunąć starego skrótu autostartu ({exc}).")

    step("Ustawiam autostart...")
    try:
        ops.set_run(RUN_VALUE, f"{_command_line(run_argv)} {AUTOSTART_ARG}" if choices.autostart else None)
        messages.append("Tracker uruchomi się przy starcie Windows." if choices.autostart
                        else "Autostart wyłączony: tracker uruchomisz z menu Start (MindsetForest).")
    except Exception as exc:
        log.warning("Setting the Run value failed", exc_info=True)
        messages.append(f"Nie udało się ustawić autostartu ({exc}).")

    if not dev:
        step("Tworzę skrót w menu Start...")
        try:
            ops.create_shortcut(ops.programs_dir() / START_MENU_LNK, exe, description="MindsetForest")
        except Exception as exc:
            log.warning("Creating the Start menu shortcut failed", exc_info=True)
            messages.append(f"Nie udało się utworzyć skrótu w menu Start ({exc}).")

        step("Dodaję wpis w Aplikacjach Windows...")
        try:
            ops.write_uninstall_entry(_uninstall_values(exe))
        except Exception as exc:
            log.warning("Writing the uninstall entry failed", exc_info=True)
            messages.append(f"Nie udało się dodać wpisu w Aplikacjach Windows ({exc}).")

    started = False
    if launch:
        step("Uruchamiam tracker...")
        with suppress(OSError):
            (data_dir / QUIT_REQUEST).unlink()
        try:
            ops.launch_detached(run_argv, cwd=exe.parent)
            started = True
        except Exception as exc:
            log.warning("Starting the tracker failed", exc_info=True)
            messages.append(f"Nie udało się uruchomić trackera ({exc}). Uruchom go z menu Start.")

    messages.extend(_routine_messages(vault))
    return InstallResult(exe=exe, config_path=cfg.path or data_dir / CONFIG_FILE_NAME, vault=vault,
                         started=started, legacy_removed=legacy_removed, messages=messages)


def _restart_after_failure(ops: WinOps, run_argv: list[str], exe: Path) -> None:
    """The setup stopped the tracker and then failed: start the old one again, so time is still tracked."""
    if not exe.exists():
        return
    try:
        ops.launch_detached(run_argv, cwd=exe.parent)
        log.info("Setup failed after stopping the tracker; started it again")
    except Exception:
        log.warning("Could not start the tracker again after a failed setup", exc_info=True)


def _uninstall_values(exe: Path) -> dict[str, str | int]:
    values: dict[str, str | int] = {
        "DisplayName": "MindsetForest Tracker",
        "DisplayVersion": __version__,
        "Publisher": "MindsetForest",
        "InstallLocation": str(install_dir()),
        "DisplayIcon": f'"{exe}"',
        "UninstallString": f'"{exe}" --uninstall',
        "QuietUninstallString": f'"{exe}" --uninstall --silent',
        "NoModify": 1,
        "NoRepair": 1,
    }
    with suppress(OSError):
        values["EstimatedSize"] = max(1, exe.stat().st_size // 1024)  # KB, shown in Apps & features
    return values


def _user_folders(data_dir: Path) -> list[Path]:
    """The vault and recordings folders from the saved config: uninstall never deletes them."""
    path = data_dir / CONFIG_FILE_NAME
    if not path.is_file():
        return []
    cfg = load_config(path)
    return [_user_path(p) for p in (cfg.vault_dir, cfg.recordings_dir) if p]


def _remove_tree(root: Path, keep: list[Path]) -> None:
    """Delete ``root`` except ``keep`` and the folders holding them; errors are skipped."""
    keys = [PurePath(_path_key(k)) for k in keep]

    def remove(path: Path) -> None:
        key = PurePath(_path_key(path))
        if key in keys:
            return
        if path.is_dir() and not path.is_symlink():
            if any(k.is_relative_to(key) for k in keys):
                with suppress(OSError):
                    for child in list(path.iterdir()):
                        remove(child)
                with suppress(OSError):
                    path.rmdir()
            else:
                shutil.rmtree(path, ignore_errors=True)
        else:
            with suppress(OSError):
                path.unlink()

    if root.exists():
        remove(root)


# What the tracker and the setup write in the data dir; --remove-data deletes these and nothing else,
# because MINDSETFOREST_HOME may point at a folder that also holds the user's own files.
TRACKER_DATA_FILES = (
    CONFIG_FILE_NAME, "session*.bin*", "tracker.db*", "recordings.json", "recordings.tmp", "recordings-index.json",
    "recordings-index.tmp", LOCK_FILE,
    QUIT_REQUEST, NEEDS_LOGIN, "tracker.log*", "setup.log*",
)


@dataclass
class UninstallResult:
    messages: list[str]                                        # Polish, one line each
    # Still in use by this process (the running exe and its folder): pass to schedule_cleanup() last.
    pending_delete: list[Path] = field(default_factory=list)


def _close_logs_in(folder: Path) -> None:
    """Close this process's log files inside ``folder``: Windows cannot delete an open file.

    Removed from the root logger too, or the next record would open them again.
    """
    root = logging.getLogger()
    for handler in list(root.handlers):
        name = getattr(handler, "baseFilename", None)
        if isinstance(handler, logging.FileHandler) and name and _inside(name, folder):
            root.removeHandler(handler)
            with suppress(Exception):
                handler.close()


def _remove_tracker_data(data_dir: Path) -> tuple[list[Path], bool]:
    """Delete the tracker's own files (``TRACKER_DATA_FILES``), then the folder if nothing else is left.

    Returns the files that could not be deleted and whether the folder is gone.
    """
    failed: list[Path] = []
    if not data_dir.is_dir():
        return failed, True
    seen: set[Path] = set()
    for pattern in TRACKER_DATA_FILES:
        for path in sorted(data_dir.glob(pattern)):
            if path in seen or not (path.is_file() or path.is_symlink()):
                continue
            seen.add(path)
            try:
                path.unlink()
            except FileNotFoundError:
                pass
            except OSError:
                failed.append(path)
    with suppress(OSError):
        data_dir.rmdir()  # only when empty: anything else in it is not ours
    return failed, not data_dir.exists()


def uninstall(*, data_dir: Path, ops: WinOps, remove_data: bool = False,
              running_exe: Path | None = None) -> UninstallResult:
    """Stop the tracker and remove the program, its autostart, shortcut and Apps entry.

    The tracker's files in the data dir go only with ``remove_data``; the vault,
    the recordings and anything else in that folder never. A running exe cannot
    delete itself: what is still in use comes back in ``pending_delete``, for
    ``schedule_cleanup`` once the caller has shown its last dialog.
    """
    messages: list[str] = []
    pending: list[Path] = []
    keep = _user_folders(data_dir)
    if stop_running_tracker(data_dir):
        messages.append("Zatrzymano tracker.")

    problems: list[str] = []
    for what, action in (
        ("autostart", lambda: ops.set_run(RUN_VALUE, None)),
        ("skrót w menu Start", lambda: (ops.programs_dir() / START_MENU_LNK).unlink(missing_ok=True)),
        ("stary skrót autostartu", lambda: (ops.startup_dir() / LEGACY_STARTUP_LNK).unlink(missing_ok=True)),
        ("wpis w Aplikacjach", lambda: ops.write_uninstall_entry(None)),
    ):
        try:
            action()
        except NotImplementedError:
            pass
        except Exception as exc:
            log.warning("Uninstall: removing %s failed", what, exc_info=True)
            problems.append(f"Nie udało się usunąć: {what} ({exc}).")
    messages.extend(problems or ["Usunięto autostart, skrót z menu Start i wpis w Aplikacjach Windows."])

    folder = install_dir()
    if folder.exists():
        with suppress(OSError):  # a process's current folder cannot be deleted on Windows
            if _inside(Path.cwd(), folder):
                os.chdir(folder.parent)
        held = running_exe if running_exe is not None and _inside(running_exe, folder) else None
        _remove_tree(folder, [*keep, *([held] if held else [])])
        if folder.exists():
            # The cleanup removes a folder with everything in it, so with a vault inside only the exe goes.
            pending = ([held] if held else []) + ([] if any(_inside(k, folder) for k in keep) else [folder])
            messages.append(f"Folder programu {folder} zniknie kilka sekund po zakończeniu deinstalacji.")
        else:
            messages.append(f"Usunięto program z {folder}.")

    if remove_data:
        _close_logs_in(data_dir)
        failed, gone = _remove_tracker_data(data_dir)
        if failed:
            pending.extend(failed)
            names = ", ".join(p.name for p in failed)
            messages.append(f"Nie udało się od razu usunąć z {data_dir}: {names}. Spróbuję jeszcze raz po "
                            "zakończeniu deinstalacji; jeśli zostaną, usuń je ręcznie.")
        elif gone:
            messages.append(f"Usunięto dane lokalne (logowanie, historia czasu) z {data_dir}.")
        else:
            messages.append(f"Usunięto dane trackera (logowanie, historia czasu) z {data_dir}. "
                            "Folder zostaje, bo są w nim inne pliki.")
    else:
        messages.append(f"Dane lokalne zostają w {data_dir}: po ponownej instalacji logowanie wróci samo.")
    messages.append("Vault Obsidian i nagrania zostają nietknięte.")
    log.info("Uninstalled: %s", " | ".join(messages))
    return UninstallResult(messages=messages, pending_delete=pending)


# -- CI smoke test ----------------------------------------------------------------


def _require(ok: bool, what: str) -> None:
    if not ok:
        raise RuntimeError(what)


def _check_tk() -> None:
    import tkinter
    from tkinter import filedialog, messagebox, ttk  # noqa: F401 - bundled with the exe?

    root = tkinter.Tk()
    try:
        root.withdraw()
        ttk.Label(root, text="MindsetForest")
        root.update_idletasks()
    finally:
        root.destroy()


def _check_pil() -> None:
    from PIL import Image, ImageTk  # noqa: F401 - ImageTk gives the setup window its icon

    Image.new("RGBA", (16, 16)).convert("RGB")


def _check_dpapi() -> None:
    from .auth import DPAPI_AVAILABLE, protect, unprotect

    _require(sys.platform != "win32" or DPAPI_AVAILABLE, "win32crypt is missing")
    secret = b"mindsetforest self-test"
    _require(unprotect(protect(secret)) == secret, "protect/unprotect round trip changed the data")


def _check_shortcut(ops: WinOps) -> None:
    target = Path(sys.executable)
    with tempfile.TemporaryDirectory() as tmp:
        lnk = Path(tmp) / "MindsetForest self-test.lnk"
        ops.create_shortcut(lnk, target, args="--self-test-args", workdir=Path(tmp), description="self-test")
        found = ops.shortcut_target(lnk)
        _require(found is not None and _same_path(found[0], target) and found[1] == "--self-test-args",
                 f"shortcut read back as {found!r}")
        lnk.unlink()


def _check_run(ops: WinOps) -> None:
    name = RUN_VALUE + " self-test"
    command = f'"{sys.executable}" --self-test'
    try:
        ops.set_run(name, command)
        _require(ops.get_run(name) == command, "Run value not readable after writing it")
    finally:
        ops.set_run(name, None)
    _require(ops.get_run(name) is None, "Run value still there after deleting it")


def _check_known_folders(ops: WinOps) -> None:
    for folder in (ops.startup_dir(), ops.programs_dir()):
        _require(folder.is_dir(), f"{folder} does not exist")


def _check_certifi() -> None:
    import certifi

    _require(Path(certifi.where()).is_file(), "certifi's CA bundle is missing (HTTPS would fail)")


def self_test(out: Path, ops: WinOps) -> bool:
    """Smoke checks for everything the frozen exe needs, written to ``out`` as JSON for CI.

    ``{"ok": bool, "checks": {name: "ok" | error}}``: one failing check does
    not hide the others.
    """
    checks: dict[str, str] = {}

    def check(name: str, fn: Callable[[], Any]) -> None:
        try:
            fn()
            checks[name] = "ok"
        except Exception as exc:
            checks[name] = f"{type(exc).__name__}: {exc}"

    check("tkinter", _check_tk)
    check("pystray", lambda: __import__("pystray"))
    check("pillow", _check_pil)
    check("dpapi", _check_dpapi)
    check("certifi", _check_certifi)
    check("shortcut", lambda: _check_shortcut(ops))
    check("registry_run", lambda: _check_run(ops))
    check("known_folders", lambda: _check_known_folders(ops))
    check("documents_dir", lambda: _require(documents_dir().is_absolute(), "not an absolute path"))
    check("detect_bandicam_dir", lambda: detect_bandicam_dir(ops))
    check("obsidian_vaults", obsidian_vaults)
    check("parse_hotkey", lambda: _require(parse_hotkey("alt+shift+s") == (0x1 | 0x4, ord("S")),
                                           "alt+shift+s parsed wrongly"))
    ok = all(v == "ok" for v in checks.values())
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"ok": ok, "version": __version__, "checks": checks}, indent=2) + "\n",
                   encoding="utf-8")
    return ok
