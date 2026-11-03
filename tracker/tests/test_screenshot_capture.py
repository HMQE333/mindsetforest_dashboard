import json

import pytest
import requests
from PIL import Image

from mindsetforest_tracker import screenshot_capture as sc
from mindsetforest_tracker.archive_capture import ArchiveClient, parse_hotkey
from mindsetforest_tracker.auth import AuthRequired, Tokens
from mindsetforest_tracker.config import load_config
from mindsetforest_tracker.main import build_app
from mindsetforest_tracker.sync import SyncError, SyncRejected

from test_archive_capture import URL, FakeHttp, FakeResponse, make_auth


class DataHttp(FakeHttp):
    """FakeHttp that also records ``data=`` bodies (the upload)."""

    def post(self, url, headers=None, json=None, data=None, timeout=None):
        self.calls.append((url, headers, json if data is None else data))
        item = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(item, Exception):
            raise item
        return item


def test_screenshot_hotkey_config_default_and_parse(tmp_path):
    path = tmp_path / "config.json"
    path.write_text(json.dumps({"supabase_url": URL}))
    cfg = load_config(path)
    assert cfg.screenshot_hotkey == "alt+shift+a"
    assert parse_hotkey(cfg.screenshot_hotkey) == (0x1 | 0x4, ord("A"))
    path.write_text(json.dumps({"screenshot_hotkey": " Ctrl+Shift+F8 "}))
    assert load_config(path).screenshot_hotkey == "ctrl+shift+f8"
    path.write_text(json.dumps({"screenshot_hotkey": None}))
    assert load_config(path).screenshot_hotkey == ""


def test_selection_bbox():
    mon = (-1920, 0, 0, 1080)
    assert sc.selection_bbox((10, 20), (110, 220), mon) == (10, 20, 110, 220)
    assert sc.selection_bbox((110, 220), (10, 20), mon) == (10, 20, 110, 220)  # dragged up-left
    assert sc.selection_bbox((-500, 5), (-498, 7), mon) == mon  # a click: the whole monitor
    assert sc.selection_bbox((0, 0), (1, 1), (0, 0, 0, 0)) is None


def test_storage_path_and_public_url():
    assert sc.storage_path("user-1", now=1700000000.5, token="ab12cd34") == "user-1/1700000000500-ab12cd34.png"
    path = sc.storage_path("user-1", "webp")
    assert path.startswith("user-1/") and path.endswith(".webp")
    assert sc.storage_path("u") != sc.storage_path("u")
    assert sc.public_url(URL + "/", "u/1.png") == f"{URL}/storage/v1/object/public/archive-images/u/1.png"


def test_encode_image_picks_the_smaller():
    flat = Image.new("RGB", (64, 64), (139, 92, 246))
    data, ext, ctype = sc.encode_image(flat)
    assert ext in ("png", "webp") and ctype == f"image/{ext}"
    assert data[:4] in (b"\x89PNG", b"RIFF")


def test_build_screenshot_block():
    row = sc.build_screenshot_block("https://x/p.png", "Deep work", "user-1")
    assert row == {
        "user_id": "user-1",
        "title": "Zrzut ekranu – Deep work",
        "content": "[image] https://x/p.png\n\nSource: Deep work",
        "tags": ["quick-capture", "screenshot"],
        "pillars": [],
    }
    import time
    at = time.mktime((2026, 11, 3, 14, 5, 0, 0, 0, -1))
    bare = sc.build_screenshot_block("https://x/p.png", "", "u", at=at)
    assert bare["title"] == "Zrzut ekranu – 14:05" and bare["content"] == "[image] https://x/p.png"
    assert len(sc.screenshot_title("x" * 200)) == len("Zrzut ekranu – ") + 60


def test_upload_request(tmp_path):
    http = DataHttp(FakeResponse(200, {"Key": "archive-images/user-1/x.png"}))
    archive = ArchiveClient(URL, "anon", make_auth(tmp_path, http), http=http)
    url = sc.upload_image(archive, URL, b"PNGDATA", "image/png", "png")
    (called, headers, body), = http.calls
    path = called.split("/storage/v1/object/archive-images/", 1)[1]
    assert called.startswith(f"{URL}/storage/v1/object/archive-images/user-1/") and path.endswith(".png")
    assert headers["Authorization"] == "Bearer acc" and headers["apikey"] == "anon"
    assert headers["Content-Type"] == "image/png"
    assert body == b"PNGDATA"
    assert url == f"{URL}/storage/v1/object/public/archive-images/{path}"


def test_upload_errors(tmp_path):
    def client(*responses):
        http = DataHttp(*responses)
        auth = make_auth(tmp_path, http)
        auth.refresh = lambda: None
        return ArchiveClient(URL, "anon", auth, http=http), http

    archive, _ = client(requests.ConnectionError("offline"))
    with pytest.raises(SyncError):
        sc.upload_image(archive, URL, b"x", "image/png", "png")
    archive, _ = client(FakeResponse(403, text='{"message":"new row violates row-level security policy"}'))
    with pytest.raises(SyncRejected):
        sc.upload_image(archive, URL, b"x", "image/png", "png")
    archive, _ = client(FakeResponse(401, text="no"))
    with pytest.raises(AuthRequired):
        sc.upload_image(archive, URL, b"x", "image/png", "png")
    archive, http = client(FakeResponse(400, text='{"message":"jwt expired"}'), FakeResponse(200, {}))
    assert sc.upload_image(archive, URL, b"x", "image/png", "png").startswith(URL)
    assert len(http.calls) == 2  # refreshed once, then uploaded
    archive, _ = client(FakeResponse(503, text="down"))
    with pytest.raises(SyncError):
        sc.upload_image(archive, URL, b"x", "image/png", "png")


def make_app(tmp_path, **cfg):
    path = tmp_path / "config.json"
    path.write_text(json.dumps({"supabase_url": URL, "supabase_anon_key": "anon", "private_keywords": ["secret"], **cfg}))
    return build_app(load_config(path), tmp_path)


def test_save_screenshot_messages(tmp_path):
    app = make_app(tmp_path)
    image = Image.new("RGB", (8, 8), "white")
    signed_out = app.save_screenshot(image, "Page")
    assert not signed_out.ok and "Zaloguj" in signed_out.message
    app.auth.tokens = Tokens("acc", "ref", "user-1", 9e12, "a@b.c")
    app.archive.http = DataHttp(FakeResponse(200, {}), FakeResponse(201, [{"id": None, "title": "Zrzut ekranu – Page"}]))
    app._paused = True  # screenshots are explicit: allowed while paused
    ok = app.save_screenshot(image, "Page - Google Chrome")
    assert ok.ok and ok.title == "Zrzut ekranu – Page"
    upload, insert = app.archive.http.calls
    assert "/storage/v1/object/archive-images/user-1/" in upload[0]
    row = insert[2]
    assert insert[0].startswith(f"{URL}/rest/v1/archive_blocks")
    assert row["tags"] == ["quick-capture", "screenshot"] and row["user_id"] == "user-1"
    assert row["content"].startswith(f"[image] {URL}/storage/v1/object/public/archive-images/user-1/")
    assert row["content"].endswith("\n\nSource: Page")
    assert app.last_archive[0] == "Zrzut ekranu – Page"

    app.archive.http = DataHttp(FakeResponse(200, {}), FakeResponse(201, [{"id": None, "title": "t"}]))
    app.save_screenshot(image, "my secret plan - Google Chrome")
    assert "Source:" not in app.archive.http.calls[1][2]["content"]  # a private window leaves no source

    app.archive.http = DataHttp(requests.ConnectionError("offline"))
    offline = app.save_screenshot(image, "Page")
    assert not offline.ok and "połączenia" in offline.message
    app.archive.http = DataHttp(FakeResponse(403, text="rls"))
    refused = app.save_screenshot(image, "Page")
    assert not refused.ok and "odrzucił" in refused.message and "403" in refused.message
    assert not app.capture_busy()
    app.store.close()


def test_confirm_screenshot_toasts(tmp_path, monkeypatch):
    from mindsetforest_tracker import main as main_mod
    from mindsetforest_tracker.main import CaptureResult

    app = make_app(tmp_path)
    toasts, flashes = [], []
    monkeypatch.setattr(main_mod.notify, "toast", lambda title, msg, open_url=None: toasts.append((title, msg, open_url)) or True)
    monkeypatch.setattr(main_mod.notify, "beep", lambda ok=True: None)
    monkeypatch.setattr(main_mod.tray, "flash", lambda icon, paused: flashes.append(1))
    app.confirm_screenshot(CaptureResult("Saved", ok=True, title="Zrzut ekranu – Page"))
    app.confirm_screenshot(CaptureResult("Brak połączenia z serwerem."))
    assert toasts == [("Zapisano zrzut w Archive", "Zrzut ekranu – Page", app.dashboard_url),
                      ("Nie zapisano zrzutu", "Brak połączenia z serwerem.", None)]
    assert flashes == [1]
    app.store.close()


class FakeListener:
    def __init__(self, spec, on_press, on_fail=None, setting="capture_hotkey"):
        self.spec, self.setting = spec, setting
        self.started = self.stopped = False

    def start(self):
        self.started = True

    def stop(self):
        self.stopped = True


def test_screenshot_hotkey_listener_and_tray_line(tmp_path):
    app = make_app(tmp_path)
    made = []
    app._hotkey_factory = lambda spec, on_press, on_fail=None, setting="capture_hotkey": (
        made.append(FakeListener(spec, on_press, on_fail, setting)) or made[-1])
    app.apply_capture_hotkey(app.config.capture_hotkey)
    app.apply_screenshot_hotkey(app.config.screenshot_hotkey)
    assert [(l.spec, l.setting) for l in made] == [("alt+shift+s", "capture_hotkey"), ("alt+shift+a", "screenshot_hotkey")]
    assert app.capture_hint() == "Save selection to Archive: Alt+Shift+S · Zrzut ekranu: Alt+Shift+A"
    app.apply_screenshot_hotkey("alt+shift+a")  # unchanged: nothing restarts
    assert len(made) == 2
    app.apply_capture_hotkey("")
    assert app.capture_hint() == "Zrzut ekranu: Alt+Shift+A"
    app.apply_screenshot_hotkey("")
    assert made[1].stopped and app.capture_hint() is None
    app.store.close()
