"""WindowsSampler with a fake win32 API: browser popups, when the address bar is read, and the off switch."""
from __future__ import annotations

import os

import pytest

from mindsetforest_tracker import capture
from mindsetforest_tracker.capture import (
    HOST_RETRIES, PID_CACHE_TTL_SAMPLES, FakeSampler, HostReader, Sample, WindowsSampler, default_sampler,
)

BRAVE, NOTEPAD, FIREFOX, SEARCH, CHROME = 11, 12, 13, 14, 15
PIDS = {BRAVE: "brave.exe", NOTEPAD: "notepad.exe", FIREFOX: "firefox.exe", SEARCH: "SearchHost.exe",
        CHROME: "chrome.exe"}


class FakeApi:
    """The win32 calls WindowsSampler makes; windows are hwnd -> (pid, title, owner)."""

    def __init__(self):
        self.windows: dict[int, tuple[int, str, int]] = {}
        self.fg = 0
        self.idle = 0.0

    def show(self, hwnd, pid, title, owner=0):
        self.windows[hwnd] = (pid, title, owner)
        self.fg = hwnd

    def idle_seconds(self):
        return self.idle

    def foreground(self):
        return self.fg

    def pid(self, hwnd):
        return self.windows[hwnd][0]

    def title(self, hwnd):
        return self.windows[hwnd][1]

    def owner(self, hwnd):
        return self.windows[hwnd][2]

    def is_window(self, hwnd):
        return hwnd in self.windows

    def process_name(self, pid):
        return PIDS.get(pid, "")


class FakeReader:
    """Answers host(hwnd) from ``answers`` (a list is consumed one read at a time)."""

    def __init__(self, answers=None):
        self.answers = answers if answers is not None else {}
        self.calls: list[int] = []
        self.forgotten: list[set[int]] = []
        self.kept: set[int] = set()

    def host(self, hwnd):
        self.calls.append(hwnd)
        value = self.answers.get(hwnd)
        if isinstance(value, list):
            return value.pop(0) if value else None
        if isinstance(value, Exception):
            raise value
        return value

    def windows(self):
        return set(self.kept)

    def forget(self, live):
        self.forgotten.append(set(live))


def sampler(reader=None, **kw):
    api = FakeApi()
    made = []

    def factory():
        made.append(1)
        return reader if reader is not None else FakeReader()

    s = WindowsSampler(api=api, reader_factory=factory, **kw)
    return s, api, made


def test_browser_popups_keep_the_tab_underneath():
    reader = FakeReader({1: "chatgpt.com"})
    s, api, _ = sampler(reader)
    api.show(1, BRAVE, "Prośba o pomoc finansową - Brave")
    tab = s.sample()
    assert (tab.exe, tab.title, tab.host) == ("brave.exe", "Prośba o pomoc finansową - Brave", "chatgpt.com")
    api.show(2, BRAVE, "Save password?", owner=1)  # a bubble the browser window owns
    api.idle = 4.0
    popup = s.sample()
    assert popup == Sample(exe="brave.exe", title=tab.title, idle_seconds=4.0, host="chatgpt.com")
    assert reader.calls == [1]  # the popup's address bar is never looked for
    api.show(3, NOTEPAD, "Save As", owner=9)  # another app's owned dialog is that app
    assert s.sample().exe == "notepad.exe"


def test_an_owned_browser_window_with_nothing_before_it_is_recorded():
    s, api, _ = sampler()
    api.show(2, FIREFOX, "Print", owner=1)
    assert (s.sample().exe, s.sample().title) == ("firefox.exe", "Print")


def test_shell_overlays_own_window_and_lock_still_work():
    s, api, _ = sampler(FakeReader({1: "youtube.com"}))
    api.show(1, CHROME, "Cats - YouTube - Google Chrome")
    tab = s.sample()
    api.show(2, SEARCH, "Search")
    assert s.sample() == tab
    api.show(3, 0, "tray menu")
    api.windows[3] = (os.getpid(), "tray menu", 0)
    assert s.sample() == Sample(tab.exe, tab.title, host="youtube.com", own_window=True)
    api.fg = 0
    assert s.sample().locked


def test_the_address_bar_is_read_once_per_window_and_title():
    reader = FakeReader({1: "chatgpt.com", 2: "github.com"})
    s, api, _ = sampler(reader)
    api.show(1, BRAVE, "Chat A - Brave")
    for _ in range(10):
        assert s.sample().host == "chatgpt.com"
    assert reader.calls == [1]
    api.show(1, BRAVE, "Chat B - Brave")  # a new title: maybe another tab
    s.sample()
    s.sample()
    assert reader.calls == [1, 1]
    api.show(2, CHROME, "repo - GitHub - Google Chrome")  # another window
    assert s.sample().host == "github.com"
    api.show(1, BRAVE, "Chat B - Brave")  # back: the window changed, so read again
    s.sample()
    assert reader.calls == [1, 1, 2, 1]


def test_nothing_from_the_address_bar_is_retried_at_most_three_times():
    reader = FakeReader({1: [None] * 20})
    s, api, _ = sampler(reader)
    api.show(1, BRAVE, "Nowa karta - Brave")
    for _ in range(10):
        assert s.sample().host == ""
    assert len(reader.calls) == 1 + HOST_RETRIES
    api.show(1, BRAVE, "Something else - Brave")
    s.sample()
    assert len(reader.calls) == 2 + HOST_RETRIES


def test_retries_stop_once_a_host_comes():
    reader = FakeReader({1: [None, None, "example.com"]})
    s, api, _ = sampler(reader)
    api.show(1, CHROME, "Example Domain - Google Chrome")
    hosts = [s.sample().host for _ in range(6)]
    assert hosts == ["", "", "example.com", "example.com", "example.com", "example.com"]
    assert len(reader.calls) == 3


def test_only_chromium_browsers_are_read():
    reader = FakeReader({1: "example.com", 2: "example.com"})
    s, api, _ = sampler(reader)
    api.show(1, FIREFOX, "Example Domain — Mozilla Firefox")
    api.show(2, NOTEPAD, "notes.txt - Notepad")
    api.fg = 1
    assert s.sample().host == ""
    api.fg = 2
    assert s.sample().host == ""
    assert reader.calls == []


def test_browser_domains_off_never_makes_the_reader():
    s, api, made = sampler(browser_domains=False)
    api.show(1, CHROME, "Example Domain - Google Chrome")
    for _ in range(5):
        assert s.sample().host == ""
    assert made == []


def test_the_reader_is_made_on_first_use_not_in_the_constructor():
    s, api, made = sampler(FakeReader({1: "example.com"}))
    assert made == []  # the sampler is built on the main thread; the capture thread makes the reader
    api.show(1, CHROME, "Example Domain - Google Chrome")
    s.sample()
    s.sample()
    assert made == [1]


def test_a_reader_that_cannot_start_or_raises_never_breaks_sampling(caplog):
    def broken():
        raise OSError("no comtypes")

    api = FakeApi()
    s = WindowsSampler(api=api, reader_factory=broken)
    api.show(1, CHROME, "Example Domain - Google Chrome")
    assert s.sample() == Sample("chrome.exe", "Example Domain - Google Chrome")
    api.show(1, CHROME, "Other - Google Chrome")
    assert s.sample().title == "Other - Google Chrome"
    assert "no comtypes" in caplog.text and caplog.text.count("no comtypes") == 1  # tried once

    s, api, _ = sampler(FakeReader({1: RuntimeError("boom")}))
    api.show(1, CHROME, "Example Domain - Google Chrome")
    assert s.sample() == Sample("chrome.exe", "Example Domain - Google Chrome")


def test_closed_windows_are_pruned_from_the_reader():
    reader = FakeReader({1: "example.com"})
    reader.kept = {1, 77}  # 77 is gone
    s, api, _ = sampler(reader)
    api.show(1, CHROME, "Example Domain - Google Chrome")
    for _ in range(PID_CACHE_TTL_SAMPLES):
        s.sample()
    assert reader.forgotten == [{1}]


def test_host_reader_without_a_reader_yet_prunes_nothing():
    hosts = HostReader(FakeReader)
    hosts.prune(lambda h: False)  # nothing made yet: nothing to do
    assert hosts.host(5, "t") == ""


def test_windows_sampler_needs_an_api_off_windows(monkeypatch):
    monkeypatch.setattr(capture, "WIN32_AVAILABLE", False)
    with pytest.raises(RuntimeError):
        WindowsSampler()
    assert isinstance(default_sampler(browser_domains=False), FakeSampler)


def test_sample_failure_reports_only_idle():
    s, api, _ = sampler()
    api.fg = 99  # not in api.windows: pid() raises
    api.idle = 2.0
    assert s.sample() == Sample(idle_seconds=2.0)


def test_end_to_end_sessions_from_the_sampler():
    """Sampler -> SessionTracker: the domain names the tab, a popup does not split it, a focused New Tab still has a key."""
    from mindsetforest_tracker.sessions import SessionTracker

    reader = FakeReader({1: "chatgpt.com", 3: [None] * 10})  # 3: New Tab, the omnibox has focus
    s, api, _ = sampler(reader)
    tracker = SessionTracker(min_seconds=2)
    out = []
    t = 1_800_000_000
    script = [(1, BRAVE, "Prośba o pomoc finansową – Brave", 0)] * 5 + \
             [(2, BRAVE, "Save password?", 1)] * 3 + \
             [(1, BRAVE, "Prośba o pomoc finansową – Brave", 0)] * 4 + \
             [(3, BRAVE, "Nowa karta – Brave", 0)] * 6
    for hwnd, pid, title, owner in script:
        api.show(hwnd, pid, title, owner)
        out += tracker.feed(t, s.sample())
        t += 1
    out += tracker.close_current(t)
    assert [(x.app_key, x.seconds) for x in out] == [("Browser | ChatGPT", 12), ("Browser | New Tab", 6)]


# -- the reader on a thread of its own ------------------------------------------------

class ThreadedReader:
    """Records the thread it is made and asked on; ``gate`` holds a read until set."""

    def __init__(self, answers=None, gate=None):
        import threading as _t
        self.made_on = _t.current_thread().name
        self.asked_on = []
        self.answers = answers or {}
        self.gate = gate
        self.forgotten = []

    def host(self, hwnd):
        import threading as _t
        self.asked_on.append(_t.current_thread().name)
        if self.gate is not None:
            self.gate.wait(10)
        return self.answers.get(hwnd)

    def windows(self):
        return set(self.answers)

    def forget(self, live):
        self.forgotten.append(set(live))


def test_threaded_reader_is_made_and_asked_on_its_own_thread():
    made = []
    hosts = HostReader(lambda: made.append(ThreadedReader({1: "example.com"})) or made[-1], threaded=True, wait_seconds=2)
    assert hosts.host(1, "Example - Google Chrome") == "example.com"
    assert made[0].made_on == "mf-hosts" and made[0].asked_on == ["mf-hosts"]
    assert hosts.host(1, "Example - Google Chrome") == "example.com"
    assert made[0].asked_on == ["mf-hosts"]  # same window and title: not asked again


def test_a_hung_read_never_stalls_the_tick_and_its_answer_lands_later():
    import threading
    import time as _time

    gate = threading.Event()
    reader = ThreadedReader({1: "chatgpt.com", 2: "example.com"}, gate=gate)
    hosts = HostReader(lambda: reader, threaded=True, wait_seconds=0.05)
    started = _time.monotonic()
    assert hosts.host(1, "Chat - Brave") == ""  # the browser is busy: titles meanwhile
    assert hosts.host(1, "Chat - Brave") == ""
    assert hosts.host(2, "Other - Brave") == ""  # another window: refused while the read hangs
    assert _time.monotonic() - started < 1.0
    gate.set()
    deadline = _time.monotonic() + 5
    while hosts.host(2, "Other - Brave") != "example.com" and _time.monotonic() < deadline:
        _time.sleep(0.01)
    assert hosts.host(2, "Other - Brave") == "example.com"


def test_threaded_reader_that_cannot_start_turns_domains_off(caplog):
    def broken():
        raise OSError("no comtypes")

    hosts = HostReader(broken, threaded=True, wait_seconds=0.5)
    import time as _time
    deadline = _time.monotonic() + 5
    while hosts.host(1, "t") == "" and _time.monotonic() < deadline and "no comtypes" not in caplog.text:
        _time.sleep(0.01)
    assert hosts.host(1, "t") == "" and hosts.host(2, "u") == ""
    assert caplog.text.count("no comtypes") == 1


def test_threaded_prune_runs_on_the_reader_thread():
    reader = ThreadedReader({1: "example.com", 77: "gone.example"})
    hosts = HostReader(lambda: reader, threaded=True, wait_seconds=2)
    assert hosts.host(1, "Example") == "example.com"
    hosts.prune(lambda h: h == 1)
    import time as _time
    deadline = _time.monotonic() + 5
    while not reader.forgotten and _time.monotonic() < deadline:
        _time.sleep(0.01)
    assert reader.forgotten == [{1}]
