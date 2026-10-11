"""The domain of the active tab of a Chromium browser window, read from its address bar.

Chrome, Edge, Brave, Vivaldi, Opera and Arc draw the address bar (the
"omnibox") as native browser UI, so UI Automation reads it without a browser
extension or flag. ``capture.HostReader`` asks only when the window or its
title changes, about once a minute, never every tick.

Privacy: only a host leaves this module (``chatgpt.com``), never the path, the
query or the omnibox text. A local file is ``file`` (no file name, no user
name), an internal page its scheme (``brave``), the empty omnibox of a New Tab
page ``newtab``. Nothing here logs what the omnibox shows.

Rules taken from Chromium's ``ui/accessibility/platform/ax_platform_node_win.cc``:

* Properties of browser-UI nodes never switch on accessibility for web
  content. Name, ClassName, ControlType or IsControlElement of a WEB-CONTENT
  node do, for the whole browser (more CPU and memory in every tab). So the
  search for the omnibox walks the raw view (the control view asks every node
  for IsControlElement), never descends into ``*WebView`` / ``*WebUIView``
  nodes and never reads a property of the render widget's own HWND.
* Once found, the omnibox element is kept per window: a read is then one
  cross-process property get, with 500 ms UIA timeouts so a hung browser
  cannot stall the capture loop. A window without an omnibox (a popup, an
  installed web app, DevTools) is not searched again for 5 minutes.

COM objects belong to the thread that made them: create and use a reader on
one thread (the capture thread). comtypes is imported on first use only, so
this module imports anywhere; the tests drive it with a fake UIA client.
"""
from __future__ import annotations

import logging
import re
import sys
import threading
import time
from collections import deque
from collections.abc import Callable, Iterable
from typing import Any

log = logging.getLogger(__name__)
# comtypes logs every wrapper module it loads at INFO; tracker.log does not need that.
logging.getLogger("comtypes").setLevel(logging.WARNING)

# Browsers whose address bar this reads (Firefox works differently and is not read).
CHROMIUM_EXES = frozenset({
    "chrome.exe", "chromium.exe", "msedge.exe", "brave.exe", "vivaldi.exe", "opera.exe", "opera_gx.exe", "arc.exe",
})

# What ``host_from_omnibox`` returns besides real hosts (``normalize.app_key`` names them).
NEW_TAB_HOST = "newtab"
FILE_HOST = "file"
INTERNAL_SCHEMES = frozenset({
    "chrome", "brave", "edge", "vivaldi", "opera", "about", "chrome-extension", "devtools", "view-source",
    "chrome-search", "chrome-untrusted",
})

# Chrome's view is "OmniboxViewViews", Brave's "BraveOmniboxViewViews". ClassName is the same in every language.
OMNIBOX_CLASS_SUFFIX = "OmniboxViewViews"
# IDS_ACCNAME_LOCATION in English and Polish: the fallback for a browser that renamed the view.
OMNIBOX_NAMES = frozenset({"address and search bar", "pasek adresu i wyszukiwania"})
# Never descend into these: web content lives under *WebView; the tab strip and the
# bookmarks bar are many nodes that cannot hold the omnibox.
SKIP_CLASS_SUFFIXES = ("WebView", "WebUIView", "TabStripRegionView", "TabStrip", "BookmarkBarView")
# Win32 class of the HWND that hosts a page: its UIA element is web content, so not even its ClassName is read.
WEB_HWND_CLASSES = frozenset({"Chrome_RenderWidgetHostHWND"})
MAX_NODES = 400
MAX_DEPTH = 16
DISCOVERY_BUDGET_SECONDS = 2.0
TIMEOUT_MS = 500
BACKOFF_SECONDS = 300.0           # a window without an omnibox
FAILED_SEARCH_BACKOFF_SECONDS = 30.0  # the search itself failed (window closing, browser hung)
SLOW_READ_MS = 250

# UIAutomationClient.h
UIA_ValueValuePropertyId = 30045
UIA_EditControlTypeId = 50004

COINIT_MULTITHREADED = 0x0
COINIT_APARTMENTTHREADED = 0x2
RPC_E_CHANGED_MODE = 0x80010106

_URL_RE = re.compile(
    r"^(?:(?P<scheme>[a-z][a-z0-9+.-]*)://|(?P<opaque>about|data|blob|javascript|mailto|view-source):)?"  # Chrome hides https://
    r"(?:[^@/\s?#]*@)?"                              # optional user:pass@ (dropped)
    r"(?P<host>[^/\s?#:@]+)"                         # host
    r"(?::\d+)?"                                     # optional port (dropped)
    r"(?=$|[/?#])",                                  # then end or path: no spaces, so no search words
    re.IGNORECASE,
)
_LABEL_RE = re.compile(r"^[a-z0-9\u00a1-\uffff](?:[a-z0-9\u00a1-\uffff-]{0,61}[a-z0-9\u00a1-\uffff])?$", re.IGNORECASE)
_IPV4_RE = re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}$")


def host_from_omnibox(text: str | None) -> str | None:
    """Host shown in the address bar, or a marker; None when the text is not a URL.

    ``'chatgpt.com/c/68ab'``         -> ``'chatgpt.com'``
    ``'https://www.youtube.com/x'``  -> ``'youtube.com'``   ("Always show full URLs" on)
    ``''``                           -> ``'newtab'``        (a New Tab page shows an empty omnibox)
    ``'file:///C:/Users/me/a.pdf'``  -> ``'file'``          (the path is never kept)
    ``'brave://settings'``           -> ``'brave'``
    ``'przelewy24 a fundacja'``      -> None              (search terms, the user typing)
    """
    value = (text or "").strip()
    if not value:
        return NEW_TAB_HOST
    if value.lower().startswith("file:"):
        return FILE_HOST
    m = _URL_RE.match(value)
    if not m:
        return None
    if m.group("opaque"):
        return "about" if m.group("opaque").lower() == "about" else None
    scheme = (m.group("scheme") or "").lower()
    if scheme in INTERNAL_SCHEMES:
        return scheme
    if scheme and scheme not in ("http", "https"):
        return None  # ftp:, ws:, a custom app scheme ...
    host = m.group("host").lower().rstrip(".")
    if host == "localhost" or _IPV4_RE.match(host):
        return host
    labels = host.split(".")
    if len(labels) < 2 or not all(_LABEL_RE.match(lb) for lb in labels) or labels[-1].isdigit():
        return None
    return host.removeprefix("www.")


class OmniboxReader:
    """Reads the address bar of Chromium windows. Create and use it on one thread.

    ``client_factory`` makes the UIA client (``create_client`` by default);
    ``window_class`` gives the Win32 class of an HWND without UI Automation;
    ``clock`` is monotonic seconds. The tests replace all three.
    """

    def __init__(self, *, timeout_ms: int = TIMEOUT_MS, backoff_seconds: float = BACKOFF_SECONDS,
                 client_factory: Callable[[], Any] | None = None,
                 window_class: Callable[[int], str] | None = None,
                 clock: Callable[[], float] = time.monotonic) -> None:
        self._client_factory = client_factory or (lambda: create_client(timeout_ms))
        self._window_class = window_class or _window_class
        self._backoff_seconds = backoff_seconds
        self._clock = clock
        self._uia: Any = None
        self._omnibox: dict[int, Any] = {}    # hwnd -> cached IUIAutomationElement
        self._backoff: dict[int, float] = {}  # hwnd -> clock time to search again
        self.disabled = False                 # UI Automation unavailable: every read is None
        self.reads = 0
        self.failures = 0
        self.slow = 0

    def host(self, hwnd: int) -> str | None:
        """Host of the active tab of ``hwnd``, or None (no omnibox, user typing, not a URL, any error)."""
        if self.disabled or not hwnd:
            return None
        uia = self._client()
        if uia is None:
            return None
        started = time.perf_counter()
        try:
            el = self._omnibox.get(hwnd) or self._find(uia, hwnd)
            if not el:
                return None
            self.reads += 1
            if el.CurrentHasKeyboardFocus:  # the user is typing or moving through suggestions
                return None
            value = el.GetCurrentPropertyValue(UIA_ValueValuePropertyId)
            return host_from_omnibox(value) if isinstance(value, str) else None
        except Exception as exc:  # stale element, browser closing, timeout
            self._omnibox.pop(hwnd, None)
            self._failed(exc)
            return None
        finally:
            ms = (time.perf_counter() - started) * 1000
            if ms > SLOW_READ_MS:
                self.slow += 1
                if self.slow <= 5 or self.slow % 50 == 0:
                    log.info("Reading the address bar took %.0f ms (%d slow reads so far)", ms, self.slow)

    def windows(self) -> set[int]:
        """Windows this reader keeps something for (a found omnibox or a back-off)."""
        return set(self._omnibox) | set(self._backoff)

    def forget(self, live_hwnds: Iterable[int]) -> None:
        """Drop what is kept for windows that no longer exist."""
        live = set(live_hwnds)
        for cache in (self._omnibox, self._backoff):
            for hwnd in [h for h in cache if h not in live]:
                cache.pop(hwnd, None)

    def describe(self, hwnd: int, *, value: bool = False) -> dict[str, Any] | None:
        """ClassName, Name and ControlType of the omnibox found in ``hwnd`` (scripts/probe_omnibox.py).

        ``value=True`` adds the raw omnibox text: for diagnosis on a test page only, never logged.
        """
        el = self._omnibox.get(hwnd)
        if not el:
            return None
        out = {"class_name": el.CurrentClassName, "name": el.CurrentName, "control_type": el.CurrentControlType}
        if value:
            out["value"] = el.GetCurrentPropertyValue(UIA_ValueValuePropertyId)
        return out

    # -- internals -------------------------------------------------------------

    def _client(self) -> Any:
        if self._uia is None:
            try:
                self._uia = self._client_factory()
            except Exception as exc:
                self.disabled = True
                log.warning("UI Automation is unavailable, so browser tabs are named from their titles only: %s", exc)
                return None
        return self._uia

    def _failed(self, exc: BaseException) -> None:
        self.failures += 1
        if self.failures == 1 or self.failures % 100 == 0:
            log.info("Reading the address bar failed (%d failures in %d reads): %s: %s",
                     self.failures, self.reads, type(exc).__name__, exc)
        else:
            log.debug("Reading the address bar failed: %s", exc)

    def _find(self, uia: Any, hwnd: int) -> Any:
        """The omnibox of ``hwnd`` (cached), or None (and a back-off) when the window has none."""
        now = self._clock()
        if self._backoff.get(hwnd, 0.0) > now:
            return None
        try:
            el, visited = self._search(uia, hwnd, now)
        except Exception:
            self._backoff[hwnd] = now + min(self._backoff_seconds, FAILED_SEARCH_BACKOFF_SECONDS)
            raise
        if el:
            self._omnibox[hwnd] = el
            self._backoff.pop(hwnd, None)
            return el
        # Bubbles ("Save password?"), installed web apps, DevTools: no omnibox. Not again for a while.
        self._backoff[hwnd] = now + self._backoff_seconds
        log.debug("No address bar in window %s (%d nodes looked at)", hwnd, visited)
        return None

    def _search(self, uia: Any, hwnd: int, started: float) -> tuple[Any, int]:
        """Breadth-first over browser UI only: never a property of a web-content node."""
        walker = uia.RawViewWalker
        queue = deque([(uia.ElementFromHandle(hwnd), 0)])
        visited = 0
        while queue and visited < MAX_NODES and self._clock() - started <= DISCOVERY_BUDGET_SECONDS:
            el, depth = queue.popleft()
            visited += 1
            if self._is_web_hwnd(el, hwnd):
                continue
            cls = el.CurrentClassName or ""
            if cls.endswith(OMNIBOX_CLASS_SUFFIX):
                return el, visited
            if cls.endswith(SKIP_CLASS_SUFFIXES):
                continue  # never touch web content: it would switch on renderer accessibility
            if el.CurrentControlType == UIA_EditControlTypeId and (el.CurrentName or "").strip().lower() in OMNIBOX_NAMES:
                return el, visited
            if depth >= MAX_DEPTH:
                continue
            child = walker.GetFirstChildElement(el)
            while child:  # a NULL COM pointer is falsy, never None
                queue.append((child, depth + 1))
                child = walker.GetNextSiblingElement(child)
        return None, visited

    def _is_web_hwnd(self, el: Any, top: int) -> bool:
        """True for the page's own HWND, told by its Win32 class (NativeWindowHandle comes from UIA itself)."""
        handle = el.CurrentNativeWindowHandle or 0
        return bool(handle) and handle != top and self._window_class(handle) in WEB_HWND_CLASSES


# -- Windows only ----------------------------------------------------------------------

def _init_com() -> None:  # pragma: no cover - Windows only
    """COM for the calling thread, multithreaded as UIA clients should be, then ``import comtypes``.

    ``import comtypes`` initialises COM for the importing thread itself, with
    ``sys.coinit_flags`` (default: single-threaded), and raises when the thread
    already has the other mode. So the mode is settled here first and the
    import is told the same one. A thread that is already single-threaded
    stays so (UI Automation works there too).
    """
    import ctypes

    init = ctypes.WinDLL("ole32").CoInitializeEx  # own instance: argtypes stay local
    init.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
    init.restype = ctypes.c_long
    hr = init(None, COINIT_MULTITHREADED) & 0xFFFFFFFF
    mode = COINIT_APARTMENTTHREADED if hr == RPC_E_CHANGED_MODE else COINIT_MULTITHREADED
    missing = object()
    saved = getattr(sys, "coinit_flags", missing)
    sys.coinit_flags = mode
    try:
        import comtypes  # noqa: F401 - initialises COM for this thread on first import
    finally:
        if saved is missing:
            del sys.coinit_flags
        else:
            sys.coinit_flags = saved


def create_client(timeout_ms: int = TIMEOUT_MS) -> Any:  # pragma: no cover - Windows only
    """A UIA client for the calling thread, with short timeouts where Windows has them (8 and later)."""
    _init_com()
    import comtypes.client

    mod = comtypes.client.GetModule("UIAutomationCore.dll")  # build-exe.ps1 bundles the generated wrapper
    try:
        uia = comtypes.client.CreateObject(mod.CUIAutomation8, interface=mod.IUIAutomation2)
        uia.ConnectionTimeout = timeout_ms   # default 2000 ms
        uia.TransactionTimeout = timeout_ms  # a hung browser must not stall the tick
    except Exception:
        uia = comtypes.client.CreateObject(mod.CUIAutomation, interface=mod.IUIAutomation)
    return uia


_get_class_name: Any = None


def _window_class(hwnd: int) -> str:  # pragma: no cover - Windows only
    """Win32 class name of ``hwnd`` ("" on failure)."""
    global _get_class_name
    import ctypes

    if _get_class_name is None:
        fn = ctypes.WinDLL("user32").GetClassNameW  # own instance: argtypes stay local
        fn.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_int]
        fn.restype = ctypes.c_int
        _get_class_name = fn
    buf = ctypes.create_unicode_buffer(256)
    return buf.value if _get_class_name(hwnd, buf, len(buf)) else ""


def self_check(timeout_seconds: float = 30.0) -> str:  # pragma: no cover - Windows only
    """``--self-test``: the frozen exe can make a UIA client, with the bundled comtypes wrapper.

    Runs on a thread of its own, like the capture thread, so the caller's COM
    mode is not touched. Returns the desktop's class name; raises on failure.
    """
    result: dict[str, Any] = {}

    def run() -> None:
        try:
            _init_com()
            if getattr(sys, "frozen", False):
                import importlib.util

                if importlib.util.find_spec("comtypes.gen.UIAutomationClient") is None:
                    raise RuntimeError("comtypes.gen.UIAutomationClient is not bundled (build-exe.ps1 generates it)")
            uia = create_client()
            _ = uia.RawViewWalker
            result["value"] = uia.GetRootElement().CurrentClassName or ""
        except BaseException as exc:  # handed to the caller
            result["error"] = exc

    worker = threading.Thread(target=run, name="mf-uia-check", daemon=True)
    worker.start()
    worker.join(timeout_seconds)
    if worker.is_alive():
        raise TimeoutError(f"creating the UI Automation client took over {timeout_seconds:.0f} s")
    if "error" in result:
        raise result["error"]
    return result["value"]
