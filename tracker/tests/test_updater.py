import hashlib
from pathlib import Path

import pytest
import requests

from mindsetforest_tracker import updater
from mindsetforest_tracker.store import Store
from mindsetforest_tracker.updater import (
    IDLE_SECONDS, KV_ATTEMPT, KV_VERSION, STARTUP_SECONDS, Release, UpdateError, Updater, can_update, download,
    fetch_manifest, good_moment, installer_argv, is_newer, parse_manifest, parse_version, updated_message,
)

EXE = b"MZ fake setup exe" * 1000
SHA = hashlib.sha256(EXE).hexdigest()
URL = "https://github.com/HMQE333/mindsetforest_dashboard/releases/download/tracker-latest/MindsetForestSetup.exe"


class Resp:
    def __init__(self, status=200, json_data=None, body=b"", raise_json=False):
        self.status_code = status
        self._json = json_data
        self._body = body
        self._raise_json = raise_json

    def json(self):
        if self._raise_json:
            raise ValueError("no json")
        return self._json

    def iter_content(self, chunk_size=1):
        for i in range(0, len(self._body), chunk_size):
            yield self._body[i:i + chunk_size]

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeHttp:
    def __init__(self, manifest=None, body=EXE, manifest_status=200, error=None):
        self.manifest = manifest if manifest is not None else {"version": "9.0.0", "sha256": SHA, "url": URL}
        self.body = body
        self.manifest_status = manifest_status
        self.error = error
        self.calls = []

    def get(self, url, timeout=None, **kw):
        self.calls.append(url)
        assert timeout
        if self.error:
            raise self.error
        if url.endswith(".json"):
            return Resp(self.manifest_status, self.manifest)
        return Resp(200, body=self.body)


# -- versions ------------------------------------------------------------------

def test_parse_version():
    assert parse_version("1.10.2") == (1, 10, 2)
    assert parse_version("v2.0") == (2, 0)
    for bad in ("", "1.x", "1..2", "latest", "1.2-beta"):
        with pytest.raises(ValueError):
            parse_version(bad)


@pytest.mark.parametrize("remote,local,newer", [
    ("1.5.0", "1.4.0", True), ("1.10.0", "1.9.9", True), ("1.4.0", "1.4.0", False), ("1.5", "1.5.0", False),
    ("1.5.0.1", "1.5", True), ("1.3.9", "1.4.0", False), ("2.0.0", "1.99.99", True),
])
def test_is_newer_is_numeric(remote, local, newer):
    assert is_newer(remote, local) is newer


# -- manifest ------------------------------------------------------------------

def test_parse_manifest_ok_normalises():
    rel = parse_manifest({"version": " 1.5.0 ", "sha256": SHA.upper(), "url": URL})
    assert rel == Release("1.5.0", SHA, URL)


@pytest.mark.parametrize("data", [
    None, [], {}, {"version": "1.5.0", "sha256": SHA}, {"version": 15, "sha256": SHA, "url": URL},
    {"version": "next", "sha256": SHA, "url": URL}, {"version": "1.5.0", "sha256": "abc", "url": URL},
    {"version": "1.5.0", "sha256": SHA, "url": "http://example.com/x.exe"},
    {"version": "1.5.0", "sha256": SHA, "url": "file:///C:/x.exe"},
])
def test_parse_manifest_rejects(data):
    with pytest.raises(UpdateError):
        parse_manifest(data)


def test_fetch_manifest_errors():
    with pytest.raises(UpdateError, match="HTTP 404"):
        fetch_manifest(FakeHttp(manifest_status=404))
    with pytest.raises(UpdateError, match="unreachable"):
        fetch_manifest(FakeHttp(error=requests.ConnectionError("offline")))

    class NotJson(FakeHttp):
        def get(self, url, timeout=None, **kw):
            return Resp(200, raise_json=True)

    with pytest.raises(UpdateError, match="not JSON"):
        fetch_manifest(NotJson())
    http = FakeHttp()
    assert fetch_manifest(http).version == "9.0.0"
    assert http.calls == [updater.MANIFEST_URL]


# -- download ------------------------------------------------------------------

def test_download_verifies_checksum(tmp_path):
    path = download(Release("9.0.0", SHA, URL), tmp_path, FakeHttp())
    assert path.read_bytes() == EXE and path.name == "MindsetForestSetup-9.0.0.exe"
    assert list(tmp_path.iterdir()) == [path]


def test_download_refuses_a_checksum_mismatch(tmp_path):
    with pytest.raises(UpdateError, match="SHA-256 mismatch"):
        download(Release("9.0.0", SHA, URL), tmp_path, FakeHttp(body=EXE + b"tampered"))
    assert list(tmp_path.iterdir()) == []  # nothing left to run


# -- decisions -----------------------------------------------------------------

def test_can_update():
    assert can_update(frozen=True, enabled=True)
    assert not can_update(frozen=False, enabled=True)
    assert not can_update(frozen=True, enabled=False)


def test_good_moment():
    start = 1000.0
    assert good_moment(now=start + 60, started_at=start, idle=0, busy=False)  # just started
    assert not good_moment(now=start + 60, started_at=start, idle=None, busy=True)  # never mid-capture
    later = start + STARTUP_SECONDS + 1
    assert not good_moment(now=later, started_at=start, idle=30, busy=False)
    assert not good_moment(now=later, started_at=start, idle=None, busy=False)
    assert good_moment(now=later, started_at=start, idle=IDLE_SECONDS, busy=False)
    assert not good_moment(now=later, started_at=start, idle=IDLE_SECONDS * 3, busy=True)


def test_installer_argv_is_the_silent_upgrade():
    assert installer_argv(Path("C:/t/s.exe")) == [str(Path("C:/t/s.exe")), "--install", "--silent"]


class Clock:
    def __init__(self, t=1000.0):
        self.t = t

    def __call__(self):
        return self.t


def make(tmp_path, *, frozen=True, enabled=True, busy=False, idle=0.0, http=None, launch=None, store=None):
    clock = Clock()
    launched = []
    up = Updater(version="1.5.0", store=store or Store(), enabled=lambda: enabled, busy=lambda: busy,
                 frozen=frozen, http=http or FakeHttp(), clock=clock, idle=lambda: idle,
                 launch=launch or launched.append, download_dir=tmp_path / "dl")
    return up, clock, launched


def test_not_frozen_never_checks(tmp_path):
    http = FakeHttp()
    up, _, launched = make(tmp_path, frozen=False, http=http)
    up.start()  # no thread from the sources
    assert not up._thread.is_alive()
    assert up.step() == "off" and http.calls == [] and launched == []


def test_disabled_never_checks(tmp_path):
    http = FakeHttp()
    up, _, launched = make(tmp_path, enabled=False, http=http)
    assert up.step() == "off" and http.calls == [] and launched == []


def test_installs_at_startup(tmp_path):
    store = Store()
    up, clock, launched = make(tmp_path, store=store)
    assert up.step() == "launched"
    exe = tmp_path / "dl" / "MindsetForestSetup-9.0.0.exe"
    assert launched == [[str(exe), "--install", "--silent"]]
    assert exe.read_bytes() == EXE
    assert store.get_kv(KV_ATTEMPT) == "9.0.0 1000"
    assert up.step() == "launched" and len(launched) == 1  # once


def test_waits_for_idle_after_startup(tmp_path):
    up, clock, launched = make(tmp_path, idle=5.0)
    clock.t += STARTUP_SECONDS + 1
    assert up.step() == "pending" and launched == []
    assert up.step() == "pending"  # no second check, the download is kept
    up.idle = lambda: IDLE_SECONDS + 1
    assert up.step() == "launched" and len(launched) == 1


def test_never_during_a_capture(tmp_path):
    up, _, launched = make(tmp_path, busy=True)
    assert up.step() == "pending" and launched == []


def test_checksum_mismatch_installs_nothing(tmp_path):
    up, _, launched = make(tmp_path, http=FakeHttp(body=b"evil"))
    assert up.step() == "failed" and launched == [] and up.pending is None
    assert list((tmp_path / "dl").iterdir()) == []


def test_current_version_installs_nothing_and_rechecks_in_12h(tmp_path):
    http = FakeHttp(manifest={"version": "1.5.0", "sha256": SHA, "url": URL})
    up, clock, launched = make(tmp_path, http=http)
    assert up.step() == "current"
    assert up.step() == "wait" and len(http.calls) == 1
    clock.t += updater.CHECK_EVERY_SECONDS
    assert up.step() == "current" and len(http.calls) == 2 and launched == []


def test_offline_is_quiet(tmp_path):
    up, _, launched = make(tmp_path, http=FakeHttp(error=requests.ConnectionError("offline")))
    assert up.step() == "failed" and launched == []


def test_a_recent_attempt_is_not_repeated(tmp_path):
    store = Store()
    store.set_kv(KV_ATTEMPT, "9.0.0 900")  # the installer ran 100 s ago and this is still 1.5.0
    http = FakeHttp()
    up, _, launched = make(tmp_path, store=store, http=http)
    assert up.step() == "failed" and launched == [] and http.calls == [updater.MANIFEST_URL]


def test_launch_failure_is_logged(tmp_path):
    def boom(argv):
        raise OSError("blocked")

    up, _, _ = make(tmp_path, launch=boom)
    assert up.step() == "failed" and not up.launched


# -- after the restart ------------------------------------------------------------

def test_updated_message_once():
    store = Store()
    assert updated_message(store, "1.5.0") is None  # first run: nothing to compare with
    assert store.get_kv(KV_VERSION) == "1.5.0"
    assert updated_message(store, "1.5.0") is None
    assert updated_message(store, "1.6.0") == "Zaktualizowano do 1.6.0"
    assert updated_message(store, "1.6.0") is None


def test_updated_message_not_for_a_downgrade():
    store = Store()
    store.set_kv(KV_VERSION, "2.0.0")
    assert updated_message(store, "1.6.0") is None
    assert store.get_kv(KV_VERSION) == "1.6.0"
