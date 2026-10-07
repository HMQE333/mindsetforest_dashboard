"""Setup window: the pure helpers everywhere, the real window only where Tk and a display exist."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

from mindsetforest_tracker import auth, setup_gui, winsetup
from mindsetforest_tracker.config import Config, save_config
from mindsetforest_tracker.setup_gui import (
    ALT_MASK_WINDOWS,
    ALT_MASK_X11,
    CONTROL_MASK,
    SHIFT_MASK,
    SuperKeys,
    account_hint,
    account_line,
    choices_from_form,
    claude_desktop_installed,
    clean_path,
    count_existing,
    done_messages,
    existing_recordings_label,
    hotkey_changed,
    hotkey_from_event,
    hotkey_label,
    hotkey_problem,
    include_existing_default,
    initial_form,
    is_full_path,
    obsidian_action,
    offer_existing,
    pressed_label,
    recordings_hint,
    routine_text,
    signin_error_text,
    supabase_host,
    validate,
    vault_choices,
)

REPO = Path(__file__).resolve().parents[2]

X11 = "linux"
WIN = "win32"


# -- hotkey_from_event ----------------------------------------------------------------

def test_x11_alt_is_mod1():
    assert hotkey_from_event("S", ALT_MASK_X11 | SHIFT_MASK, platform=X11) == "alt+shift+s"
    assert hotkey_from_event("k", CONTROL_MASK, platform=X11) == "ctrl+k"


def test_windows_alt_bit_and_num_lock_is_not_alt():
    assert hotkey_from_event("S", ALT_MASK_WINDOWS | SHIFT_MASK, keycode=0x53, platform=WIN) == "alt+shift+s"
    # On Windows Tk sets Mod1 (0x8) when Num Lock is on: that must not read as Alt.
    assert hotkey_from_event("k", CONTROL_MASK | ALT_MASK_X11, keycode=0x4B, platform=WIN) == "ctrl+k"
    assert hotkey_from_event("k", ALT_MASK_X11, keycode=0x4B, platform=WIN) is None


def test_modifier_order_matches_the_dashboard():
    state = SHIFT_MASK | CONTROL_MASK | ALT_MASK_X11
    assert hotkey_from_event("q", state, win=True, platform=X11) == "ctrl+alt+shift+win+q"


def test_bare_modifiers_give_nothing():
    for keysym in ("Shift_L", "Shift_R", "Control_L", "Control_R", "Alt_L", "Alt_R",
                   "Super_L", "Super_R", "Win_L", "Win_R", "Caps_Lock", "ISO_Level3_Shift"):
        assert hotkey_from_event(keysym, CONTROL_MASK | SHIFT_MASK, platform=X11) is None
        assert hotkey_from_event(keysym, CONTROL_MASK, keycode=0x10, platform=WIN) is None


def test_function_keys_and_digits():
    assert hotkey_from_event("F5", CONTROL_MASK, platform=X11) == "ctrl+f5"
    assert hotkey_from_event("F24", ALT_MASK_X11, platform=X11) == "alt+f24"
    assert hotkey_from_event("F25", ALT_MASK_X11, platform=X11) is None
    assert hotkey_from_event("7", ALT_MASK_X11 | SHIFT_MASK, platform=X11) == "alt+shift+7"
    assert hotkey_from_event("F12", ALT_MASK_WINDOWS, keycode=0x7B, platform=WIN) == "alt+f12"
    assert hotkey_from_event("F24", ALT_MASK_WINDOWS, keycode=0x87, platform=WIN) == "alt+f24"


def test_windows_uses_the_physical_key():
    # Shift+1 is "exclam" and AltGr+S is "sacute"; the virtual-key code still says 1 and S.
    assert hotkey_from_event("exclam", CONTROL_MASK | SHIFT_MASK, keycode=0x31, platform=WIN) == "ctrl+shift+1"
    assert hotkey_from_event("sacute", CONTROL_MASK | ALT_MASK_WINDOWS, keycode=0x53, platform=WIN) == "ctrl+alt+s"
    # Numpad 1 is a different key (VK_NUMPAD1) that RegisterHotKey('1') would not catch.
    assert hotkey_from_event("1", CONTROL_MASK, keycode=0x61, platform=WIN) is None


def test_rejects_unsupported_keys_and_missing_modifiers():
    assert hotkey_from_event("s", 0, platform=X11) is None
    assert hotkey_from_event("F5", 0, platform=X11) is None
    for keysym in ("space", "Return", "Escape", "Tab", "KP_1", "sacute", "exclam", "Left", "minus"):
        assert hotkey_from_event(keysym, CONTROL_MASK, platform=X11) is None
    assert hotkey_from_event("space", CONTROL_MASK, keycode=0x20, platform=WIN) is None
    assert hotkey_from_event("Win_L", 0, keycode=0x5B, platform=WIN) is None


def test_super_key_tracking():
    keys = SuperKeys()
    keys.press("s")
    assert not keys.down
    keys.press("Super_L")
    keys.press("Win_R")
    assert keys.down
    assert hotkey_from_event("s", 0, win=keys.down, platform=X11) == "win+s"
    keys.release("Super_L")
    assert keys.down
    keys.release("Win_R")
    assert not keys.down
    keys.press("Win_L")
    keys.reset()  # focus lost: the release may never come
    assert not keys.down


def test_pressed_label_while_only_modifiers_are_held():
    assert pressed_label("Alt_L", 0, platform=X11) == "Alt + ..."
    assert pressed_label("Shift_L", ALT_MASK_X11, platform=X11) == "Alt + Shift + ..."
    assert pressed_label("Super_L", 0, win=True, platform=X11) == "Win + ..."
    assert pressed_label("Alt_L", ALT_MASK_X11, release=True, platform=X11) == "..."
    assert pressed_label("Control_L", 0, platform=WIN) == "Ctrl + ..."


# -- labels, problems, routine ----------------------------------------------------------

def test_hotkey_label():
    assert hotkey_label("alt+shift+s") == "Alt + Shift + S"
    assert hotkey_label("ctrl+f12") == "Ctrl + F12"
    assert hotkey_label("control+win+1") == "Ctrl + Win + 1"
    assert hotkey_label("") == "wyłączony"


def test_hotkey_problem_mirrors_the_dashboard_rules():
    assert hotkey_problem("") is None
    assert hotkey_problem("alt+shift+s") is None
    assert hotkey_problem("shift+f5") is None
    assert "AltGr" in hotkey_problem("ctrl+alt+k")
    assert "Shift" in hotkey_problem("shift+s")
    assert hotkey_problem("ctrl+c")
    assert hotkey_problem("ctrl+k") is None
    assert hotkey_problem("s")  # no modifier: parse_hotkey rejects it


def test_routine_text_names_the_vault():
    vault = Path("C:/Users/Ola/Documents/MindsetForest Vault")
    text = routine_text(vault)
    assert text == winsetup.ROUTINE_TASK.format(vault=vault)
    assert str(vault) in text
    assert "_SYSTEM/routine-prompt.md" in text


def test_done_messages_leave_the_routine_to_its_panel():
    lines = ["Zainstalowano tracker 1.0.0.", "Ostatni krok: ustaw rutynę Claude...", "Polecenie rutyny: Open my..."]
    assert done_messages(lines) == ["Zainstalowano tracker 1.0.0."]


# -- validate ---------------------------------------------------------------------------

def _form(tmp_path: Path, **over) -> dict:
    (tmp_path / "rec").mkdir(exist_ok=True)
    form = {
        "supabase_url": "https://x.supabase.co", "supabase_anon_key": "anon", "dashboard_url": winsetup.DEFAULT_SITE,
        "signed_in": True, "transcribe": True, "recordings_dir": str(tmp_path / "rec"),
        "vault_dir": str(tmp_path / "Vault"), "hotkey": "alt+shift+s", "autostart": True, "device_name": "PC",
    }
    form.update(over)
    return form


def _split(problems):
    return [p for p in problems if not p.warning], [p for p in problems if p.warning]


def test_validate_accepts_a_good_form(tmp_path):
    assert validate(_form(tmp_path)) == []


def test_validate_needs_a_vault(tmp_path):
    errors, _ = _split(validate(_form(tmp_path, vault_dir="")))
    assert any("vaulta" in e for e in errors)
    errors, _ = _split(validate(_form(tmp_path, vault_dir="relative/vault")))
    assert any("pełną ścieżkę" in e for e in errors)
    (tmp_path / "file.txt").write_text("x")
    errors, _ = _split(validate(_form(tmp_path, vault_dir=str(tmp_path / "file.txt"))))
    assert any("plik" in e for e in errors)


def test_missing_recordings_folder_is_only_a_warning(tmp_path):
    errors, warnings = _split(validate(_form(tmp_path, recordings_dir=str(tmp_path / "nope"))))
    assert errors == []
    assert any("jeszcze nie istnieje" in w for w in warnings)
    # Transcription off: the folder does not matter at all.
    assert validate(_form(tmp_path, transcribe=False, recordings_dir=str(tmp_path / "nope"))) == []
    errors, _ = _split(validate(_form(tmp_path, recordings_dir="")))
    assert errors
    errors, _ = _split(validate(_form(tmp_path, recordings_dir=str(tmp_path / "Vault"))))
    assert any("różnymi" in e for e in errors)


def test_not_signed_in_is_a_warning(tmp_path):
    errors, warnings = _split(validate(_form(tmp_path, signed_in=False)))
    assert errors == []
    assert any("Nie zalogowano" in w for w in warnings)
    # Windows 11 hides a new tray icon under ^: the warning names that and the Start menu way in.
    assert any("strzałką ^" in w and "menu Start (MindsetForest)" in w for w in warnings)
    _, warnings = _split(validate(_form(tmp_path, signed_in=False, login_expired=True)))
    assert any(w.startswith("Logowanie wygasło") for w in warnings)


def test_relative_recordings_folder_is_an_error(tmp_path):
    errors, _ = _split(validate(_form(tmp_path, recordings_dir="Bandicam")))
    assert any("pełną ścieżkę folderu nagrań" in e for e in errors)
    assert validate(_form(tmp_path, recordings_dir="Bandicam", transcribe=False)) == []
    assert recordings_hint("Bandicam", tmp_path, "default").startswith("Podaj pełną ścieżkę")


def test_full_paths_on_windows():
    assert is_full_path("C:\\Users\\Ola\\Bandicam", platform=WIN)
    assert is_full_path("D:/Nagrania", platform=WIN)
    assert is_full_path("\\\\nas\\share\\audio", platform=WIN)
    assert is_full_path("\\\\nas\\share", platform=WIN)
    # Relative to the tracker's working folder (the program folder) or to a drive's current folder.
    for relative in ("Bandicam", "D:Nagrania", "\\Nagrania", "/Nagrania", ""):
        assert not is_full_path(relative, platform=WIN), relative
    assert is_full_path("/home/ola/rec", platform=X11) and not is_full_path("rec", platform=X11)


def test_bad_hotkey_is_an_error_and_a_poor_one_a_warning(tmp_path):
    errors, _ = _split(validate(_form(tmp_path, hotkey="s")))
    assert errors
    errors, _ = _split(validate(_form(tmp_path, hotkey="alt+shift+enter")))
    assert errors
    errors, warnings = _split(validate(_form(tmp_path, hotkey="ctrl+alt+k")))
    assert errors == [] and any("AltGr" in w for w in warnings)
    assert validate(_form(tmp_path, hotkey="")) == []  # off is fine


def test_supabase_settings_are_required(tmp_path):
    errors, _ = _split(validate(_form(tmp_path, supabase_url="")))
    assert any("Zaawansowane" in e for e in errors)
    errors, _ = _split(validate(_form(tmp_path, supabase_url="x.supabase.co")))
    assert any("https://" in e for e in errors)


def test_problems_are_strings():
    problems = validate({})
    assert problems and all(isinstance(p, str) for p in problems)
    assert [p.warning for p in problems] == sorted(p.warning for p in problems)  # errors first


# -- other pure helpers -------------------------------------------------------------------

def test_recordings_hint(tmp_path):
    (tmp_path / "Bandicam").mkdir()
    found = tmp_path / "Bandicam"
    assert recordings_hint(str(found), found, "bandicam") == "Wykryto w ustawieniach Bandicam"
    assert recordings_hint(str(found), found, "documents") == "Domyślny folder Bandicam"
    assert recordings_hint(str(found), found, "videos") == "Domyślny folder Bandicam"
    assert recordings_hint(str(tmp_path / "x"), found, "default").startswith("Folder jeszcze nie istnieje")
    assert recordings_hint(str(tmp_path), found, "bandicam") == ""
    assert recordings_hint("", found, "bandicam") == ""


def test_claude_desktop_detection(tmp_path):
    local, roaming = tmp_path / "Local", tmp_path / "Roaming"
    env = {"LOCALAPPDATA": str(local), "APPDATA": str(roaming)}
    assert not claude_desktop_installed(env)
    assert not claude_desktop_installed({})
    # Squirrel install folders, the settings folder, and the MSIX package's data folder.
    for folder in (local / "AnthropicClaude", local / "Programs" / "claude", roaming / "Claude",
                   local / "Packages" / "Claude_pzs8sxrjxfjjc"):
        folder.mkdir(parents=True)
        assert claude_desktop_installed(env), folder
        folder.rmdir()
    (local / "Packages" / "Claude_pzs8sxrjxfjjc.txt").write_text("x")  # a file, not the package folder
    assert not claude_desktop_installed(env)
    alias = local / "Microsoft" / "WindowsApps" / "claude.exe"  # the MSIX app execution alias
    alias.parent.mkdir(parents=True)
    alias.write_bytes(b"")
    assert claude_desktop_installed(env)


def test_a_detection_miss_never_says_claude_is_absent():
    assert setup_gui.CLAUDE_NOT_DETECTED == "Nie wykryto Claude Desktop. Jeśli już go masz, pomiń ten krok."


def test_routine_steps_say_where_scheduled_tasks_live():
    steps = " ".join(setup_gui.ROUTINE_STEPS)
    # Claude Desktop's own (English) labels, a local task for the vault, and when it fires.
    for label in ("Scheduled", "New task", "Set up manually", "Hourly"):
        assert label in steps
    assert "lokalnie" in steps and "nie w chmurze" in steps
    assert "Claude Desktop jest włączony" in setup_gui.ROUTINE_NOTE and "komputer nie śpi" in setup_gui.ROUTINE_NOTE
    # The README and the dashboard's download box give the same steps.
    readme = (REPO / "tracker" / "README.md").read_text(encoding="utf-8")
    box = (REPO / "artifacts" / "app" / "src" / "components" / "tracker" / "TrackerDownload.tsx").read_text(
        encoding="utf-8")
    # So do the release notes CI writes for the download.
    notes = (REPO / ".github" / "workflows" / "tracker-windows.yml").read_text(encoding="utf-8")
    for text in (readme, box, notes):
        for label in ("Scheduled", "New task", "Set up manually", "Hourly", "nie w chmurze", "komputer nie śpi"):
            assert label in text, label
        assert "2-3 godzin" not in text


def test_done_page_texts_point_past_the_hidden_tray_icon():
    assert setup_gui.TRACKER_RUNNING == ("Tracker działa (ikonka drzewa przy zegarze; jeśli jej nie widać, "
                                         "kliknij strzałkę ^ obok zegara).")
    assert "menu Start: MindsetForest" in setup_gui.SETTINGS_LATER


def test_obsidian_action(tmp_path):
    vault = tmp_path / "My Vault"
    vault.mkdir()
    other = winsetup.ObsidianVault(tmp_path, "aaaa", 1)
    known = winsetup.ObsidianVault(vault, "0123456789abcdef", 2)
    assert obsidian_action(vault, [other, known], True) == ("open", "obsidian://open?vault=0123456789abcdef")
    assert obsidian_action(vault, [other], True) == ("choose", "obsidian://choose-vault")
    assert obsidian_action(vault, [], False) == ("download", setup_gui.OBSIDIAN_DOWNLOAD_URL)


def test_vault_choices_put_the_default_first_without_repeats(tmp_path):
    default = tmp_path / "MindsetForest Vault"
    vaults = [winsetup.ObsidianVault(tmp_path / "A", "a", 2), winsetup.ObsidianVault(default, "d", 1)]
    assert vault_choices(default, vaults, str(tmp_path / "A")) == [str(default), str(tmp_path / "A")]
    assert vault_choices(default, [], str(tmp_path / "B")) == [str(default), str(tmp_path / "B")]


def test_initial_form_never_uses_the_placeholder_site(tmp_path):
    detected, default_vault = tmp_path / "Bandicam", tmp_path / "Vault"
    for old in ("https://mindsetforest.app", "https://mindsetforest.app/", ""):
        form = initial_form(Config(dashboard_url=old), detected=detected, default_vault=default_vault, autostart=True)
        assert form["dashboard_url"] == winsetup.DEFAULT_SITE
    own = initial_form(Config(dashboard_url="https://me.example/dash"), detected=detected,
                       default_vault=default_vault, autostart=True)
    assert own["dashboard_url"] == "https://me.example/dash/"


def test_the_sign_in_server_is_shown():
    assert supabase_host("https://abcd.supabase.co/") == "abcd.supabase.co"
    assert supabase_host("") == "" and supabase_host("not a url") == ""
    assert account_hint("https://abcd.supabase.co").endswith("Serwer logowania: abcd.supabase.co")
    assert "Serwer logowania" not in account_hint("")


def test_account_line_for_an_expired_login():
    assert account_line("ola@example.com", False) == "Zalogowano: ola@example.com"
    assert account_line("ola@example.com", True) == "Logowanie wygasło (ola@example.com): zaloguj się ponownie"


def test_hotkey_is_pushed_only_when_changed_in_the_window(tmp_path):
    assert not hotkey_changed("alt+shift+s", "alt+shift+s")
    assert not hotkey_changed("Alt+Shift+S ", "alt+shift+s")
    assert hotkey_changed("ctrl+f8", "alt+shift+s") and hotkey_changed("", "alt+shift+s")
    assert choices_from_form(_form(tmp_path, push_hotkey=True)).push_hotkey
    assert not choices_from_form(_form(tmp_path)).push_hotkey  # a fresh install's untouched default


def test_existing_recordings_choice(tmp_path):
    assert existing_recordings_label(3) == "Przetwórz też nagrania, które już są w folderze (3)"
    assert existing_recordings_label(999) == "Przetwórz też nagrania, które już są w folderze (999)"
    assert existing_recordings_label(1000) == "Przetwórz też nagrania, które już są w folderze (999+)"
    detected = tmp_path / "Rec"
    # Bandicam's folder holds the user's recordings; a broad folder may hold anyone's audio.
    assert include_existing_default(str(tmp_path / "Documents" / "Bandicam"), detected, "default")
    assert include_existing_default(str(tmp_path / "BANDICAM" / "Audios"), detected, "default")
    # Even Bandicam's own setting may point at a whole drive or Desktop: off unless the folder says Bandicam.
    assert not include_existing_default(str(detected), detected, "bandicam")
    assert not include_existing_default(str(detected), detected, "default")
    assert not include_existing_default(str(tmp_path / "Music"), detected, "bandicam")
    assert not include_existing_default("", detected, "bandicam")
    # Asked only for a folder the tracker did not watch before, and only when it holds MP3s.
    assert offer_existing(str(detected), 4, "")
    assert offer_existing(str(detected), 4, str(tmp_path / "Old"))
    assert not offer_existing(str(detected), 4, str(detected))
    assert not offer_existing(str(detected), 0, "") and not offer_existing(str(detected), None, "")
    assert choices_from_form(_form(tmp_path, include_existing=False)).include_existing is False
    assert choices_from_form(_form(tmp_path)).include_existing is True


def test_count_existing_uses_the_trackers_depth_limit(tmp_path):
    root = tmp_path / "D"
    for rel in ("a.mp3", "Audios/b.MP3", "x/y/c.mp3", "x/y/z/d.mp3", "x/y/z/deep/e.mp3", "notes.txt"):
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_bytes(b"")
    assert count_existing(str(root)) == 4  # e.mp3 is four levels down: the tracker never sees it
    assert count_existing(str(root / "x"), vault=str(root / "x" / "y")) == 0  # the vault is not recordings
    assert count_existing(str(tmp_path / "missing")) == 0 and count_existing("D") == 0


def test_initial_form_without_and_with_a_config(tmp_path):
    detected, default_vault = tmp_path / "Bandicam", tmp_path / "Vault"
    fresh = initial_form(None, detected=detected, default_vault=default_vault, autostart=True)
    assert fresh["transcribe"] and fresh["recordings_dir"] == str(detected)
    assert fresh["vault_dir"] == str(default_vault) and fresh["hotkey"] == "alt+shift+s"
    assert fresh["supabase_url"] == "" and fresh["dashboard_url"] == winsetup.DEFAULT_SITE

    cfg = Config(supabase_url="https://x.supabase.co", supabase_anon_key="k", dashboard_url="https://d/",
                 recordings_dir="", vault_dir=str(tmp_path / "Mine"), capture_hotkey="ctrl+f8", device_name="Laptop")
    kept = initial_form(cfg, detected=detected, default_vault=default_vault, autostart=False)
    assert kept["transcribe"] is False and kept["recordings_dir"] == str(detected)
    assert kept["vault_dir"] == str(tmp_path / "Mine") and kept["hotkey"] == "ctrl+f8"
    assert kept["supabase_url"] == "https://x.supabase.co" and kept["device_name"] == "Laptop"
    assert kept["autostart"] is False


def test_choices_from_form(tmp_path):
    choices = choices_from_form(_form(tmp_path, supabase_url="https://x.supabase.co/", transcribe=False))
    assert isinstance(choices, winsetup.SetupChoices)
    assert choices.recordings_dir == ""  # transcription off
    assert choices.supabase_url == "https://x.supabase.co"
    assert choices.vault_dir == str(tmp_path / "Vault") and choices.capture_hotkey == "alt+shift+s"
    on = choices_from_form(_form(tmp_path, dashboard_url=""))
    assert on.recordings_dir == str(tmp_path / "rec") and on.dashboard_url == winsetup.DEFAULT_SITE


def test_clean_path(tmp_path, monkeypatch):
    monkeypatch.setenv("MF_TEST_DIR", str(tmp_path))
    assert clean_path(f'  "{tmp_path / "a"}"  ') == str(tmp_path / "a")
    assert clean_path("$MF_TEST_DIR/b" if sys.platform != "win32" else "%MF_TEST_DIR%/b") == str(tmp_path / "b")
    assert clean_path("   ") == ""


def test_signin_error_text():
    assert signin_error_text(auth.AuthError("HTTP 400: Invalid login credentials")) == "Nieprawidłowy e-mail lub hasło."
    assert "potwierdź" in signin_error_text(auth.AuthError("HTTP 400: Email not confirmed"))
    assert "niedostępny" in signin_error_text(auth.AuthUnavailable("network error: boom"))


def test_module_imports_without_tkinter():
    code = "import sys, mindsetforest_tracker.setup_gui; sys.exit('tkinter' in sys.modules)"
    done = subprocess.run([sys.executable, "-c", code], cwd=Path(__file__).resolve().parent.parent)
    assert done.returncode == 0


def test_unknown_mode_is_rejected_before_any_window(tmp_path):
    with pytest.raises(ValueError):
        setup_gui.run_setup_window("bogus", data_dir=tmp_path, ops=winsetup.WinOps(), source_exe=None)


# -- window state without a window (runs everywhere) ---------------------------------------

class StateOps:
    """Just enough of WinOps for ``_load_state``: no legacy install, autostart as given."""

    def __init__(self, run: str | None = None) -> None:
        self.run = run

    def get_run(self, _name):
        return self.run

    def startup_dir(self):
        raise NotImplementedError

    def read_bandicam_output(self):
        return None


def _saved_session(path: Path, email: str) -> None:
    payload = json.dumps({"refresh_token": "r", "user_id": "u", "email": email}).encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(auth.protect(payload))


def _state(monkeypatch, tmp_path, mode="install", ops=None, *, installed=False):
    """A SetupWindow with only ``_load_state`` run: the decisions it makes, no Tk needed."""
    monkeypatch.setattr(winsetup, "installed_exe", lambda: tmp_path / ("Programs/x.exe" if installed else "none.exe"))
    if installed:
        (tmp_path / "Programs").mkdir(exist_ok=True)
        (tmp_path / "Programs" / "x.exe").write_bytes(b"")
    monkeypatch.setattr(winsetup, "obsidian_vaults", lambda appdata=None: [])
    monkeypatch.setattr(winsetup, "default_vault_dir", lambda: tmp_path / "Default Vault")
    monkeypatch.setattr(winsetup, "detect_bandicam_dir", lambda ops: (tmp_path / "Bandicam", "default"))
    window = setup_gui.SetupWindow.__new__(setup_gui.SetupWindow)
    window.mode, window.data_dir, window.ops = mode, tmp_path / "data", ops or StateOps()
    window.pending = winsetup.pending_session_path(window.data_dir)
    window._load_state()
    return window


def test_upgrade_keeps_autostart_off(monkeypatch, tmp_path):
    # Installed, and the user had turned autostart off in Ustawienia: an upgrade must not turn it on.
    assert _state(monkeypatch, tmp_path, ops=StateOps(run=None), installed=True).initial["autostart"] is False
    assert _state(monkeypatch, tmp_path, ops=StateOps(run='"x.exe" --autostart'), installed=True).initial["autostart"]
    assert _state(monkeypatch, tmp_path, "settings", ops=StateOps(run=None)).initial["autostart"] is False
    # A fresh install starts ticked, also after an uninstall that kept config.json (no Run value then).
    save_config(Config(supabase_url="https://x.supabase.co", supabase_anon_key="k",
                       path=tmp_path / "data" / "config.json"))
    assert _state(monkeypatch, tmp_path, ops=StateOps(run=None)).initial["autostart"] is True


def test_expired_login_is_not_shown_as_signed_in(monkeypatch, tmp_path):
    data = tmp_path / "data"
    _saved_session(data / winsetup.SESSION_FILE, "ola@example.com")
    window = _state(monkeypatch, tmp_path, "settings")
    assert (window.account_email, window.expired) == ("ola@example.com", False)
    (data / winsetup.NEEDS_LOGIN).write_text("refused")
    window = _state(monkeypatch, tmp_path, "settings")
    assert (window.account_email, window.expired) == ("ola@example.com", True)
    # A sign-in made in this window and not installed yet is the answer to that.
    _saved_session(winsetup.pending_session_path(data), "ola@example.com")
    window = _state(monkeypatch, tmp_path, "settings")
    assert (window.account_email, window.expired) == ("ola@example.com", False)


def test_a_window_sees_and_drops_only_its_own_pending_sign_in(monkeypatch, tmp_path):
    data = tmp_path / "data"
    _saved_session(data / winsetup.SESSION_FILE, "a@example.com")
    other = winsetup.pending_session_path(data, pid=os.getpid() + 1)
    _saved_session(other, "b@example.com")  # signed in in another window, not installed yet
    window = _state(monkeypatch, tmp_path, "settings")
    assert window.pending != other and window.account_email == "a@example.com"
    _saved_session(window.pending, "c@example.com")
    assert _state(monkeypatch, tmp_path, "settings").account_email == "c@example.com"

    root = SimpleNamespace(after_cancel=lambda job: None)
    window.root, window.closed, window.exit_code, window._poll_id, window._count_after = root, False, 1, "p", None
    window._destroyed(SimpleNamespace(widget=root))  # closed with Anuluj or X
    assert not window.pending.exists() and other.exists()


def test_cleanup_after_uninstall_is_the_last_step(monkeypatch, tmp_path):
    order = []

    class FakeRoot:
        def mainloop(self):
            order.append("mainloop")  # the result dialog was shown and closed in here

    class FakeWindow:
        def __init__(self, root, mode, **kw):
            self.exit_code, self.cleanup = 0, [tmp_path / "prog"]

    monkeypatch.setattr(setup_gui, "_import_tk", lambda: None)
    monkeypatch.setattr(setup_gui, "tk", SimpleNamespace(Tk=FakeRoot))
    monkeypatch.setattr(setup_gui, "SetupWindow", FakeWindow)
    monkeypatch.setattr(winsetup, "schedule_cleanup", lambda ops, paths: order.append(("cleanup", paths)))
    assert setup_gui.run_setup_window("settings", data_dir=tmp_path, ops=StateOps(), source_exe=None) == 0
    assert order == ["mainloop", ("cleanup", [tmp_path / "prog"])]


def test_help_window_stays_above_the_taskbar():
    placed = []
    top = SimpleNamespace(update_idletasks=lambda: None, winfo_reqwidth=lambda: 500, winfo_reqheight=lambda: 600,
                          winfo_screenheight=lambda: 768, geometry=placed.append)
    window = setup_gui.SetupWindow.__new__(setup_gui.SetupWindow)
    window.scale = 1.25
    window.root = SimpleNamespace(winfo_rootx=lambda: 100, winfo_width=lambda: 700, winfo_rooty=lambda: 120)
    window._place_over(top)
    assert placed == ["+200+43"]  # 768 - 600 - 125, not 120 + 75


# -- the real window (only with Tk and a display) ------------------------------------------

class RaisingOps:
    """Every Windows call fails: the window must still open and work."""

    def __getattr__(self, name):
        def fail(*_a, **_k):
            raise RuntimeError(f"{name} failed")
        return fail


class FakeBox:
    def __init__(self, answer: bool = True) -> None:
        self.answer = answer
        self.calls: list[tuple[str, str]] = []

    def showerror(self, _title, message, **_kw):
        self.calls.append(("error", message))

    def showinfo(self, _title, message, **_kw):
        self.calls.append(("info", message))

    def askyesno(self, _title, message, **_kw):
        self.calls.append(("ask", message))
        return self.answer

    def errors(self):
        return [m for kind, m in self.calls if kind == "error"]


@pytest.fixture
def gui(monkeypatch, tmp_path):
    tkinter = pytest.importorskip("tkinter")
    if sys.platform != "win32" and not os.environ.get("DISPLAY"):
        pytest.skip("no display")
    setup_gui._import_tk()
    try:
        root = tkinter.Tk()
    except tkinter.TclError as exc:
        pytest.skip(f"Tk unavailable: {exc}")
    box = FakeBox()
    monkeypatch.setattr(setup_gui, "messagebox", box)
    monkeypatch.setattr(setup_gui, "claude_desktop_installed", lambda env=None: False)
    monkeypatch.setattr(winsetup, "obsidian_vaults", lambda appdata=None: [])
    monkeypatch.setattr(winsetup, "obsidian_installed", lambda appdata=None: True)
    monkeypatch.setattr(winsetup, "default_vault_dir", lambda: tmp_path / "Default Vault")
    monkeypatch.setattr(winsetup, "detect_bandicam_dir", lambda ops: (tmp_path / "Bandicam", "default"))
    yield SimpleNamespace(root=root, box=box)
    try:
        root.destroy()
    except tkinter.TclError:
        pass  # the window closed itself


def pump(root, until, timeout: float = 5.0) -> bool:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        root.update()
        if until():
            return True
        time.sleep(0.02)
    return False


def texts(widget) -> list[str]:
    out = []
    for child in widget.winfo_children():
        try:
            out.append(str(child.cget("text")))
        except Exception:
            pass
        out += texts(child)
    return out


def _result(vault: Path) -> winsetup.InstallResult:
    return winsetup.InstallResult(exe=Path("x.exe"), config_path=Path("config.json"), vault=vault, started=True,
                                  legacy_removed=False, messages=["Zainstalowano tracker.", "Polecenie rutyny: ..."])


def test_install_window_end_to_end(gui, monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    fetched, installed = [], []
    monkeypatch.setattr(winsetup, "fetch_site_config", lambda site: fetched.append(site) or {
        "supabase_url": "https://x.supabase.co", "supabase_anon_key": "anon", "dashboard_url": site})

    def fake_install(choices, *, data_dir, source_exe, ops, launch, progress, pending_session):
        progress("Kopiuję program...")
        installed.append(choices)
        return _result(Path(choices.vault_dir))

    monkeypatch.setattr(winsetup, "install", fake_install)
    window = setup_gui.SetupWindow(gui.root, "install", data_dir=data_dir, ops=RaisingOps(), source_exe=None)
    assert pump(gui.root, lambda: window.url_var.get() == "https://x.supabase.co")
    assert fetched == [winsetup.DEFAULT_SITE]
    assert "Zainstaluj i uruchom" in texts(window.footer)
    assert window.account_email is None  # no session.bin: email + password fields

    dialog = window.capture_hotkey()
    alt = ALT_MASK_WINDOWS if sys.platform == "win32" else ALT_MASK_X11
    dialog.press(SimpleNamespace(keysym="Shift_L", state=0, keycode=0x10))
    assert dialog.ok_button.instate(["disabled"])
    dialog.press(SimpleNamespace(keysym="K", state=alt | SHIFT_MASK, keycode=0x4B))
    assert dialog.chosen == "alt+shift+k"
    dialog.press(SimpleNamespace(keysym="Return", state=0, keycode=0x0D))
    assert window.hotkey_var.get() == "alt+shift+k"
    assert window.hotkey_text.get() == "Alt + Shift + K"

    vault = tmp_path / "Vault"
    window.vault_var.set(f'"{vault}"')
    window.rec_var.set(str(tmp_path / "rec-missing"))
    window.submit()
    assert pump(gui.root, lambda: window.page_name == "done")
    assert gui.box.errors() == []
    asked = [m for kind, m in gui.box.calls if kind == "ask"]
    assert asked and "Nie zalogowano" in asked[0] and "Kontynuować?" in asked[0]
    (choices,) = installed
    assert choices.vault_dir == str(vault) and choices.capture_hotkey == "alt+shift+k"
    assert choices.push_hotkey  # picked in "Zmień...": the dashboard gets it
    assert choices.recordings_dir == str(tmp_path / "rec-missing")
    assert choices.supabase_url == "https://x.supabase.co" and choices.supabase_anon_key == "anon"
    assert window.exit_code == 0

    shown = texts(window.page)
    assert "Gotowe" in shown and setup_gui.ROUTINE_TITLE in shown
    assert "Pobierz Claude Desktop" in shown and "Kopiuj polecenie" in shown
    assert "Otwórz Obsidian" in shown and setup_gui.OPEN_FOLDER_AS_VAULT in shown
    assert "Polecenie rutyny: ..." not in "\n".join(shown)
    assert window.routine_text_widget.get("1.0", "end-1c") == routine_text(vault)
    assert window._copy(routine_text(vault))
    assert gui.root.clipboard_get() == routine_text(vault)


def test_install_error_keeps_the_form_usable(gui, monkeypatch, tmp_path):
    monkeypatch.setattr(winsetup, "fetch_site_config", lambda site: (_ for _ in ()).throw(
        winsetup.SetupError("Brak internetu.")))

    def failing_install(*_a, **_k):
        raise winsetup.SetupError("Nie mogę skopiować programu.")

    monkeypatch.setattr(winsetup, "install", failing_install)
    window = setup_gui.SetupWindow(gui.root, "install", data_dir=tmp_path, ops=RaisingOps(), source_exe=None)
    assert pump(gui.root, lambda: window.adv_open)  # the fetch failed: Zaawansowane opens with the reason
    assert "Brak internetu." in window.advanced_note.get()
    window.submit()  # no Supabase settings yet: an error, nothing installed
    assert gui.box.errors() and "Zaawansowane" in gui.box.errors()[-1]
    window.url_var.set("https://x.supabase.co")
    window.key_var.set("anon")
    window.submit()
    assert pump(gui.root, lambda: "Nie mogę skopiować programu." in gui.box.errors())
    assert window.page_name == "form" and window.exit_code == 1
    assert not window.submit_button.instate(["disabled"])


def test_settings_window_shows_the_saved_account_and_uninstalls(gui, monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    save_config(Config(supabase_url="https://x.supabase.co", supabase_anon_key="anon",
                       vault_dir=str(tmp_path / "Vault"), path=data_dir / "config.json"))
    payload = json.dumps({"refresh_token": "r", "user_id": "u", "email": "ola@example.com"}).encode()
    (data_dir / "session.bin").write_bytes(auth.protect(payload))
    monkeypatch.setattr(winsetup, "fetch_site_config", lambda site: pytest.fail("settings are already known"))
    removed = []
    monkeypatch.setattr(winsetup, "uninstall", lambda **kw: removed.append(kw) or winsetup.UninstallResult(
        ["Usunięto program."], [tmp_path / "prog"]))

    window = setup_gui.SetupWindow(gui.root, "settings", data_dir=data_dir, ops=RaisingOps(), source_exe=None)
    gui.root.update()
    assert window.account_email == "ola@example.com"
    shown = texts(gui.root)
    assert "Zapisz" in shown and "Odinstaluj..." in shown and "Zaloguj inne konto" in shown
    assert window.vault_var.get() == str(tmp_path / "Vault")
    help_window = window.show_routine_help()
    assert window.routine_text_widget.get("1.0", "end-1c") == routine_text(tmp_path / "Vault")
    help_window.destroy()

    window.uninstall()
    assert pump(gui.root, lambda: window.closed)
    assert removed and removed[0]["data_dir"] == data_dir and removed[0]["remove_data"] is True
    assert window.exit_code == 0
    assert ("info", "Usunięto program.") in gui.box.calls
    assert window.cleanup == [tmp_path / "prog"]  # run_setup_window hands it to schedule_cleanup last


@pytest.mark.parametrize("password_ok", [True, False])
def test_typed_credentials_sign_in_before_installing(gui, monkeypatch, tmp_path, password_ok):
    signed, installed = [], []

    class FakeAuth:
        def __init__(self, url, key, session_path):
            self.args = (url, key, session_path)

        def load_saved(self):
            return False

        def sign_in(self, email, password):
            signed.append((self.args, email, password))
            if not password_ok:
                raise auth.AuthError("HTTP 400: Invalid login credentials")
            return SimpleNamespace(email=email)

    monkeypatch.setattr(setup_gui, "SupabaseAuth", FakeAuth)
    monkeypatch.setattr(winsetup, "fetch_site_config", lambda site: {
        "supabase_url": "https://x.supabase.co", "supabase_anon_key": "anon", "dashboard_url": site})
    monkeypatch.setattr(winsetup, "install", lambda choices, **kw: installed.append(choices) or _result(
        Path(choices.vault_dir)))
    (tmp_path / "Bandicam").mkdir()  # the detected recordings folder exists: nothing to confirm
    window = setup_gui.SetupWindow(gui.root, "install", data_dir=tmp_path / "data", ops=RaisingOps(), source_exe=None)
    assert pump(gui.root, lambda: window.key_var.get() == "anon")
    window.email_var.set("ola@example.com")
    window.password_var.set("secret")
    window.submit()  # "Zaloguj" was never pressed
    if password_ok:
        assert pump(gui.root, lambda: window.page_name == "done")
        assert gui.box.calls == []
        assert window.account_email == "ola@example.com" and len(installed) == 1
    else:
        assert pump(gui.root, lambda: gui.box.errors())
        assert gui.box.errors() == ["Nieprawidłowy e-mail lub hasło."]
        assert window.signin_error.get() == "Nieprawidłowy e-mail lub hasło."
        assert installed == [] and window.page_name == "form"
    ((url, key, session_path), email, password), = signed
    assert (url, key, email, password) == ("https://x.supabase.co", "anon", "ola@example.com", "secret")
    # The new login waits beside session.bin, in this window's own file, until install() has
    # stopped the running tracker.
    assert session_path == window.pending == winsetup.pending_session_path(tmp_path / "data")


def _inside_of(widget, container) -> bool:
    return str(widget).startswith(str(container) + ".")


def test_main_buttons_stay_in_the_fixed_bar(gui, monkeypatch, tmp_path):
    monkeypatch.setattr(winsetup, "fetch_site_config", lambda site: {
        "supabase_url": "https://x.supabase.co", "supabase_anon_key": "anon", "dashboard_url": site})
    monkeypatch.setattr(winsetup, "install", lambda choices, **kw: _result(Path(choices.vault_dir)))
    window = setup_gui.SetupWindow(gui.root, "install", data_dir=tmp_path / "data", ops=RaisingOps(), source_exe=None)
    assert pump(gui.root, lambda: window.key_var.get() == "anon")
    # The action is outside the scrolled page, inside the window, whatever the page's height.
    assert _inside_of(window.submit_button, window.footer) and not _inside_of(window.submit_button, window.page)
    gui.root.update()
    bottom = window.submit_button.winfo_rooty() + window.submit_button.winfo_height()
    assert window.submit_button.winfo_ismapped()
    assert bottom <= gui.root.winfo_rooty() + gui.root.winfo_height()
    room = gui.root.winfo_screenheight() - window.px(120)
    assert window.canvas.winfo_reqheight() + window.footer.winfo_reqheight() <= room

    window.vault_var.set(str(tmp_path / "Vault"))
    window.submit()
    assert pump(gui.root, lambda: window.page_name == "done")
    assert "Zamknij" in texts(window.footer) and "Zamknij" not in texts(window.page)
    # The routine comes first on the Gotowe page, its copy button on the step's own line.
    order = [c for c in window.done.winfo_children() if c.winfo_manager()]
    panel = next(i for i, c in enumerate(order) if str(c.cget("text") if "text" in c.keys() else "")
                 == setup_gui.ROUTINE_TITLE)
    lines = next(i for i, c in enumerate(order) if "Zainstalowano tracker." in str(c.cget("text")))
    assert panel < lines
    assert setup_gui.TRACKER_RUNNING in texts(window.page)


def test_existing_mp3s_are_offered_not_sent_by_default(gui, monkeypatch, tmp_path):
    installed = []
    monkeypatch.setattr(winsetup, "fetch_site_config", lambda site: {
        "supabase_url": "https://x.supabase.co", "supabase_anon_key": "anon", "dashboard_url": site})
    monkeypatch.setattr(winsetup, "install", lambda choices, **kw: installed.append(choices) or _result(
        Path(choices.vault_dir)))
    music = tmp_path / "Music"
    for name in ("a.mp3", "b.mp3", "Album/c.mp3"):
        (music / name).parent.mkdir(parents=True, exist_ok=True)
        (music / name).write_bytes(b"")
    window = setup_gui.SetupWindow(gui.root, "install", data_dir=tmp_path / "data", ops=RaisingOps(), source_exe=None)
    assert pump(gui.root, lambda: window.key_var.get() == "anon")
    window.rec_var.set(str(music))
    assert pump(gui.root, lambda: window.rec_count == 3)
    assert window.include_check.winfo_manager()
    assert window.include_check.cget("text") == "Przetwórz też nagrania, które już są w folderze (3)"
    assert window.include_var.get() is False  # not Bandicam's folder: only new recordings unless ticked
    assert window.form_values()["include_existing"] is False

    bandicam = tmp_path / "Videos" / "Bandicam"
    (bandicam / "Audios").mkdir(parents=True)
    (bandicam / "Audios" / "lecture.mp3").write_bytes(b"")
    window.rec_var.set(str(bandicam))
    assert pump(gui.root, lambda: window.rec_count == 1)
    assert window.include_var.get() is True
    window.include_check.invoke()  # the user unticks it: kept from now on
    window.rec_var.set(str(music))
    assert pump(gui.root, lambda: window.rec_count == 3)
    assert window.include_var.get() is False
    (tmp_path / "Empty").mkdir()
    window.rec_var.set(str(tmp_path / "Empty"))
    assert pump(gui.root, lambda: window.rec_count == 0)
    assert not window.include_check.winfo_manager()
    assert window.form_values()["include_existing"] is True  # nothing to leave out: no cutoff

    window.rec_var.set(str(music))
    assert pump(gui.root, lambda: window.rec_count == 3)
    window.vault_var.set(str(tmp_path / "Vault"))
    window.submit()
    assert pump(gui.root, lambda: window.page_name == "done")
    assert installed[0].recordings_dir == str(music) and installed[0].include_existing is False


def test_unconfigured_window_fetches_only_from_the_real_site(gui, monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    # What an old unconfigured tracker saved: the placeholder site and no Supabase settings.
    (data_dir / "config.json").write_text(json.dumps({"dashboard_url": "https://mindsetforest.app",
                                                      "supabase_url": "", "supabase_anon_key": ""}))
    fetched = []
    monkeypatch.setattr(winsetup, "fetch_site_config", lambda site: fetched.append(site) or {
        "supabase_url": "https://abcd.supabase.co", "supabase_anon_key": "anon", "dashboard_url": site})
    window = setup_gui.SetupWindow(gui.root, "install", data_dir=data_dir, ops=RaisingOps(), source_exe=None)
    assert pump(gui.root, lambda: window.url_var.get() == "https://abcd.supabase.co")
    assert fetched == [winsetup.DEFAULT_SITE] and window.site_var.get() == winsetup.DEFAULT_SITE
    assert window.account_hint_var.get().endswith("Serwer logowania: abcd.supabase.co")
    window.site_var.set("https://mine.example")  # typed under Zaawansowane, then "Pobierz ustawienia"
    window.fetch_site_config()
    assert pump(gui.root, lambda: len(fetched) == 2 and not window.fetching)
    assert fetched[1] == "https://mine.example/"


def test_expired_login_shows_the_sign_in_fields(gui, monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    save_config(Config(supabase_url="https://x.supabase.co", supabase_anon_key="anon",
                       vault_dir=str(tmp_path / "Vault"), path=data_dir / "config.json"))
    _saved_session(data_dir / winsetup.SESSION_FILE, "ola@example.com")
    (data_dir / winsetup.NEEDS_LOGIN).write_text("refused")
    window = setup_gui.SetupWindow(gui.root, "settings", data_dir=data_dir, ops=RaisingOps(), source_exe=None)
    gui.root.update()
    assert window.signed_in_var.get() == "Logowanie wygasło (ola@example.com): zaloguj się ponownie"
    assert window.signin_frame.winfo_manager() and not window.other_account_button.winfo_manager()
    assert window.email_var.get() == "ola@example.com"
    form = window.form_values()
    assert form["signed_in"] is False and form["login_expired"] is True


def test_untouched_hotkey_is_not_pushed(gui, monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    save_config(Config(supabase_url="https://x.supabase.co", supabase_anon_key="anon", capture_hotkey="ctrl+f8",
                       vault_dir=str(tmp_path / "Vault"), path=data_dir / "config.json"))
    window = setup_gui.SetupWindow(gui.root, "settings", data_dir=data_dir, ops=RaisingOps(), source_exe=None)
    gui.root.update()
    assert window.hotkey_text.get() == "Ctrl + F8"  # config.json follows the dashboard's active hotkey
    assert window.form_values()["push_hotkey"] is False
    window.hotkey_var.set("")  # "Wyłącz"
    assert window.form_values()["push_hotkey"] is True
    window.hotkey_var.set("ctrl+f8")  # back to what the window showed: nothing to push
    assert window.form_values()["push_hotkey"] is False


def test_a_confirmed_hotkey_is_pushed_even_when_it_matches_the_one_shown():
    # The form may show an old zip config.json value the dashboard has since replaced;
    # confirming it in the dialog (or Wyłącz) is a choice, so it must reach the dashboard.
    class Var:
        def __init__(self):
            self.value = None

        def set(self, v):
            self.value = v

    window = type("W", (), {})()
    window.hotkey_var, window.hotkey_touched = Var(), False
    setup_gui.SetupWindow._set_hotkey(window, "alt+shift+s")
    assert window.hotkey_touched is True and window.hotkey_var.value == "alt+shift+s"
