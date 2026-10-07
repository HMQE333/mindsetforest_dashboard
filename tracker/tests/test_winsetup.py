import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from mindsetforest_tracker import __version__, config, winsetup
from mindsetforest_tracker.config import Config, load_config, save_config
from mindsetforest_tracker.winsetup import (
    EXE_NAME, LEGACY_STARTUP_LNK, QUIT_REQUEST, ROUTINE_TASK, RUN_VALUE, START_MENU_LNK, InstallResult,
    ObsidianVault, SetupChoices, SetupError, WinOps, cleanup_command, default_vault_dir, detect_bandicam_dir,
    fetch_site_config, find_legacy_install, install, install_dir, installed_exe, load_existing_config,
    merged_config, obsidian_installed, obsidian_vaults, self_test, stop_running_tracker, uninstall,
    vault_registered,
)


class FakeOps:
    """WinOps without Windows: registry and shortcuts in dicts, launches recorded."""

    def __init__(self, root: Path):
        self.run: dict[str, str] = {}
        self.uninstall_entry: dict | None = None
        self.shortcuts: dict[str, tuple[str, str, str]] = {}
        self.launched: list[tuple[list[str], Path | None]] = []
        self.deleted_later: list[list[Path]] = []
        self.bandicam: str | None = None
        self.startup = root / "Startup"
        self.programs = root / "Programs"

    def set_run(self, name, command):
        if command is None:
            self.run.pop(name, None)
        else:
            self.run[name] = command

    def get_run(self, name):
        return self.run.get(name)

    def write_uninstall_entry(self, values):
        self.uninstall_entry = None if values is None else dict(values)

    def create_shortcut(self, lnk, target, args="", workdir=None, description=""):
        lnk.parent.mkdir(parents=True, exist_ok=True)
        lnk.write_text("lnk")
        self.shortcuts[str(lnk)] = (str(target), args, str(workdir or target.parent))

    def shortcut_target(self, lnk):
        return self.shortcuts.get(str(lnk)) if lnk.is_file() else None

    def startup_dir(self):
        return self.startup

    def programs_dir(self):
        return self.programs

    def read_bandicam_output(self):
        return self.bandicam

    def launch_detached(self, argv, cwd=None):
        self.launched.append((list(argv), cwd))

    def delete_later(self, paths):
        self.deleted_later.append(list(paths))


@pytest.fixture
def env(tmp_path, monkeypatch):
    """Windows-like folders under tmp: LOCALAPPDATA, APPDATA, Documents, Videos, the data dir."""
    local, roaming = tmp_path / "local", tmp_path / "roaming"
    docs, videos = tmp_path / "Documents", tmp_path / "Videos"
    for p in (local, roaming, docs, videos):
        p.mkdir()
    monkeypatch.setenv("LOCALAPPDATA", str(local))
    monkeypatch.setenv("APPDATA", str(roaming))
    for module in (config, winsetup):
        monkeypatch.setattr(module, "documents_dir", lambda: docs)
        monkeypatch.setattr(module, "videos_dir", lambda: videos)
    monkeypatch.setattr(winsetup, "_retry_sleep", lambda s: None)
    source = tmp_path / "Downloads" / "MindsetForestSetup.exe"
    source.parent.mkdir()
    source.write_bytes(b"new exe")

    class Env:
        pass

    e = Env()
    e.tmp, e.local, e.roaming, e.docs, e.videos, e.source = tmp_path, local, roaming, docs, videos, source
    e.data = tmp_path / "data"
    e.ops = FakeOps(tmp_path / "shell")
    return e


def choices(env, **kw):
    values = dict(supabase_url="https://x.supabase.co/", supabase_anon_key="anon",
                  dashboard_url="https://site.example/", recordings_dir=str(env.docs / "Bandicam"),
                  vault_dir=str(env.tmp / "My Vault"), capture_hotkey="alt+shift+s")
    values.update(kw)
    return SetupChoices(**values)


def read_config(env) -> dict:
    return json.loads((env.data / "config.json").read_text(encoding="utf-8"))


# -- install ---------------------------------------------------------------------


def test_fresh_install_copies_registers_and_starts(env):
    lines = []
    result = install(choices(env), data_dir=env.data, source_exe=env.source, ops=env.ops, progress=lines.append)
    exe = env.local / "Programs" / "MindsetForest" / EXE_NAME
    assert isinstance(result, InstallResult) and result.exe == exe == installed_exe()
    assert exe.read_bytes() == b"new exe" and not exe.with_name(EXE_NAME + ".new").exists()
    data = read_config(env)
    assert result.config_path == env.data / "config.json"
    assert data["supabase_url"] == "https://x.supabase.co" and data["supabase_anon_key"] == "anon"
    assert data["dashboard_url"] == "https://site.example/"
    assert data["vault_dir"] == str(env.tmp / "My Vault") and data["recordings_dir"] == str(env.docs / "Bandicam")
    assert data["capture_hotkey"] == "alt+shift+s" and data["capture_hotkey_push"] is True
    assert result.vault == env.tmp / "My Vault"
    assert (result.vault / "_SYSTEM" / "routine-prompt.md").is_file()
    assert (result.vault / "_SYSTEM" / "processing-rules.md").is_file()
    assert (env.docs / "Bandicam").is_dir()  # Bandicam's default folder is created, harmlessly
    assert env.ops.run == {RUN_VALUE: f'"{exe}"'}
    lnk = env.ops.programs / START_MENU_LNK
    assert lnk.is_file() and env.ops.shortcuts[str(lnk)][0] == str(exe)
    entry = env.ops.uninstall_entry
    assert entry["DisplayName"] == "MindsetForest Tracker" and entry["DisplayVersion"] == __version__
    assert entry["Publisher"] == "MindsetForest" and entry["InstallLocation"] == str(install_dir())
    assert entry["DisplayIcon"] == f'"{exe}"' and entry["UninstallString"] == f'"{exe}" --uninstall'
    assert entry["NoModify"] == 1 and entry["NoRepair"] == 1
    assert env.ops.launched == [([str(exe)], exe.parent)]
    assert result.started and not result.legacy_removed
    assert lines and lines[0] == "Sprawdzam ustawienia..." and lines[-1] == "Uruchamiam tracker..."
    assert all("—" not in line for line in lines + result.messages)
    assert any(m.startswith("Zainstalowano tracker") for m in result.messages)


def test_install_messages_always_end_with_the_claude_routine(env):
    result = install(choices(env), data_dir=env.data, source_exe=env.source, ops=env.ops)
    vault = env.tmp / "My Vault"
    assert "rutynę Claude" in result.messages[-2] and str(vault) in result.messages[-2]
    assert result.messages[-1] == "Polecenie rutyny: " + ROUTINE_TASK.format(vault=vault)


def test_upgrade_keeps_unasked_config_fields_and_login(env):
    env.data.mkdir()
    (env.data / "config.json").write_text(json.dumps({
        "supabase_url": "https://old.supabase.co", "supabase_anon_key": "old", "ignored_apps": ["Steam"],
        "private_keywords": ["bank"], "idle_minutes": 5, "sync_seconds": 120, "session_gap_minutes": 30,
        "device_name": "desk", "capture_hotkey": "alt+shift+s", "capture_hotkey_push": False,
    }))
    (env.data / "session.bin").write_bytes(b"MFPLAIN1secret")
    (env.data / "tracker.db").write_bytes(b"db")
    exe = installed_exe()
    exe.parent.mkdir(parents=True)
    exe.write_bytes(b"old exe")
    result = install(choices(env, vault_dir=str(env.tmp / "Other Vault")), data_dir=env.data,
                     source_exe=env.source, ops=env.ops)
    data = read_config(env)
    assert exe.read_bytes() == b"new exe" and not exe.with_name(EXE_NAME + ".old").exists()
    assert data["ignored_apps"] == ["Steam"] and data["private_keywords"] == ["bank"]
    assert data["idle_minutes"] == 5 and data["sync_seconds"] == 120 and data["session_gap_minutes"] == 30
    assert data["device_name"] == "desk"
    assert data["supabase_url"] == "https://x.supabase.co" and data["vault_dir"] == str(env.tmp / "Other Vault")
    assert data["capture_hotkey_push"] is False  # same hotkey: nothing to push
    assert (env.data / "session.bin").read_bytes() == b"MFPLAIN1secret"
    assert (env.data / "tracker.db").read_bytes() == b"db"
    assert any(m.startswith("Zaktualizowano tracker") for m in result.messages)


def test_a_sign_in_from_the_setup_window_replaces_the_login_only_after_the_tracker_stopped(env, monkeypatch):
    env.data.mkdir()
    (env.data / "session.bin").write_bytes(b"MFPLAIN1old")
    (env.data / winsetup.PENDING_SESSION).write_bytes(b"MFPLAIN1new")
    order = []

    def stop(data_dir, *a, **kw):
        # The running tracker may still save its own rotated token while it stops.
        order.append((data_dir / "session.bin").read_bytes())
        (data_dir / "session.bin").write_bytes(b"MFPLAIN1rotated-old")
        return True

    monkeypatch.setattr(winsetup, "stop_running_tracker", stop)
    result = install(choices(env), data_dir=env.data, source_exe=env.source, ops=env.ops)
    assert order == [b"MFPLAIN1old"]
    assert (env.data / "session.bin").read_bytes() == b"MFPLAIN1new"
    assert not (env.data / winsetup.PENDING_SESSION).exists()
    assert "Zapisano nowe logowanie." in result.messages
    # Nothing pending: the saved login is left alone.
    assert winsetup.adopt_pending_session(env.data) is False
    assert (env.data / "session.bin").read_bytes() == b"MFPLAIN1new"


def test_install_from_the_installed_exe_skips_the_copy(env):
    install(choices(env), data_dir=env.data, source_exe=env.source, ops=env.ops)
    exe = installed_exe()
    exe.write_bytes(b"installed")
    result = install(choices(env), data_dir=env.data, source_exe=exe, ops=env.ops)
    assert exe.read_bytes() == b"installed" and result.started


def test_copy_retries_while_the_exe_is_locked(env, monkeypatch):
    calls = {"n": 0}
    real_replace = os.replace

    def flaky(src, dst):
        calls["n"] += 1
        if calls["n"] <= 4:
            raise PermissionError("in use")
        return real_replace(src, dst)

    monkeypatch.setattr(winsetup.os, "replace", flaky)
    install(choices(env), data_dir=env.data, source_exe=env.source, ops=env.ops)
    assert installed_exe().read_bytes() == b"new exe"


def test_copy_gives_up_with_a_polish_error(env, monkeypatch):
    def locked(src, dst):
        raise PermissionError("in use")

    exe = installed_exe()
    exe.parent.mkdir(parents=True)
    exe.write_bytes(b"old exe")
    monkeypatch.setattr(winsetup.os, "replace", locked)
    with pytest.raises(SetupError, match="Nie mogę podmienić"):
        install(choices(env), data_dir=env.data, source_exe=env.source, ops=env.ops)
    assert exe.read_bytes() == b"old exe" and not exe.with_name(EXE_NAME + ".new").exists()


@pytest.mark.parametrize("change", [{"vault_dir": "  "}, {"capture_hotkey": "s"}, {"capture_hotkey": "alt+shift+?"},
                                    {"capture_hotkey": "ctrl+a+b"}])
def test_install_rejects_bad_choices_before_touching_anything(env, change):
    with pytest.raises(SetupError):
        install(choices(env, **change), data_dir=env.data, source_exe=env.source, ops=env.ops)
    assert not installed_exe().exists() and not (env.data / "config.json").exists()
    assert env.ops.run == {} and env.ops.launched == []


def test_hotkey_off_is_valid(env):
    install(choices(env, capture_hotkey=""), data_dir=env.data, source_exe=env.source, ops=env.ops)
    data = read_config(env)
    assert data["capture_hotkey"] == "" and data["capture_hotkey_push"] is True


def test_autostart_off_deletes_the_run_value(env):
    env.ops.run[RUN_VALUE] = '"C:\\old.exe"'
    result = install(choices(env, autostart=False), data_dir=env.data, source_exe=env.source, ops=env.ops)
    assert RUN_VALUE not in env.ops.run
    assert any("Autostart wyłączony" in m for m in result.messages)


def test_autostart_failure_is_a_message_not_an_abort(env):
    def broken(name, command):
        raise OSError("access denied")

    env.ops.set_run = broken
    result = install(choices(env), data_dir=env.data, source_exe=env.source, ops=env.ops)
    assert result.started and any("autostartu" in m and "access denied" in m for m in result.messages)


def test_launch_failure_reports_not_started(env):
    def broken(argv, cwd=None):
        raise OSError("no")

    env.ops.launch_detached = broken
    result = install(choices(env), data_dir=env.data, source_exe=env.source, ops=env.ops)
    assert not result.started and any("Nie udało się uruchomić" in m for m in result.messages)


def test_no_launch(env):
    (env.data).mkdir()
    (env.data / QUIT_REQUEST).write_text("quit")
    result = install(choices(env), data_dir=env.data, source_exe=env.source, ops=env.ops, launch=False)
    assert not result.started and env.ops.launched == []
    assert not (env.data / QUIT_REQUEST).exists()


def test_dev_mode_runs_from_the_sources(env):
    result = install(choices(env), data_dir=env.data, source_exe=None, ops=env.ops)
    script = Path(winsetup.__file__).resolve().parent.parent / "run_tracker.py"
    assert not installed_exe().exists() and result.exe == script
    assert env.ops.launched == [([sys.executable, str(script)], script.parent)]
    assert env.ops.run[RUN_VALUE] == f'"{sys.executable}" "{script}"'
    assert env.ops.uninstall_entry is None and env.ops.shortcuts == {}
    assert (env.data / "config.json").is_file() and result.started


def test_recordings_folder_is_created_only_for_the_bandicam_default(env):
    elsewhere = env.tmp / "Nagrania"
    result = install(choices(env, recordings_dir=str(elsewhere)), data_dir=env.data, source_exe=env.source,
                     ops=env.ops)
    assert not elsewhere.exists() and not (env.docs / "Bandicam").exists()
    assert any("jeszcze nie istnieje" in m for m in result.messages)
    result = install(choices(env, recordings_dir=""), data_dir=env.data, source_exe=env.source, ops=env.ops)
    assert read_config(env)["recordings_dir"] == ""
    assert "Transkrypcja nagrań wyłączona." in result.messages


def test_install_stops_the_running_tracker_first(env, monkeypatch):
    seen = []
    monkeypatch.setattr(winsetup, "stop_running_tracker", lambda data_dir: seen.append(data_dir) or True)
    result = install(choices(env), data_dir=env.data, source_exe=env.source, ops=env.ops)
    assert seen == [env.data] and "Zatrzymano działający tracker." in result.messages


# -- legacy zip install ----------------------------------------------------------


def legacy_folder(env, with_config=True):
    folder = env.tmp / "mindsetforest-tracker"
    folder.mkdir()
    (folder / "run_tracker.py").write_text("")
    if with_config:
        (folder / "config.json").write_text(json.dumps({
            "supabase_url": "https://legacy.supabase.co", "supabase_anon_key": "k", "ignored_apps": ["Steam"],
            "capture_hotkey": "alt+shift+s",
        }))
    env.ops.create_shortcut(env.ops.startup / LEGACY_STARTUP_LNK, Path("C:/Python/pythonw.exe"),
                            args="run_tracker.py", workdir=folder)
    return folder


def test_find_legacy_install(env):
    assert find_legacy_install(env.ops) is None
    folder = legacy_folder(env)
    assert find_legacy_install(env.ops) == folder
    (folder / "run_tracker.py").unlink()
    assert find_legacy_install(env.ops) is None


def test_find_legacy_install_old_one_folder_exe(env):
    folder = env.tmp / "dist" / "MindsetForestTracker"
    folder.mkdir(parents=True)
    (folder / EXE_NAME).write_bytes(b"old")
    env.ops.create_shortcut(env.ops.startup / LEGACY_STARTUP_LNK, folder / EXE_NAME, workdir=folder)
    assert find_legacy_install(env.ops) == folder


def test_find_legacy_install_survives_ops_errors(env):
    class Broken(FakeOps):
        def startup_dir(self):
            raise NotImplementedError

    assert find_legacy_install(Broken(env.tmp)) is None
    assert find_legacy_install(WinOps()) is None or sys.platform == "win32"


def test_install_removes_the_legacy_shortcut_and_migrates_its_config(env):
    folder = legacy_folder(env)
    result = install(choices(env, supabase_url="", supabase_anon_key=""), data_dir=env.data,
                     source_exe=env.source, ops=env.ops)
    assert result.legacy_removed and not (env.ops.startup / LEGACY_STARTUP_LNK).exists()
    assert (folder / "run_tracker.py").is_file() and (folder / "config.json").is_file()  # folder untouched
    data = read_config(env)
    assert data["ignored_apps"] == ["Steam"] and data["supabase_url"] == "https://legacy.supabase.co"
    assert data["capture_hotkey_push"] is False
    assert any(str(folder) in m for m in result.messages)


def test_data_dir_config_wins_over_the_legacy_one(env):
    folder = legacy_folder(env)
    env.data.mkdir()
    save_config(Config(supabase_url="https://data.supabase.co", path=env.data / "config.json"))
    assert load_existing_config(env.data, folder).supabase_url == "https://data.supabase.co"
    assert load_existing_config(env.tmp / "empty", folder).supabase_url == "https://legacy.supabase.co"
    assert load_existing_config(env.tmp / "empty", None) is None


# -- merged_config ---------------------------------------------------------------


def test_hotkey_push_rules(env):
    data = env.data
    assert merged_config(None, choices(env), data).capture_hotkey_push is True
    old = Config(capture_hotkey="alt+shift+s", capture_hotkey_push=False)
    assert merged_config(old, choices(env, capture_hotkey="ALT+Shift+S "), data).capture_hotkey_push is False
    assert merged_config(old, choices(env, capture_hotkey="ctrl+shift+k"), data).capture_hotkey_push is True
    assert merged_config(old, choices(env, capture_hotkey=""), data).capture_hotkey_push is True
    pending = Config(capture_hotkey="alt+shift+s", capture_hotkey_push=True)
    assert merged_config(pending, choices(env), data).capture_hotkey_push is True  # not pushed yet: keep it
    off = Config(capture_hotkey="", capture_hotkey_push=False)
    assert merged_config(off, choices(env, capture_hotkey=""), data).capture_hotkey_push is False


def test_merged_config_keeps_existing_and_does_not_mutate_it(env):
    old = Config(ignored_apps=["Steam"], device_name="desk", supabase_url="https://keep.supabase.co",
                 supabase_anon_key="keep", tick_seconds=2)
    cfg = merged_config(old, choices(env, supabase_url="", supabase_anon_key="", device_name=""), env.data)
    assert cfg.supabase_url == "https://keep.supabase.co" and cfg.supabase_anon_key == "keep"
    assert cfg.ignored_apps == ["Steam"] and cfg.ignored_apps is not old.ignored_apps
    assert cfg.device_name == "desk" and cfg.tick_seconds == 2 and cfg.path == env.data / "config.json"
    assert merged_config(old, choices(env, device_name=" laptop "), env.data).device_name == "laptop"
    assert old.path is None and old.vault_dir != cfg.vault_dir


# -- stopping the tracker --------------------------------------------------------

WAITS_FOR_QUIT = (
    "import pathlib, sys, time\n"
    "q = pathlib.Path(sys.argv[1])\n"
    "for _ in range(400):\n"
    "    if q.exists(): sys.exit(0)\n"
    "    time.sleep(0.05)\n"
)


def write_lock(env, pid):
    env.data.mkdir(exist_ok=True)
    (env.data / "tracker.lock").write_text(str(pid))


def test_stop_without_a_lock_cleans_a_leftover_quit_request(env):
    env.data.mkdir()
    (env.data / QUIT_REQUEST).write_text("quit")
    assert stop_running_tracker(env.data, is_tracker=lambda pid: True) is False
    assert not (env.data / QUIT_REQUEST).exists()


def test_stop_ignores_self_strangers_and_dead_pids(env):
    write_lock(env, os.getpid())
    assert stop_running_tracker(env.data, is_tracker=lambda pid: True) is False
    write_lock(env, 1)
    assert stop_running_tracker(env.data, is_tracker=lambda pid: False) is False
    dead = subprocess.Popen([sys.executable, "-c", "pass"])
    dead.wait()
    write_lock(env, dead.pid)
    assert stop_running_tracker(env.data, is_tracker=lambda pid: True) is False
    (env.data / "tracker.lock").write_text("garbage")
    assert stop_running_tracker(env.data, is_tracker=lambda pid: True) is False


def test_stop_asks_politely_and_the_tracker_quits(env):
    env.data.mkdir()
    child = subprocess.Popen([sys.executable, "-c", WAITS_FOR_QUIT, str(env.data / QUIT_REQUEST)])
    try:
        write_lock(env, child.pid)
        started = time.monotonic()
        assert stop_running_tracker(env.data, timeout=10, is_tracker=lambda pid: pid == child.pid) is True
        assert time.monotonic() - started < 8
        assert child.wait(timeout=5) == 0  # exited by itself, not killed
        assert not (env.data / QUIT_REQUEST).exists()
    finally:
        child.kill()


def test_stop_terminates_a_tracker_that_ignores_the_request(env):
    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
    try:
        write_lock(env, child.pid)
        assert stop_running_tracker(env.data, timeout=0.3, is_tracker=lambda pid: True) is True
        child.wait(timeout=5)  # psutil reaped it, so the return code is meaningless; a 60 s sleep ended
        assert not (env.data / QUIT_REQUEST).exists()
    finally:
        child.kill()


def test_stop_uses_the_injected_clock(env):
    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
    now = {"t": 0.0}
    sleeps = []

    def sleep(s):
        sleeps.append(s)
        now["t"] += s

    try:
        write_lock(env, child.pid)
        assert stop_running_tracker(env.data, timeout=2, is_tracker=lambda pid: True, sleep=sleep,
                                    clock=lambda: now["t"]) is True
        assert 9 <= len(sleeps) <= 11  # 2 s of 0.2 s polls, then terminate
        child.wait(timeout=5)
    finally:
        child.kill()


# -- uninstall -------------------------------------------------------------------


def installed(env):
    install(choices(env), data_dir=env.data, source_exe=env.source, ops=env.ops)
    (install_dir() / "extra.dll").write_bytes(b"x")
    (install_dir() / "sub").mkdir()
    (install_dir() / "sub" / "f.txt").write_text("x")
    return installed_exe()


def test_uninstall_from_the_installed_exe_defers_its_own_file(env):
    exe = installed(env)
    messages = uninstall(data_dir=env.data, ops=env.ops, running_exe=exe)
    assert env.ops.run == {} and env.ops.uninstall_entry is None
    assert not (env.ops.programs / START_MENU_LNK).exists()
    assert exe.exists() and sorted(p.name for p in install_dir().iterdir()) == [EXE_NAME]
    assert env.ops.deleted_later == [[exe, install_dir()]]
    assert (env.data / "config.json").is_file()  # data kept by default
    assert (env.tmp / "My Vault" / "_SYSTEM").is_dir()
    assert messages[-1] == "Vault Obsidian i nagrania zostają nietknięte."
    assert all("—" not in m for m in messages)


def test_uninstall_from_elsewhere_deletes_everything_now(env):
    installed(env)
    uninstall(data_dir=env.data, ops=env.ops, running_exe=env.source)
    assert not install_dir().exists() and env.ops.deleted_later == []
    assert env.source.exists()


def test_uninstall_remove_data_never_touches_vault_or_recordings(env):
    installed(env)
    # A vault and recordings folder inside the data dir (odd, but possible) must survive.
    inner_vault = env.data / "vault"
    inner_rec = env.data / "rec"
    for p in (inner_vault, inner_rec):
        p.mkdir()
        (p / "note.md").write_text("keep")
    cfg = load_config(env.data / "config.json")
    cfg.vault_dir, cfg.recordings_dir = str(inner_vault), str(inner_rec)
    save_config(cfg)
    (env.data / "session.bin").write_bytes(b"x")
    uninstall(data_dir=env.data, ops=env.ops, remove_data=True)
    assert (inner_vault / "note.md").read_text() == "keep" and (inner_rec / "note.md").read_text() == "keep"
    assert sorted(p.name for p in env.data.iterdir()) == ["rec", "vault"]


def test_uninstall_remove_data_deletes_the_data_dir(env):
    installed(env)
    uninstall(data_dir=env.data, ops=env.ops, remove_data=True)
    assert not env.data.exists() and (env.tmp / "My Vault" / "_SYSTEM").is_dir()


def test_uninstall_stops_the_tracker_and_removes_the_legacy_shortcut(env, monkeypatch):
    legacy_folder(env)
    monkeypatch.setattr(winsetup, "stop_running_tracker", lambda data_dir: True)
    messages = uninstall(data_dir=env.data, ops=env.ops)
    assert "Zatrzymano tracker." in messages
    assert not (env.ops.startup / LEGACY_STARTUP_LNK).exists()


def test_uninstall_reports_failures_and_carries_on(env):
    exe = installed(env)

    def broken(values):
        raise OSError("denied")

    env.ops.write_uninstall_entry = broken
    messages = uninstall(data_dir=env.data, ops=env.ops, running_exe=exe)
    assert any("wpis w Aplikacjach" in m and "denied" in m for m in messages)
    assert env.ops.run == {} and env.ops.deleted_later == [[exe, install_dir()]]


def test_uninstall_never_schedules_a_folder_holding_the_vault(env):
    exe = installed(env)
    vault = install_dir() / "vault"
    vault.mkdir()
    (vault / "note.md").write_text("keep")
    cfg = load_config(env.data / "config.json")
    cfg.vault_dir = str(vault)
    save_config(cfg)
    uninstall(data_dir=env.data, ops=env.ops, running_exe=exe)
    assert (vault / "note.md").read_text() == "keep" and not (install_dir() / "extra.dll").exists()
    assert env.ops.deleted_later == [[exe]]


def test_child_env_drops_pyinstaller_bootstrap_variables(monkeypatch):
    monkeypatch.setenv("_PYI_ARCHIVE_FILE", "x")
    monkeypatch.setenv("_MEIPASS2", "y")
    monkeypatch.setenv("MF_KEEP", "z")
    child = winsetup._child_env({"MF_DELETE_0": "a"})
    assert "_PYI_ARCHIVE_FILE" not in child and "_MEIPASS2" not in child
    assert child["MF_KEEP"] == "z" and child["MF_DELETE_0"] == "a" and child["PYINSTALLER_RESET_ENVIRONMENT"] == "1"


def test_cleanup_command_passes_paths_through_variables(tmp_path):
    folder = tmp_path / "Prog & (x) 100%"
    folder.mkdir()
    exe = folder / EXE_NAME
    exe.write_bytes(b"x")
    command, variables = cleanup_command([exe, folder], comspec="C:\\Windows\\system32\\cmd.exe")
    assert variables == {"MF_DELETE_0": str(exe), "MF_DELETE_1": str(folder)}
    assert command.startswith('"C:\\Windows\\system32\\cmd.exe" /d /s /c "ping -n 3 127.0.0.1 >nul & ')
    assert command.count('del /f /q "%MF_DELETE_0%"') == 2 and command.count('rmdir /s /q "%MF_DELETE_1%"') == 2
    assert str(folder) not in command and command.endswith('"')


# -- detection -------------------------------------------------------------------


def test_bandicam_registry_wins_and_expands_variables(env, monkeypatch):
    monkeypatch.setenv("MF_TEST_HOME", str(env.tmp))
    (env.docs / "Bandicam").mkdir()
    env.ops.bandicam = '"%MF_TEST_HOME%/rec"'
    assert detect_bandicam_dir(env.ops) == (Path(f"{env.tmp}/rec"), "bandicam")


def test_bandicam_detection_order(env):
    env.ops.bandicam = "   "
    assert detect_bandicam_dir(env.ops) == (env.docs / "Bandicam", "default")
    (env.videos / "Bandicam").mkdir()
    assert detect_bandicam_dir(env.ops) == (env.videos / "Bandicam", "videos")
    (env.docs / "Bandicam").mkdir()
    assert detect_bandicam_dir(env.ops) == (env.docs / "Bandicam", "documents")


def test_bandicam_registry_error_falls_back(env):
    class Broken(FakeOps):
        def read_bandicam_output(self):
            raise OSError("no access")

    assert detect_bandicam_dir(Broken(env.tmp)) == (env.docs / "Bandicam", "default")


def write_obsidian(env, data, raw: bytes | None = None):
    folder = env.roaming / "obsidian"
    folder.mkdir(exist_ok=True)
    path = folder / "obsidian.json"
    path.write_bytes(raw if raw is not None else json.dumps(data).encode("utf-8"))
    return path


def test_obsidian_vaults_newest_first_existing_only(env):
    a, b = env.tmp / "A", env.tmp / "B"
    a.mkdir()
    b.mkdir()
    path = write_obsidian(env, {"vaults": {
        "aaaaaaaaaaaaaaaa": {"path": str(a), "ts": 100, "open": False},
        "bbbbbbbbbbbbbbbb": {"path": str(b), "ts": 300, "open": True},
        "cccccccccccccccc": {"path": str(env.tmp / "gone"), "ts": 999},
        "dddddddddddddddd": {"ts": 5},
        "eeeeeeeeeeeeeeee": "not a dict",
    }, "frame": "hidden"})
    before = path.read_bytes()
    assert obsidian_vaults() == [ObsidianVault(b, "bbbbbbbbbbbbbbbb", 300), ObsidianVault(a, "aaaaaaaaaaaaaaaa", 100)]
    assert obsidian_vaults(env.roaming) == obsidian_vaults()
    assert path.read_bytes() == before  # never written
    assert obsidian_installed() and obsidian_installed(env.roaming)


def test_obsidian_vaults_reads_a_bom(env):
    a = env.tmp / "A"
    a.mkdir()
    write_obsidian(env, None, raw=b"\xef\xbb\xbf" + json.dumps({"vaults": {"x": {"path": str(a)}}}).encode())
    assert obsidian_vaults() == [ObsidianVault(a, "x", 0)]


@pytest.mark.parametrize("raw", [b"{not json", b"[]", b'{"vaults": []}', b'{"vaults": null}', b"\xff\xfe\x00"])
def test_obsidian_vaults_bad_files_give_nothing(env, raw):
    write_obsidian(env, None, raw=raw)
    assert obsidian_vaults() == []


def test_obsidian_vaults_missing(env):
    assert obsidian_vaults() == [] and not obsidian_installed()


def test_obsidian_vaults_retries_a_half_written_file(env, monkeypatch):
    a = env.tmp / "A"
    a.mkdir()
    path = write_obsidian(env, None, raw=b'{"vaults": {"x": {"pa')
    sleeps = []

    def finish_writing(seconds):
        sleeps.append(seconds)
        path.write_text(json.dumps({"vaults": {"x": {"path": str(a), "ts": 1}}}))

    monkeypatch.setattr(winsetup, "_retry_sleep", finish_writing)
    assert obsidian_vaults() == [ObsidianVault(a, "x", 1)] and len(sleeps) == 1


def test_obsidian_vaults_gives_up_after_three_tries(env, monkeypatch):
    write_obsidian(env, None, raw=b"{half")
    sleeps = []
    monkeypatch.setattr(winsetup, "_retry_sleep", sleeps.append)
    assert obsidian_vaults() == [] and len(sleeps) == 2


def test_vault_registered_matches_the_same_folder(env):
    a = env.tmp / "Vault"
    a.mkdir()
    vaults = [ObsidianVault(env.tmp, "root", 2), ObsidianVault(a, "abc", 1)]
    assert vault_registered(env.tmp / "x" / ".." / "Vault", vaults).id == "abc"
    assert vault_registered(Path(str(a) + os.sep), vaults).id == "abc"
    assert vault_registered(env.tmp / "Vault2", vaults) is None
    assert vault_registered(a, []) is None


def test_folders(env, monkeypatch):
    assert install_dir() == env.local / "Programs" / "MindsetForest"
    assert installed_exe() == install_dir() / "MindsetForestTracker.exe"
    assert default_vault_dir() == env.docs / "MindsetForest Vault"
    monkeypatch.delenv("LOCALAPPDATA")
    assert install_dir() == Path.home() / "AppData" / "Local" / "Programs" / "MindsetForest"


# -- dashboard settings ----------------------------------------------------------


class FakeResponse:
    def __init__(self, status, body):
        self.status_code = status
        self.body = body

    def json(self):
        if isinstance(self.body, Exception):
            raise self.body
        return self.body


class FakeHttp:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def get(self, url, timeout):
        self.calls.append((url, timeout))
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def test_fetch_site_config_good():
    http = FakeHttp(FakeResponse(200, {"supabase_url": "https://p.supabase.co/", "supabase_anon_key": " key "}))
    got = fetch_site_config("https://u.github.io/dash", http=http, timeout=3)
    assert http.calls == [("https://u.github.io/dash/downloads/tracker-config.json", 3)]
    assert got == {"supabase_url": "https://p.supabase.co", "supabase_anon_key": "key",
                   "dashboard_url": "https://u.github.io/dash/"}
    fetch_site_config(winsetup.DEFAULT_SITE, http=http)
    assert http.calls[-1][0] == "https://hmqe333.github.io/mindsetforest_dashboard/downloads/tracker-config.json"


@pytest.mark.parametrize("response", [
    FakeResponse(404, {}),
    FakeResponse(200, ValueError("not json")),
    FakeResponse(200, ["a"]),
    FakeResponse(200, {"supabase_url": "https://p.supabase.co"}),
    FakeResponse(200, {"supabase_url": "p.supabase.co", "supabase_anon_key": "k"}),
    FakeResponse(200, {"supabase_url": "https://p.supabase.co", "supabase_anon_key": ""}),
    ConnectionError("offline"),
])
def test_fetch_site_config_failures_are_setup_errors(response):
    with pytest.raises(SetupError) as err:
        fetch_site_config("https://u.github.io/dash/", http=FakeHttp(response))
    assert "Zaawansowane" in str(err.value)


def test_fetch_site_config_needs_a_site():
    with pytest.raises(SetupError):
        fetch_site_config("  ", http=FakeHttp(FakeResponse(200, {})))


# -- WinOps off Windows, self-test, config additions -------------------------------


@pytest.mark.skipif(sys.platform == "win32", reason="checks the non-Windows fallbacks")
def test_winops_off_windows(tmp_path):
    ops = WinOps()
    ops.set_run("x", "y")
    ops.write_uninstall_entry({"a": 1})
    ops.delete_later([tmp_path])
    assert tmp_path.exists()
    assert ops.get_run("x") is None and ops.read_bandicam_output() is None
    assert ops.shortcut_target(tmp_path / "a.lnk") is None
    for call in (ops.startup_dir, ops.programs_dir, lambda: ops.launch_detached(["x"]),
                 lambda: ops.create_shortcut(tmp_path / "a.lnk", tmp_path)):
        with pytest.raises(NotImplementedError):
            call()


def test_self_test_writes_every_check(env):
    env.ops.startup.mkdir(parents=True)
    env.ops.programs.mkdir(parents=True)
    out = env.tmp / "out" / "st.json"
    ok = self_test(out, env.ops)
    report = json.loads(out.read_text(encoding="utf-8"))
    assert report["ok"] is ok and report["version"] == __version__
    checks = report["checks"]
    assert {"tkinter", "pystray", "pillow", "dpapi", "shortcut", "registry_run", "known_folders", "documents_dir",
            "detect_bandicam_dir", "obsidian_vaults", "parse_hotkey"} <= set(checks)
    for name in ("dpapi", "shortcut", "registry_run", "known_folders", "documents_dir", "detect_bandicam_dir",
                 "obsidian_vaults", "parse_hotkey"):
        assert checks[name] == "ok", (name, checks[name])
    assert env.ops.run == {} and env.ops.shortcuts  # test value removed again
    assert ok == all(v == "ok" for v in checks.values())


def test_self_test_reports_a_failing_check(env):
    class NoShortcuts(FakeOps):
        def shortcut_target(self, lnk):
            return None

    out = env.tmp / "st.json"
    assert self_test(out, NoShortcuts(env.tmp)) is False
    report = json.loads(out.read_text(encoding="utf-8"))
    assert report["ok"] is False and report["checks"]["shortcut"].startswith("RuntimeError")


def test_config_folders_off_windows():
    if sys.platform != "win32":
        assert config.documents_dir() == Path.home() / "Documents"
        assert config.videos_dir() == Path.home() / "Videos"
    assert config.documents_dir().is_absolute() and config.videos_dir().is_absolute()


def test_config_defaults_use_documents_dir(env):
    cfg = Config()
    assert cfg.recordings_dir == str(env.docs / "Bandicam")
    assert cfg.vault_dir == str(env.docs / "MindsetForest Vault")
    assert cfg.capture_hotkey_push is False


def test_capture_hotkey_push_round_trip(tmp_path):
    cfg = load_config(tmp_path / "config.json")
    assert cfg.capture_hotkey_push is False
    cfg.capture_hotkey_push = True
    save_config(cfg)
    assert json.loads((tmp_path / "config.json").read_text())["capture_hotkey_push"] is True
    assert load_config(tmp_path / "config.json").capture_hotkey_push is True
    (tmp_path / "config.json").write_text(json.dumps({"capture_hotkey_push": "false"}))
    assert load_config(tmp_path / "config.json").capture_hotkey_push is False
