import json

import pytest
import requests

from mindsetforest_tracker.auth import AuthError, AuthRequired, SupabaseAuth, Tokens
from mindsetforest_tracker.sessions import Session
from mindsetforest_tracker.store import Store
from mindsetforest_tracker.sync import MAX_BACKOFF, SyncClient, SyncWorker, build_payload

URL = "https://proj.supabase.co"
T0 = 1_800_000_000


class FakeResponse:
    def __init__(self, status_code, body=None, text=""):
        self.status_code = status_code
        self._body = body
        self.text = text or (json.dumps(body) if body is not None else "")

    def json(self):
        if self._body is None:
            raise ValueError("no json")
        return self._body


class FakeHttp:
    """Routes by URL substring; each route is a list of responses (or exceptions)."""

    def __init__(self):
        self.calls = []
        self.routes = {}

    def add(self, url_part, *responses):
        self.routes.setdefault(url_part, []).extend(responses)

    def _respond(self, method, url, headers, json_body):
        self.calls.append((method, url, headers, json_body))
        for part, queue in self.routes.items():
            if part in url:
                item = queue.pop(0) if len(queue) > 1 else queue[0]
                if isinstance(item, Exception):
                    raise item
                return item
        return FakeResponse(404, text="no route")

    def post(self, url, headers=None, json=None, timeout=None):
        return self._respond("post", url, headers, json)

    def delete(self, url, headers=None, timeout=None):
        return self._respond("delete", url, headers, None)


def token_body(access="acc", refresh="ref", user="user-1", expires_in=3600):
    return {"access_token": access, "refresh_token": refresh, "expires_in": expires_in, "user": {"id": user}}


def make_auth(tmp_path, http, clock=lambda: 1000.0):
    auth = SupabaseAuth(URL, "anon", tmp_path / "session.bin", http=http, clock=clock)
    auth.tokens = Tokens("acc", "ref", "user-1", 1000.0 + 3600, "a@b.c")
    return auth


def fill_store(store, n):
    for i in range(n):
        store.upsert_session(Session("Code", "Code | p", "t", False, T0 + i * 100, T0 + i * 100 + 50), "dev-1")


def test_build_payload_shape():
    store = Store()
    fill_store(store, 1)
    payload = build_payload(store.unsynced(), "user-1")
    assert payload == [{
        "user_id": "user-1", "device_id": "dev-1", "app": "Code", "app_key": "Code | p",
        "window_title": "t", "started_at": "2027-01-15T08:00:00Z", "ended_at": "2027-01-15T08:00:50Z",
        "seconds": 50, "idle": False, "local_date": payload[0]["local_date"],
    }]
    assert len(payload[0]["local_date"]) == 10


def test_sync_once_uploads_and_marks(tmp_path):
    http = FakeHttp()
    http.add("/rest/v1/app_usage_sessions", FakeResponse(201))
    auth = make_auth(tmp_path, http)
    store = Store()
    fill_store(store, 3)
    worker = SyncWorker(store, SyncClient(URL, "anon", auth, http=http), clock=lambda: 5000.0)
    assert worker.sync_once() == 3
    assert store.unsynced() == []
    method, url, headers, body = http.calls[0]
    assert url == f"{URL}/rest/v1/app_usage_sessions?on_conflict=user_id,device_id,started_at"
    assert headers["apikey"] == "anon" and headers["Authorization"] == "Bearer acc"
    assert headers["Prefer"] == "resolution=merge-duplicates,return=minimal"
    assert len(body) == 3 and body[0]["user_id"] == "user-1"
    assert worker.status.last_sync_at == 5000.0 and worker.status.last_error is None
    assert store.get_kv("last_sync_at") == "5000.0"


def test_batches_of_at_most_200(tmp_path):
    http = FakeHttp()
    http.add("/rest/v1/", FakeResponse(204))
    store = Store()
    fill_store(store, 450)
    worker = SyncWorker(store, SyncClient(URL, "anon", make_auth(tmp_path, http), http=http))
    assert worker.sync_once() == 450
    assert [len(c[3]) for c in http.calls] == [200, 200, 50]


def test_401_refreshes_once_then_retries(tmp_path):
    http = FakeHttp()
    http.add("/rest/v1/", FakeResponse(401, {"message": "JWT expired"}), FakeResponse(201))
    http.add("/auth/v1/token?grant_type=refresh_token", FakeResponse(200, token_body(access="acc2", refresh="ref2")))
    auth = make_auth(tmp_path, http)
    store = Store()
    fill_store(store, 1)
    worker = SyncWorker(store, SyncClient(URL, "anon", auth, http=http))
    assert worker.sync_once() == 1
    assert auth.tokens.access_token == "acc2" and auth.tokens.refresh_token == "ref2"
    assert http.calls[-1][2]["Authorization"] == "Bearer acc2"
    assert worker.status.needs_login is False


def test_refresh_failure_flags_needs_login(tmp_path):
    http = FakeHttp()
    http.add("/rest/v1/", FakeResponse(401, {"message": "bad"}))
    http.add("/auth/v1/token", FakeResponse(400, {"error_description": "Invalid Refresh Token"}))
    store = Store()
    fill_store(store, 2)
    worker = SyncWorker(store, SyncClient(URL, "anon", make_auth(tmp_path, http), http=http))
    assert worker.sync_once() == 0
    assert worker.status.needs_login is True and "sign in" in worker.status.last_error
    assert len(store.unsynced()) == 2


def test_network_error_keeps_rows_and_backs_off(tmp_path):
    http = FakeHttp()
    http.add("/rest/v1/", requests.ConnectionError("offline"))
    store = Store()
    fill_store(store, 2)
    worker = SyncWorker(store, SyncClient(URL, "anon", make_auth(tmp_path, http), http=http))
    expected = [60, 120, 240, 480, 600, 600]
    for backoff in expected:
        assert worker.sync_once() == 0
        assert worker.status.backoff_seconds == backoff
    assert len(store.unsynced()) == 2 and "offline" in worker.status.last_error
    assert worker.status.backoff_seconds == MAX_BACKOFF
    http.routes["/rest/v1/"] = [FakeResponse(201)]
    assert worker.sync_once() == 2 and worker.status.backoff_seconds == 0


def test_server_error_is_reported_not_raised(tmp_path):
    http = FakeHttp()
    http.add("/rest/v1/", FakeResponse(500, text="boom"))
    store = Store()
    fill_store(store, 1)
    worker = SyncWorker(store, SyncClient(URL, "anon", make_auth(tmp_path, http), http=http))
    assert worker.sync_once() == 0 and "HTTP 500" in worker.status.last_error


def test_delete_builds_filter_url(tmp_path):
    http = FakeHttp()
    http.add("/rest/v1/", FakeResponse(204))
    client = SyncClient(URL, "anon", make_auth(tmp_path, http), http=http)
    client.delete("dev-1", "2027-01-15T08:00:00Z")
    method, url, headers, _ = http.calls[0]
    assert method == "delete" and url.endswith("?device_id=eq.dev-1&started_at=eq.2027-01-15T08:00:00Z")


# -- auth ---------------------------------------------------------------------

def test_sign_in_saves_and_reloads_session(tmp_path, caplog):
    http = FakeHttp()
    http.add("/auth/v1/token?grant_type=password", FakeResponse(200, token_body()))
    auth = SupabaseAuth(URL, "anon", tmp_path / "session.bin", http=http, clock=lambda: 100.0)
    tokens = auth.sign_in("a@b.c", "pw")
    assert tokens.user_id == "user-1" and tokens.expires_at == 3700.0
    assert http.calls[0][3] == {"email": "a@b.c", "password": "pw"} and http.calls[0][2]["apikey"] == "anon"
    assert (tmp_path / "session.bin").exists()
    again = SupabaseAuth(URL, "anon", tmp_path / "session.bin", http=http)
    assert again.load_saved() is True
    assert (again.tokens.refresh_token, again.user_id, again.email, again.tokens.access_token) == ("ref", "user-1", "a@b.c", "")
    assert "unencrypted" in caplog.text  # Linux fallback warns
    again.sign_out()
    assert not (tmp_path / "session.bin").exists() and again.has_session is False


def test_bad_password_raises_auth_error(tmp_path):
    http = FakeHttp()
    http.add("/auth/v1/token", FakeResponse(400, {"error_description": "Invalid login credentials"}))
    auth = SupabaseAuth(URL, "anon", tmp_path / "s.bin", http=http)
    with pytest.raises(AuthError, match="Invalid login"):
        auth.sign_in("a@b.c", "nope")


def test_ensure_access_token_refreshes_near_expiry(tmp_path):
    http = FakeHttp()
    http.add("/auth/v1/token?grant_type=refresh_token", FakeResponse(200, token_body(access="fresh")))
    now = [1000.0]
    auth = make_auth(tmp_path, http, clock=lambda: now[0])
    assert auth.ensure_access_token() == "acc" and http.calls == []
    now[0] = 1000.0 + 3600 - 200  # within 5 minutes of expiry
    assert auth.ensure_access_token() == "fresh" and len(http.calls) == 1


def test_no_session_raises_auth_required(tmp_path):
    auth = SupabaseAuth(URL, "anon", tmp_path / "s.bin", http=FakeHttp())
    assert auth.load_saved() is False
    with pytest.raises(AuthRequired):
        auth.headers()


# -- review fixes -------------------------------------------------------------

class PoisonHttp(FakeHttp):
    """Rejects any upsert whose body contains an app called Poison."""

    def post(self, url, headers=None, json=None, timeout=None):
        self.calls.append(("post", url, headers, json))
        if "/rest/v1/" in url and any(r["app"] == "Poison" for r in json):
            return FakeResponse(400, {"message": "invalid input syntax"})
        return FakeResponse(201)


def test_rejected_batch_is_retried_row_by_row_and_poison_rows_quarantined(tmp_path):
    http = PoisonHttp()
    store = Store()
    store.upsert_session(Session("Code", "Code", "t", False, T0, T0 + 10), "d")
    store.upsert_session(Session("Poison", "Poison", "t", False, T0 + 100, T0 + 110), "d")
    store.upsert_session(Session("Word", "Word", "t", False, T0 + 200, T0 + 210), "d")
    worker = SyncWorker(store, SyncClient(URL, "anon", make_auth(tmp_path, http), http=http))
    assert worker.sync_once() == 2
    assert store.unsynced() == []
    assert [r.app for r in store.quarantined()] == ["Poison"]
    assert worker.status.last_error is None and worker.status.backoff_seconds == 0
    assert worker.status.quarantined_total == 1
    assert [len(c[3]) for c in http.calls] == [3, 1, 1, 1]  # batch, then one by one
    assert worker.sync_once() == 0 and len(http.calls) == 4  # quarantined row is not retried


def test_429_is_retried_with_backoff_not_quarantined(tmp_path):
    http = FakeHttp()
    http.add("/rest/v1/", FakeResponse(429, text="slow down"))
    store = Store()
    fill_store(store, 1)
    worker = SyncWorker(store, SyncClient(URL, "anon", make_auth(tmp_path, http), http=http))
    assert worker.sync_once() == 0
    assert worker.status.backoff_seconds == 60 and len(store.unsynced()) == 1 and store.quarantined() == []


def test_refresh_network_error_keeps_tokens_and_is_not_auth_required(tmp_path):
    from mindsetforest_tracker.auth import AuthUnavailable
    http = FakeHttp()
    http.add("/auth/v1/token", requests.ConnectionError("offline"))
    auth = make_auth(tmp_path, http)
    with pytest.raises(AuthUnavailable):
        auth.refresh()
    assert (auth.tokens.access_token, auth.tokens.refresh_token) == ("acc", "ref")
    http.routes["/auth/v1/token"] = [FakeResponse(503, text="down")]
    with pytest.raises(AuthUnavailable):
        auth.refresh()
    http.routes["/auth/v1/token"] = [FakeResponse(400, {"error_description": "Invalid Refresh Token"})]
    with pytest.raises(AuthRequired):
        auth.refresh()
    assert auth.tokens.access_token == ""


def test_sync_treats_refresh_network_error_as_retryable(tmp_path):
    http = FakeHttp()
    http.add("/rest/v1/", FakeResponse(401, {"message": "JWT expired"}))
    http.add("/auth/v1/token", requests.ConnectionError("offline"))
    store = Store()
    fill_store(store, 2)
    worker = SyncWorker(store, SyncClient(URL, "anon", make_auth(tmp_path, http), http=http))
    assert worker.sync_once() == 0
    assert worker.status.needs_login is False and "offline" in worker.status.last_error
    assert worker.status.backoff_seconds == 60 and len(store.unsynced()) == 2


def test_concurrent_ensure_access_token_refreshes_once(tmp_path):
    import threading
    http = FakeHttp()
    http.add("/auth/v1/token?grant_type=refresh_token", FakeResponse(200, token_body(access="fresh", refresh="ref2")))
    auth = make_auth(tmp_path, http, clock=lambda: 1000.0 + 3600)  # expired
    results = []
    threads = [threading.Thread(target=lambda: results.append(auth.ensure_access_token())) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert results == ["fresh"] * 8
    assert len([c for c in http.calls if "refresh_token" in c[1]]) == 1
    assert auth.tokens.refresh_token == "ref2"


def test_save_failure_after_rotation_keeps_token_in_memory(tmp_path, caplog):
    http = FakeHttp()
    http.add("/auth/v1/token?grant_type=refresh_token", FakeResponse(200, token_body(access="fresh", refresh="ref2")))
    blocker = tmp_path / "blocker"
    blocker.write_text("x")
    auth = make_auth(tmp_path, http)
    auth.session_path = blocker / "session.bin"  # parent is a file: mkdir/write raise OSError
    tokens = auth.refresh()
    assert tokens.access_token == "fresh" and auth.tokens.refresh_token == "ref2"
    assert "COULD NOT SAVE SESSION FILE" in caplog.text


def test_corrupt_session_file_is_moved_aside(tmp_path, caplog, monkeypatch):
    import mindsetforest_tracker.auth as auth_module
    path = tmp_path / "session.bin"
    path.write_bytes(b"MFDPAPI1" + b"garbage-from-another-user")

    def boom(blob):
        raise RuntimeError("(-2146893813, 'CryptUnprotectData', 'Key not valid for use in specified state.')")

    monkeypatch.setattr(auth_module, "unprotect", boom)
    auth = SupabaseAuth(URL, "anon", path, http=FakeHttp())
    assert auth.load_saved() is False and auth.has_session is False
    assert not path.exists() and (tmp_path / "session.bin.bad").read_bytes().startswith(b"MFDPAPI1")
    assert "session.bin.bad" in caplog.text
    assert auth.load_saved() is False  # nothing left to load, no error
