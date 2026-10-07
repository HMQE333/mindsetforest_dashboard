import json
import socket

from mindsetforest_tracker import config
from mindsetforest_tracker.config import (
    DEFAULT_DASHBOARD_URL, LEGACY_DASHBOARD_URLS, Config, app_data_dir, config_search_paths, exe_dir, legacy_or_known,
    load_config, save_config,
)


def test_defaults_when_file_missing(tmp_path):
    cfg = load_config(tmp_path / "config.json")
    assert cfg.supabase_url == "" and cfg.supabase_anon_key == ""
    # The real dashboard: the zip version's placeholder domain is registered to nobody.
    assert cfg.dashboard_url == DEFAULT_DASHBOARD_URL == "https://hmqe333.github.io/mindsetforest_dashboard/"
    assert "https://mindsetforest.app" in LEGACY_DASHBOARD_URLS and cfg.dashboard_url not in LEGACY_DASHBOARD_URLS
    assert cfg.recordings_since == 0.0
    assert (cfg.idle_minutes, cfg.tick_seconds, cfg.sync_seconds, cfg.min_session_seconds) == (3.0, 1.0, 60.0, 2)
    assert cfg.device_name == socket.gethostname() and cfg.ignored_apps == []
    assert cfg.path == tmp_path / "config.json"


def test_load_overrides_clamps_and_ignores_unknown_keys(tmp_path):
    path = tmp_path / "config.json"
    path.write_text(json.dumps({
        "supabase_url": "https://x.supabase.co/", "supabase_anon_key": "k", "idle_minutes": 5,
        "tick_seconds": 0, "sync_seconds": 5, "device_name": "desk", "ignored_apps": ["Steam"],
        "something_new": 1,
    }))
    cfg = load_config(path)
    assert cfg.supabase_url == "https://x.supabase.co" and cfg.supabase_anon_key == "k"
    assert cfg.idle_minutes == 5 and cfg.tick_seconds == 0.2 and cfg.sync_seconds == 10
    assert cfg.device_name == "desk" and cfg.is_ignored("steam") and not cfg.is_ignored("Code")


def test_corrupt_file_falls_back_to_defaults(tmp_path):
    path = tmp_path / "config.json"
    path.write_text("{not json")
    assert load_config(path).idle_minutes == 3.0


def test_save_round_trip_with_ignored_apps(tmp_path):
    cfg = load_config(tmp_path / "config.json")
    cfg.ignored_apps.append("Spotify")
    save_config(cfg)
    data = json.loads((tmp_path / "config.json").read_text())
    assert data["ignored_apps"] == ["Spotify"] and "path" not in data
    assert load_config(tmp_path / "config.json").ignored_apps == ["Spotify"]


def test_app_data_dir_honours_env(tmp_path):
    assert app_data_dir() == tmp_path / "home" and (tmp_path / "home").is_dir()


def test_search_paths_prefer_exe_dir():
    paths = config_search_paths()
    assert paths[0] == exe_dir() / "config.json" and paths[1] == app_data_dir() / "config.json"


def test_config_dataclass_is_plain():
    assert Config(supabase_url="u").supabase_url == "u"


def test_config_with_utf8_bom_loads(tmp_path):
    path = tmp_path / "config.json"
    path.write_bytes(b"\xef\xbb\xbf" + json.dumps({"idle_minutes": 7}).encode("utf-8"))
    assert load_config(path).idle_minutes == 7


def test_recordings_since_round_trip_and_bad_values(tmp_path):
    path = tmp_path / "config.json"
    cfg = load_config(path)
    cfg.recordings_since = 1_800_000_000.5
    save_config(cfg)
    assert json.loads(path.read_text())["recordings_since"] == 1_800_000_000.5
    assert load_config(path).recordings_since == 1_800_000_000.5
    for bad in ("soon", None, -5, [1]):
        path.write_text(json.dumps({"recordings_since": bad}))
        assert load_config(path).recordings_since == 0.0


def test_legacy_or_known_prefers_the_zip_versions_documents_folder(tmp_path, monkeypatch):
    """The zip tracker used ~/Documents even when Documents is on OneDrive; an existing folder there wins."""
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    onedrive = tmp_path / "OneDrive" / "Dokumenty"
    monkeypatch.setattr(config, "documents_dir", lambda: onedrive)
    assert legacy_or_known("MindsetForest Vault") == onedrive / "MindsetForest Vault"
    (tmp_path / "Documents" / "MindsetForest Vault").mkdir(parents=True)
    assert legacy_or_known("MindsetForest Vault") == tmp_path / "Documents" / "MindsetForest Vault"
    assert Config().vault_dir == str(tmp_path / "Documents" / "MindsetForest Vault")
    assert load_config(tmp_path / "missing.json").recordings_dir == str(onedrive / "Bandicam")
