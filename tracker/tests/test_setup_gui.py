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
    choices_from_form,
    claude_desktop_installed,
    clean_path,
    done_messages,
    hotkey_from_event,
    hotkey_label,
    hotkey_problem,
    initial_form,
    obsidian_action,
    pressed_label,
    recordings_hint,
    routine_text,
    signin_error_text,
    validate,
    vault_choices,
)

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
    for folder in (local / "AnthropicClaude", local / "Programs" / "claude", roaming / "Claude"):
        folder.mkdir(parents=True)
        assert claude_desktop_installed(env)
        folder.rmdir()


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

    def fake_install(choices, *, data_dir, source_exe, ops, launch, progress):
        progress("Kopiuję program...")
        installed.append(choices)
        return _result(Path(choices.vault_dir))

    monkeypatch.setattr(winsetup, "install", fake_install)
    window = setup_gui.SetupWindow(gui.root, "install", data_dir=data_dir, ops=RaisingOps(), source_exe=None)
    assert pump(gui.root, lambda: window.url_var.get() == "https://x.supabase.co")
    assert fetched == [winsetup.DEFAULT_SITE]
    assert "Zainstaluj i uruchom" in texts(window.page)
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
    monkeypatch.setattr(winsetup, "uninstall", lambda **kw: removed.append(kw) or ["Usunięto program."])

    window = setup_gui.SetupWindow(gui.root, "settings", data_dir=data_dir, ops=RaisingOps(), source_exe=None)
    gui.root.update()
    assert window.account_email == "ola@example.com"
    shown = texts(window.page)
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
    assert session_path == tmp_path / "data" / "session.bin"
