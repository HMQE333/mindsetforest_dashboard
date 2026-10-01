import json

import pytest
import requests

from mindsetforest_tracker.archive_capture import ArchiveClient, build_block, clean_source, parse_hotkey
from mindsetforest_tracker.auth import AuthRequired, SupabaseAuth, Tokens
from mindsetforest_tracker.config import load_config
from mindsetforest_tracker.main import build_app
from mindsetforest_tracker.sync import SyncError, SyncRejected

URL = "https://proj.supabase.co"


class FakeResponse:
    def __init__(self, status_code, body=None, text=""):
        self.status_code = status_code
        self._body = body
        self.text = text or (json.dumps(body) if body is not None else "")

    def json(self):
        return self._body


class FakeHttp:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def post(self, url, headers=None, json=None, timeout=None):
        self.calls.append((url, headers, json))
        item = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(item, Exception):
            raise item
        return item


def make_auth(tmp_path, http):
    auth = SupabaseAuth(URL, "anon", tmp_path / "session.bin", http=http, clock=lambda: 1000.0)
    auth.tokens = Tokens("acc", "ref", "user-1", 1000.0 + 3600, "a@b.c")
    return auth


def test_parse_hotkey():
    assert parse_hotkey("alt+shift+s") == (0x1 | 0x4, ord("S"))
    assert parse_hotkey("Ctrl + Shift + F9") == (0x2 | 0x4, 0x78)
    assert parse_hotkey("win+1") == (0x8, ord("1"))
    for bad in ("s", "alt+shift", "alt+s+d", "alt+enter", "alt+ś"):
        with pytest.raises(ValueError):
            parse_hotkey(bad)


def test_clean_source_drops_the_browser_name():
    assert clean_source("Deep work - Cal Newport - Google Chrome") == "Deep work - Cal Newport"
    assert clean_source("Article - Personal - Microsoft\u200b Edge") == "Article - Personal"
    assert clean_source("Some page — Mozilla Firefox") == "Some page"
    assert clean_source("notes.pdf - Adobe Acrobat Reader") == "notes.pdf - Adobe Acrobat Reader"
    assert clean_source("") == ""


def test_build_block():
    row = build_block("  First line of a long quote\r\nsecond line  ", "Deep work", "user-1")
    assert row == {
        "user_id": "user-1",
        "title": "First line of a long quote second line",
        "content": "First line of a long quote\nsecond line\n\nSource: Deep work",
        "tags": ["quick-capture"],
        "pillars": [],
    }
    assert len(build_block("x" * 500, "", "u")["title"]) == 60
    assert build_block("x", "", "u")["content"] == "x"
    assert build_block("   \n ", "src", "u") is None


def test_save_posts_the_note(tmp_path):
    http = FakeHttp(FakeResponse(201, [{"id": "b1", "title": "Hello"}]))
    client = ArchiveClient(URL, "anon", make_auth(tmp_path, http), http=http)
    assert client.save("Hello", "Page") == {"id": "b1", "title": "Hello"}
    url, headers, body = http.calls[0]
    assert url == f"{URL}/rest/v1/archive_blocks?select=id,title"
    assert headers["Authorization"] == "Bearer acc" and headers["Prefer"] == "return=representation"
    assert body["user_id"] == "user-1" and body["content"] == "Hello\n\nSource: Page"


def test_save_refreshes_once_on_401(tmp_path):
    http = FakeHttp(FakeResponse(401, text="jwt expired"), FakeResponse(201, [{"id": "b1", "title": "x"}]))
    auth = make_auth(tmp_path, http)
    refreshed = []
    auth.refresh = lambda: refreshed.append(1)
    assert ArchiveClient(URL, "anon", auth, http=http).save("x")["id"] == "b1"
    assert refreshed == [1]


def test_save_errors(tmp_path):
    offline = FakeHttp(requests.ConnectionError("offline"))
    with pytest.raises(SyncError):
        ArchiveClient(URL, "anon", make_auth(tmp_path, offline), http=offline).save("x")
    rejected = FakeHttp(FakeResponse(400, text="bad"))
    with pytest.raises(SyncRejected):
        ArchiveClient(URL, "anon", make_auth(tmp_path, rejected), http=rejected).save("x")
    twice = FakeHttp(FakeResponse(401, text="no"))
    auth = make_auth(tmp_path, twice)
    auth.refresh = lambda: None
    with pytest.raises(AuthRequired):
        ArchiveClient(URL, "anon", auth, http=twice).save("x")


def test_save_text_messages(tmp_path):
    cfg_path = tmp_path / "config.json"
    cfg_path.write_text(json.dumps({"supabase_url": URL, "supabase_anon_key": "anon", "private_keywords": ["secret"]}))
    config = load_config(cfg_path)
    assert config.capture_hotkey == "alt+shift+s"
    app = build_app(config, tmp_path)
    assert app.save_text("hello", "Page - Google Chrome").startswith("Sign in")
    http = FakeHttp(FakeResponse(201, [{"id": None, "title": "hello"}]))
    app.auth.tokens = Tokens("acc", "ref", "user-1", 9e12, "a@b.c")
    app.archive.http = http
    assert app.save_text("", "x").startswith("Nothing selected")
    assert app.save_text("hello", "Page - Google Chrome") == "Saved to Archive: hello"
    assert http.calls[-1][2]["content"] == "hello\n\nSource: Page"
    app.save_text("hello", "my secret plan - Google Chrome")
    assert http.calls[-1][2]["content"] == "hello"  # a private window leaves no source
    app.archive.http = FakeHttp(requests.ConnectionError("offline"))
    assert "clipboard" in app.save_text("hello", "Page")
    assert app.capture_hint() == "Save selection to Archive: Alt+Shift+S"
    app.store.close()


class GetHttp:
    """Answers GETs with one response."""

    def __init__(self, response):
        self.response = response
        self.urls = []

    def get(self, url, headers=None, timeout=None):
        self.urls.append(url)
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def test_capture_hotkey_from_the_dashboard(tmp_path):
    from mindsetforest_tracker.sync import SyncClient

    def client(body, status=200):
        http = GetHttp(FakeResponse(status, body))
        return SyncClient(URL, "anon", make_auth(tmp_path, http), http=http), http

    c, http = client([{"preferences": {"hotkeys": {"trackerCapture": " Ctrl+Shift+F9 "}}}])
    assert c.capture_hotkey() == "ctrl+shift+f9"
    assert http.urls == [f"{URL}/rest/v1/user_onboarding?select=preferences"]
    assert client([{"preferences": {"hotkeys": {"trackerCapture": ""}}}])[0].capture_hotkey() == ""
    assert client([{"preferences": {"hotkeys": {"quickCapture": "alt+q"}}}])[0].capture_hotkey() is None
    assert client([{"preferences": None}])[0].capture_hotkey() is None
    assert client([])[0].capture_hotkey() is None
    with pytest.raises(SyncError):
        client({"message": "boom"}, status=500)[0].capture_hotkey()


class FakeListener:
    def __init__(self, spec, on_press, on_fail=None):
        self.spec = spec
        self.started = self.stopped = False

    def start(self):
        self.started = True

    def stop(self):
        self.stopped = True


def test_hotkey_follows_the_dashboard(tmp_path):
    cfg_path = tmp_path / "config.json"
    cfg_path.write_text(json.dumps({"supabase_url": URL, "supabase_anon_key": "anon", "capture_hotkey": "alt+shift+s"}))
    app = build_app(load_config(cfg_path), tmp_path)
    made = []
    app._hotkey_factory = lambda spec, on_press, on_fail=None: made.append(FakeListener(spec, on_press, on_fail)) or made[-1]

    app.apply_capture_hotkey(app.config.capture_hotkey)  # what start() does
    assert [l.spec for l in made] == ["alt+shift+s"] and made[0].started
    app.on_capture_hotkey(None)  # not set in the dashboard: config.json's stays, nothing restarts
    assert len(made) == 1
    app.on_capture_hotkey("ctrl+shift+f9")
    assert made[0].stopped and made[1].spec == "ctrl+shift+f9" and made[1].started
    assert app.capture_hint() == "Save selection to Archive: Ctrl+Shift+F9"
    app.on_capture_hotkey("")  # turned off in the dashboard
    assert made[1].stopped and len(made) == 2 and app.capture_hint() is None
    app.store.close()


def test_sync_pulls_the_hotkey(tmp_path):
    from mindsetforest_tracker.store import Store
    from mindsetforest_tracker.sync import SyncClient, SyncWorker

    class Http(GetHttp):
        def get(self, url, headers=None, timeout=None):
            self.urls.append(url)
            if "user_onboarding" in url:
                return FakeResponse(200, [{"preferences": {"hotkeys": {"trackerCapture": "alt+shift+x"}}}])
            return FakeResponse(200, [])

    http = Http(None)
    worker = SyncWorker(Store(), SyncClient(URL, "anon", make_auth(tmp_path, http), http=http), clock=lambda: 5000.0)
    got = []
    worker.on_capture_hotkey = got.append
    worker.sync_once()
    assert got == ["alt+shift+x"]
