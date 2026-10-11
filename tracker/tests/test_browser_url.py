"""The address-bar reader: the URL parser everywhere, the UIA search against a fake tree that records every read."""
from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path

import pytest

from mindsetforest_tracker import browser_url
from mindsetforest_tracker.browser_url import (
    BACKOFF_SECONDS, FAILED_SEARCH_BACKOFF_SECONDS, MAX_NODES, UIA_EditControlTypeId, UIA_ValueValuePropertyId,
    OmniboxReader, host_from_omnibox,
)

# -- host_from_omnibox ------------------------------------------------------------------

HOSTS = [
    # what the omnibox shows, the host kept
    ("chatgpt.com/c/68ab", "chatgpt.com"),
    ("https://www.youtube.com/x", "youtube.com"),          # "Always show full URLs" on
    ("https://www.youtube.com", "youtube.com"),
    ("www.example.com", "example.com"),
    ("", "newtab"),                                         # New Tab page: empty omnibox
    ("   ", "newtab"),
    (None, "newtab"),
    ("file:///C:/Users/me/a.pdf", "file"),                  # never the path or the user name
    ("FILE:///C:/x", "file"),
    ("brave://settings", "brave"),
    ("chrome://newtab/", "chrome"),
    ("edge://settings/privacy", "edge"),
    ("chrome-extension://abcdefgh/popup.html", "chrome-extension"),
    ("about:blank", "about"),
    ("przelewy24 a fundacja", None),                        # search words, the user typing
    ("chatgpt.com hello", None),
    ("pogoda", None),                                       # one word: a search, not a host
    ("localhost:5173", "localhost"),
    ("localhost:5173/app", "localhost"),
    ("http://127.0.0.1:8000/x", "127.0.0.1"),
    ("192.168.1.1", "192.168.1.1"),
    ("user:pass@example.com/x", "example.com"),             # credentials dropped
    ("https://user@Example.COM./path?q=1#f", "example.com"),
    ("example.com:8443/x", "example.com"),                  # port dropped
    ("example.com?q=1", "example.com"),
    ("example.com#top", "example.com"),
    ("mail.google.com/mail/u/0/#inbox", "mail.google.com"),
    ("pl.wikipedia.org/wiki/Żółw", "pl.wikipedia.org"),
    ("żółw.pl/x", "żółw.pl"),                               # Chrome shows IDN hosts in Unicode
    ("data:text/html,hi", None),
    ("javascript:alert(1)", None),
    ("mailto:a@b.com", None),
    ("view-source:https://example.com", None),
    ("ftp://files.example.com/x", None),
    ("1.2.3", None),                                        # numeric TLD
    ("-bad.com", None),
    ("a_b.com", None),
]


@pytest.mark.parametrize("text,host", HOSTS, ids=[repr(t) for t, _ in HOSTS])
def test_host_from_omnibox(text, host):
    assert host_from_omnibox(text) == host


def test_module_imports_without_comtypes():
    code = ("import sys, mindsetforest_tracker.capture, mindsetforest_tracker.browser_url; "
            "sys.exit('comtypes' in sys.modules)")
    done = subprocess.run([sys.executable, "-c", code], cwd=Path(__file__).resolve().parent.parent)
    assert done.returncode == 0


# -- the reader against a fake UIA tree -----------------------------------------------------


class Null:
    """What comtypes hands back for "no element": a falsy pointer, not None."""

    def __bool__(self):
        return False


NULL = Null()
WEB = "web"  # tag of nodes whose properties must never be read


class Element:
    def __init__(self, cls="", children=(), *, ctype=0, name="", value=None, focus=False, hwnd=0, tag=""):
        self.cls, self.ctype, self.name, self.value, self.focus, self.hwnd = cls, ctype, name, value, focus, hwnd
        self.tag = tag or cls
        self.children = list(children)
        self.parent = None
        for c in self.children:
            c.parent = self
        self.reads: list[str] = []
        self.fail_reads = False

    def _read(self, prop):
        self.reads.append(prop)
        if self.fail_reads:
            raise OSError("element not available")

    @property
    def CurrentClassName(self):
        self._read("ClassName")
        return self.cls

    @property
    def CurrentControlType(self):
        self._read("ControlType")
        return self.ctype

    @property
    def CurrentName(self):
        self._read("Name")
        return self.name

    @property
    def CurrentNativeWindowHandle(self):
        self._read("NativeWindowHandle")
        return self.hwnd or None  # comtypes gives None for a NULL HWND

    @property
    def CurrentHasKeyboardFocus(self):
        self._read("HasKeyboardFocus")
        return int(self.focus)

    def GetCurrentPropertyValue(self, prop_id):
        self._read(f"Property{prop_id}")
        assert prop_id == UIA_ValueValuePropertyId
        return self.value

    def walk(self):
        yield self
        for c in self.children:
            yield from c.walk()


class Walker:
    def __init__(self):
        self.calls = 0

    def GetFirstChildElement(self, el):
        self.calls += 1
        return el.children[0] if el.children else NULL

    def GetNextSiblingElement(self, el):
        self.calls += 1
        siblings = el.parent.children if el.parent else [el]
        i = siblings.index(el)
        return siblings[i + 1] if i + 1 < len(siblings) else NULL


class FakeUIA:
    def __init__(self, windows):
        self.windows = windows
        self.RawViewWalker = Walker()
        self.from_handle = 0

    def ElementFromHandle(self, hwnd):
        self.from_handle += 1
        return self.windows[hwnd]


def web_subtree():
    return Element("RootWebArea", [Element("Document", tag=WEB), Element("Link", tag=WEB)], tag=WEB)


def chrome_window(hwnd=100, omnibox_cls="OmniboxViewViews", value="chatgpt.com/c/68ab", **omnibox):
    omnibox_el = Element(omnibox_cls, ctype=UIA_EditControlTypeId, name="Address and search bar", value=value,
                         tag="omnibox", **omnibox)
    tabs = Element("TabStripRegionView", [Element("Tab", tag="tab") for _ in range(30)])
    toolbar = Element("ToolbarView", [Element("BackButton"), Element("LocationBarView", [omnibox_el])])
    top = Element("TopContainerView", [tabs, toolbar, Element("BookmarkBarView", [Element("Bookmark", tag="bm")])])
    contents = Element("ContentsWebView", [web_subtree()])
    legacy = Element("Chrome_RenderWidgetHostHWND", [web_subtree()], hwnd=hwnd + 1, tag=WEB)
    root = Element("BrowserRootView", [Element("NonClientView", [Element("BrowserView", [top, contents])]), legacy],
                   hwnd=hwnd, tag="window")
    return root, omnibox_el


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


WINDOW_CLASSES = {101: "Chrome_RenderWidgetHostHWND", 201: "Chrome_RenderWidgetHostHWND"}


def make_reader(windows, clock=None, **kw):
    uia = FakeUIA(windows)
    made = []

    def factory():
        made.append(1)
        return uia

    reader = OmniboxReader(client_factory=factory, window_class=lambda h: WINDOW_CLASSES.get(h, ""),
                           clock=clock or Clock(), **kw)
    return reader, uia, made


def test_reads_the_host_and_never_touches_web_content():
    root, omnibox = chrome_window()
    reader, uia, made = make_reader({100: root})
    assert reader.host(100) == "chatgpt.com"
    for el in root.walk():
        if el.tag == WEB:
            # Not even ClassName: only the HWND, which UIA itself answers.
            assert set(el.reads) <= {"NativeWindowHandle"}, (el.cls, el.reads)
        if el.tag in ("tab", "bm"):
            assert el.reads == [], el.cls  # skipped subtrees are not walked
    legacy = root.children[1]
    assert legacy.reads == ["NativeWindowHandle"]
    assert omnibox.reads[-2:] == ["HasKeyboardFocus", f"Property{UIA_ValueValuePropertyId}"]
    assert made == [1] and reader.reads == 1 and reader.failures == 0


def test_the_found_omnibox_is_kept_per_window():
    root, omnibox = chrome_window()
    reader, uia, _ = make_reader({100: root})
    reader.host(100)
    walked, searched = uia.RawViewWalker.calls, uia.from_handle
    omnibox.value = "https://www.rybiapaka.pl/sklep?x=1"
    assert reader.host(100) == "rybiapaka.pl"
    assert (uia.RawViewWalker.calls, uia.from_handle) == (walked, searched)  # one property read, no search
    assert reader.windows() == {100}


def test_brave_class_and_the_polish_name_fallback():
    brave, _ = chrome_window(omnibox_cls="BraveOmniboxViewViews", value="search.brave.com/search?q=x")
    reader, _, _ = make_reader({100: brave})
    assert reader.host(100) == "search.brave.com"
    # A browser that renamed the view: an Edit named like the omnibox (here in Polish) still counts.
    renamed, el = chrome_window(hwnd=200, omnibox_cls="EdgeLocationView", value="example.com")
    el.name = "Pasek adresu i wyszukiwania"
    reader, _, _ = make_reader({200: renamed})
    assert reader.host(200) == "example.com"
    # Named so but not an Edit: not the omnibox.
    wrong, el = chrome_window(hwnd=300, omnibox_cls="SomethingElse", value="example.com")
    el.ctype = 50000
    reader, _, _ = make_reader({300: wrong})
    assert reader.host(300) is None


def test_nothing_while_the_user_types_or_for_a_non_text_value():
    root, omnibox = chrome_window(value="przelewy24 a fun", focus=True)
    reader, _, _ = make_reader({100: root})
    assert reader.host(100) is None  # focused: the text is what the user types
    assert f"Property{UIA_ValueValuePropertyId}" not in omnibox.reads
    omnibox.focus = False
    omnibox.value = None  # VT_EMPTY: not an empty omnibox, just nothing
    assert reader.host(100) is None
    omnibox.value = ""
    assert reader.host(100) == "newtab"


def test_a_window_without_omnibox_is_searched_again_only_after_the_back_off():
    popup = Element("BubbleFrameView", [Element("Label"), Element("Button")], hwnd=100)
    clock = Clock()
    reader, uia, _ = make_reader({100: popup}, clock)
    assert reader.host(100) is None
    searches = uia.from_handle
    clock.t += BACKOFF_SECONDS - 1
    assert reader.host(100) is None and uia.from_handle == searches
    clock.t += 2
    assert reader.host(100) is None and uia.from_handle == searches + 1
    assert reader.failures == 0  # no omnibox is not a failure


def test_a_failed_read_drops_the_element_and_searches_again():
    root, omnibox = chrome_window()
    reader, uia, _ = make_reader({100: root})
    assert reader.host(100) == "chatgpt.com"
    omnibox.fail_reads = True
    assert reader.host(100) is None
    assert reader.failures == 1 and reader.windows() == set()
    omnibox.fail_reads = False
    searches = uia.from_handle
    assert reader.host(100) == "chatgpt.com" and uia.from_handle == searches + 1


def test_a_failed_search_backs_off_briefly(caplog):
    class Hung(FakeUIA):
        def ElementFromHandle(self, hwnd):
            self.from_handle += 1
            raise TimeoutError("UIA timed out")

    clock = Clock()
    uia = Hung({})
    reader = OmniboxReader(client_factory=lambda: uia, window_class=lambda h: "", clock=clock)
    with caplog.at_level(logging.INFO, logger="mindsetforest_tracker.browser_url"):
        assert reader.host(100) is None
    assert reader.failures == 1 and "TimeoutError" in caplog.text
    assert reader.host(100) is None and uia.from_handle == 1  # backing off
    clock.t += FAILED_SEARCH_BACKOFF_SECONDS + 1
    assert reader.host(100) is None and uia.from_handle == 2


def test_no_ui_automation_turns_the_reader_off_once(caplog):
    calls = []

    def broken():
        calls.append(1)
        raise OSError("comtypes missing")

    reader = OmniboxReader(client_factory=broken, window_class=lambda h: "", clock=Clock())
    with caplog.at_level(logging.WARNING, logger="mindsetforest_tracker.browser_url"):
        assert reader.host(100) is None
        assert reader.host(100) is None
    assert calls == [1] and reader.disabled and "comtypes missing" in caplog.text
    assert OmniboxReader(client_factory=broken).host(0) is None and calls == [1]  # no window: nothing made


def test_the_search_is_bounded():
    wide = Element("BrowserRootView", [Element(f"View{i}") for i in range(MAX_NODES * 3)], hwnd=100)
    reader, _, _ = make_reader({100: wide})
    assert reader.host(100) is None
    assert sum(1 for el in wide.walk() if el.reads) <= MAX_NODES

    deep = leaf = Element("Leaf")
    for _ in range(40):
        deep = Element("Group", [deep])
    deep.hwnd = 200
    reader, _, _ = make_reader({200: deep})
    assert reader.host(200) is None and leaf.reads == []  # past MAX_DEPTH

    class SlowClock(Clock):
        def __call__(self):
            self.t += 0.5  # every node "takes" half a second
            return self.t

    root, omnibox = chrome_window()
    reader, _, _ = make_reader({100: root}, SlowClock())
    assert reader.host(100) is None and omnibox.reads == []  # out of time before the toolbar


def test_forget_and_describe():
    a, _ = chrome_window(100)
    b, _ = chrome_window(200)
    reader, _, _ = make_reader({100: a, 200: b})
    reader.host(100)
    reader.host(200)
    assert reader.describe(100) == {"class_name": "OmniboxViewViews", "name": "Address and search bar",
                                    "control_type": UIA_EditControlTypeId}
    assert reader.describe(100, value=True)["value"] == "chatgpt.com/c/68ab"
    reader.forget({200})
    assert reader.windows() == {200} and reader.describe(100) is None


def test_the_omnibox_text_is_never_logged(caplog):
    root, omnibox = chrome_window(value="secret-shop.pl/orders/12345?token=abc")
    reader, _, _ = make_reader({100: root})
    with caplog.at_level(logging.DEBUG):
        assert reader.host(100) == "secret-shop.pl"
        omnibox.fail_reads = True
        assert reader.host(100) is None
    assert "orders" not in caplog.text and "token" not in caplog.text


def test_slow_reads_are_logged_but_not_every_time(caplog, monkeypatch):
    root, _ = chrome_window()
    reader, _, _ = make_reader({100: root})
    ticks = iter(range(0, 10**6, 1))
    monkeypatch.setattr(browser_url.time, "perf_counter", lambda: next(ticks))  # every read "takes" 1 s
    with caplog.at_level(logging.INFO, logger="mindsetforest_tracker.browser_url"):
        for _ in range(60):
            reader.host(100)
    assert reader.slow == 60
    assert caplog.text.count("Reading the address bar took") == 6  # the first five, then every 50th


def test_window_class_is_only_asked_for_child_windows():
    asked = []
    root, _ = chrome_window()
    reader = OmniboxReader(client_factory=lambda: FakeUIA({100: root}),
                           window_class=lambda h: asked.append(h) or WINDOW_CLASSES.get(h, ""), clock=Clock())
    assert reader.host(100) == "chatgpt.com"
    assert asked == [101]  # the top window itself and HWND-less views are never looked up


def test_comtypes_logs_stay_quiet():
    assert logging.getLogger("comtypes").level == logging.WARNING
    assert browser_url.CHROMIUM_EXES >= {"chrome.exe", "msedge.exe", "brave.exe"}
    assert "firefox.exe" not in browser_url.CHROMIUM_EXES


# -- scripts/probe_omnibox.py (CI's check on real browsers): the exit codes ------------------

def _probe_script():
    import importlib.util

    path = Path(__file__).resolve().parent.parent / "scripts" / "probe_omnibox.py"
    spec = importlib.util.spec_from_file_location("probe_omnibox", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_probe_script_exit_codes(monkeypatch):
    probe = _probe_script()
    monkeypatch.setattr(probe.sys, "platform", "linux")
    assert probe.main([]) == 2  # Windows only
    monkeypatch.setattr(probe.sys, "platform", "win32")
    installed = {"edge": Path("msedge.exe")}
    monkeypatch.setattr(probe, "find_exe", lambda name: installed.get(name))
    calls = []

    def fake_probe(name, exe, url, expect, timeout, raw):
        calls.append((name, url, expect, raw))
        return outcome[name]

    monkeypatch.setattr(probe, "probe", fake_probe)
    outcome = {"edge": True}
    assert probe.main(["--require", "edge", "--raw"]) == 0  # chrome missing: skipped
    assert calls == [("edge", "https://example.com", "example.com", True)]
    outcome = {"edge": False}
    assert probe.main([]) == 1
    assert probe.main(["--require", "chrome"]) == 2  # a required browser is missing
    installed.clear()
    assert probe.main([]) == 2  # nothing to probe
    installed["brave"] = Path("brave.exe")
    outcome = {"brave": True}
    assert probe.main(["--browser", "brave", "--url", "https://www.example.org/x"]) == 0
    assert calls[-1][:3] == ("brave", "https://www.example.org/x", "example.org")
