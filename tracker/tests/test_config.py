import json
import socket

from mindsetforest_tracker.config import Config, app_data_dir, config_search_paths, exe_dir, load_config, save_config


def test_defaults_when_file_missing(tmp_path):
    cfg = load_config(tmp_path / "config.json")
    assert cfg.supabase_url == "" and cfg.supabase_anon_key == ""
    assert cfg.dashboard_url == "https://mindsetforest.app"
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
