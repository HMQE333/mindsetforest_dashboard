"""Pure functions that turn a raw (exe name, window title) pair into

* ``app_display_name`` - the human name shown in the tray and stored in ``app``;
* ``app_key`` - a deliberately low-cardinality identity stored in ``app_key``,
  which is what the web dashboard classifies into classes.

Rules for ``app_key`` (first match wins):

1. Browsers -> ``"Browser | <site>"`` regardless of which browser it is.
   With the active tab's host (Chromium browsers, ``browser_url``) the host
   decides: a well-known service by its exact host, or by a parent domain
   for services that own every subdomain (``old.reddit.com`` -> ``Reddit``);
   else the host itself (``rybiapaka.pl``). An empty omnibox is ``New Tab``,
   a local file ``Local file``, an internal page (``brave://settings``)
   ``Browser page``. Discord conversation titles keep their key (below).
   Without a host the title decides: ``site`` is a well-known service named
   anywhere in the title (``youtube.com`` -> ``YouTube``); else a domain-like
   token (``github.com``); else the LAST title segment after the browser's
   own name and profile are removed
   (``"Never Gonna Give You Up - YouTube - Google Chrome"`` -> ``YouTube``).
   A New Tab page's title (``Nowa karta``) is ``New Tab`` and X's title shape
   (``"Name (@handle) / X"``) is ``X``.
   Titles of a conversation (a ``@person`` or ``#channel`` segment, as in
   ``"Discord | @Arnold"``) keep that last segment, so each chat is its own
   key (``@Arnold``); a one-word
   title (``"(2) Facebook"``) is taken as the site; otherwise ``"Browser | other"``.
2. IDEs/editors -> ``"<App> | <project>"``. VS Code style titles are
   ``"file - project - App"`` (project = second to last segment); JetBrains
   and Visual Studio put the project first (``"project – file"``). Without a
   project the key is just the app name.
3. Electron workspace hosts (Rambox, Franz, Ferdi, Ferdium, Station) take the
   workspace name from the title suffix: ``"Slack - Rambox"`` -> ``Slack``.
4. UWP apps hosted by ``ApplicationFrameHost.exe`` use their window title.
5. Everything else -> the display name (``"Document1 - Word"`` -> ``Word``).

Titles are cleaned first: zero-width and non-breaking spaces, control
characters and lone surrogates removed and whitespace collapsed. Edge puts a
zero-width space in its own name, and a lone surrogate (win32 can hand one
over) would make SQLite raise ``UnicodeEncodeError``.
"""
from __future__ import annotations

import re

from .browser_url import FILE_HOST, INTERNAL_SCHEMES, NEW_TAB_HOST

BROWSERS: dict[str, str] = {
    "chrome.exe": "Chrome", "chromium.exe": "Chromium", "msedge.exe": "Edge",
    "firefox.exe": "Firefox", "brave.exe": "Brave", "opera.exe": "Opera",
    "opera_gx.exe": "Opera GX", "vivaldi.exe": "Vivaldi", "waterfox.exe": "Waterfox",
    "librewolf.exe": "LibreWolf", "floorp.exe": "Floorp", "arc.exe": "Arc", "zen.exe": "Zen",
}

# Title segments that are the browser's own name (dropped before picking a site).
BROWSER_TITLE_WORDS = {
    "google chrome", "chromium", "mozilla firefox", "firefox", "microsoft edge",
    "brave", "opera", "opera gx", "vivaldi", "waterfox", "librewolf", "floorp", "arc",
    "zen browser", "zen", "mozilla firefox private browsing",
    "mozilla firefox (private browsing)",
    # profile names Chromium browsers put next to their own name
    "personal", "work", "default", "osobisty", "prywatny", "praca", "służbowy", "domyślny",
    "profile 1", "person 1", "osoba 1",
}

# Services named by their own title segment or domain, so every way a title
# spells them lands on one key. A segment matching a name wins over the rest.
# A tab's host maps to the same names, so label rules written for a title-derived
# key (``Browser | Proton Mail``) keep matching once the host is known: keep the names.
KNOWN_SITES: dict[str, tuple[str, ...]] = {
    "YouTube": ("youtube.com", "youtu.be", "m.youtube.com", "music.youtube.com"),
    "Discord": ("discord.com", "discordapp.com"),
    "Instagram": ("instagram.com",),
    "Facebook": ("facebook.com",),
    "Messenger": ("messenger.com",),
    "WhatsApp": ("web.whatsapp.com", "whatsapp.com"),
    "X": ("x.com", "twitter.com"),
    "Reddit": ("reddit.com",),
    "LinkedIn": ("linkedin.com",),
    "TikTok": ("tiktok.com",),
    "Twitch": ("twitch.tv",),
    "Netflix": ("netflix.com",),
    "Spotify": ("open.spotify.com", "spotify.com"),
    "Gmail": ("mail.google.com",),
    "ChatGPT": ("chatgpt.com", "chat.openai.com"),
    "Claude": ("claude.ai",),
    "GitHub": ("github.com",),
    "Notion": ("notion.so",),
    "Google Gemini": ("gemini.google.com",),
    "Google Search": ("google.com", "google.pl"),
    "Perplexity": ("perplexity.ai",),
    "Proton Mail": ("mail.proton.me",),
    "Miro": ("miro.com",),
    "Lovable": ("lovable.dev",),
    "MindsetForest": ("hmqe333.github.io",),  # this dashboard (config.DEFAULT_DASHBOARD_URL)
}
_SITE_BY_NAME = {name.lower(): name for name in KNOWN_SITES}
_SITE_BY_DOMAIN = {d: name for name, domains in KNOWN_SITES.items() for d in domains}
# Known domains whose every subdomain is the same service (old.reddit.com is Reddit). The
# rest match their exact host only: docs.google.com is not Google Search, calendar.proton.me
# is not Proton Mail.
WHOLE_SITE_DOMAINS = frozenset({
    "youtube.com", "youtu.be", "discord.com", "discordapp.com", "instagram.com", "facebook.com", "messenger.com",
    "whatsapp.com", "x.com", "twitter.com", "reddit.com", "linkedin.com", "tiktok.com", "twitch.tv", "netflix.com",
    "spotify.com", "chatgpt.com", "claude.ai", "github.com", "notion.so", "perplexity.ai", "miro.com", "lovable.dev",
})

# The tab title of a New Tab page, in the browsers and languages seen so far.
NEW_TAB_TITLES = frozenset({
    "new tab", "nowa karta", "new private tab", "nowa karta prywatna", "new incognito tab", "nowa karta incognito",
    "new inprivate tab", "nowa karta inprivate",
})
NEW_TAB_SITE = "New Tab"
LOCAL_FILE_SITE = "Local file"
BROWSER_PAGE_SITE = "Browser page"

# exe -> (display name, where the project sits in the title)
EDITORS: dict[str, tuple[str, str]] = {
    "code.exe": ("Code", "before_app"), "code - insiders.exe": ("Code", "before_app"),
    "cursor.exe": ("Cursor", "before_app"), "windsurf.exe": ("Windsurf", "before_app"),
    "zed.exe": ("Zed", "before_app"),
    "pycharm64.exe": ("PyCharm", "first"), "idea64.exe": ("IntelliJ IDEA", "first"),
    "webstorm64.exe": ("WebStorm", "first"), "clion64.exe": ("CLion", "first"),
    "rider64.exe": ("Rider", "first"), "goland64.exe": ("GoLand", "first"),
    "phpstorm64.exe": ("PhpStorm", "first"), "datagrip64.exe": ("DataGrip", "first"),
    "rustrover64.exe": ("RustRover", "first"), "devenv.exe": ("Visual Studio", "first"),
}

# exe -> (title suffix, fallback display name)
WORKSPACE_APPS: dict[str, tuple[str, str]] = {
    "rambox.exe": (" - Rambox", "Rambox"), "franz.exe": (" - Franz", "Franz"),
    "ferdi.exe": (" - Ferdi", "Ferdi"), "ferdium.exe": (" - Ferdium", "Ferdium"),
    "station.exe": (" - Station", "Station"),
}

HOST_PROCESSES = {"applicationframehost.exe"}

DISPLAY_NAMES: dict[str, str] = {
    "explorer.exe": "Explorer", "winword.exe": "Word", "excel.exe": "Excel",
    "powerpnt.exe": "PowerPoint", "outlook.exe": "Outlook", "olk.exe": "Outlook",
    "onenote.exe": "OneNote", "windowsterminal.exe": "Terminal", "cmd.exe": "Command Prompt",
    "powershell.exe": "PowerShell", "pwsh.exe": "PowerShell", "conhost.exe": "Console",
    "discord.exe": "Discord", "slack.exe": "Slack", "ms-teams.exe": "Teams",
    "teams.exe": "Teams", "spotify.exe": "Spotify", "notion.exe": "Notion",
    "obsidian.exe": "Obsidian", "notepad.exe": "Notepad", "notepad++.exe": "Notepad++",
    "sublime_text.exe": "Sublime Text", "figma.exe": "Figma", "steam.exe": "Steam",
    "vlc.exe": "VLC", "mpc-hc64.exe": "MPC-HC", "zoom.exe": "Zoom", "telegram.exe": "Telegram",
    "whatsapp.exe": "WhatsApp", "signal.exe": "Signal", "thunderbird.exe": "Thunderbird",
    "acrobat.exe": "Acrobat", "sumatrapdf.exe": "SumatraPDF", "mstsc.exe": "Remote Desktop",
    "taskmgr.exe": "Task Manager", "systemsettings.exe": "Settings", "anki.exe": "Anki",
}

_SEPARATOR_RE = re.compile(r"\s+[-\u2014\u2013|\u00b7]\s+")
_INVISIBLE_RE = re.compile(
    "[\u200b\u200c\u200d\u2060\ufeff"          # zero-width characters
    "\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f"       # C0/C1 controls (tab/newline become spaces below)
    "\ud800-\udfff]"                              # lone surrogates
)
_COUNT_PREFIX_RE = re.compile(r"^\(\d+\+?\)\s*")
_X_TITLE_RE = re.compile(r"\s/\s(?:X|Twitter)$")  # "Name (@handle) / X"
_TRAILING_BRACKET_RE = re.compile(r"\s*(\[[^\]]*\]|\([^)]*\))$")
_DOMAIN_RE = re.compile(
    r"(?<![\w.@-])(?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|app|ai|co|pl|eu|de|uk|us|me|tv|"
    r"info|edu|gov|xyz|so|gg|sh|fm|to|cc|ly|it|fr|es|nl|cz|sk|ru|jp|in|br|ca|au|ch|at|"
    r"be|se|no|fi|dk|tech|cloud|design|studio|blog|wiki|news|live|site|online)(?![\w-])",
    re.IGNORECASE,
)


def clean_title(title: str) -> str:
    """Remove invisible/control characters and lone surrogates, collapse whitespace."""
    text = _INVISIBLE_RE.sub("", title or "").replace("\u00a0", " ")
    return " ".join(text.split())


def split_title(title: str) -> list[str]:
    """Split a title on `` - ``, `` — ``, `` – ``, `` | `` and `` · ``."""
    return [s.strip() for s in _SEPARATOR_RE.split(clean_title(title)) if s.strip()]


def exe_base(exe: str) -> str:
    """Lower-case file name of a process path (``C:\\x\\Code.exe`` -> ``code.exe``)."""
    return (exe or "").replace("\\", "/").rsplit("/", 1)[-1].strip().lower()


def app_display_name(exe: str, title: str) -> str:
    """Human name of the app that owns the window. See module docstring."""
    name = exe_base(exe)
    title = clean_title(title)
    if name in WORKSPACE_APPS:
        suffix, fallback = WORKSPACE_APPS[name]
        if title.endswith(suffix.strip()) and len(title) > len(suffix.strip()):
            workspace = title[: -len(suffix.strip())].rstrip(" -")
            return workspace or fallback
        return fallback
    if name in HOST_PROCESSES:
        segments = split_title(title)
        return segments[-1] if segments else "Windows App"
    if name in BROWSERS:
        return BROWSERS[name]
    if name in EDITORS:
        return EDITORS[name][0]
    if name in DISPLAY_NAMES:
        return DISPLAY_NAMES[name]
    if name:
        pretty = name.removesuffix(".exe").replace("-", " ").replace("_", " ").strip()
        return pretty.title() if pretty else "Unknown"
    segments = split_title(title)
    if segments and 1 < len(segments[-1]) <= 40:
        return segments[-1]
    return title[:30] or "Unknown"


def _site_segments(text: str) -> list[str]:
    """Title segments without the browser's own name and profile at the end."""
    segments = split_title(text)
    while segments and segments[-1].lower() in BROWSER_TITLE_WORDS:
        segments.pop()
    return segments


def _is_conversation(segments: list[str]) -> bool:
    """A "@person" / "#channel" title (Discord): its conversation is the key."""
    return any(s.startswith(("@", "#")) for s in segments)


def browser_site(title: str) -> str | None:
    """Site identity of a browser window title, or None when there is none."""
    text = _COUNT_PREFIX_RE.sub("", clean_title(title))
    segments = _site_segments(text)
    if len(segments) == 1 and segments[0].lower() in NEW_TAB_TITLES:
        return NEW_TAB_SITE
    if segments and _X_TITLE_RE.search(segments[-1]):
        return "X"
    conversation = _is_conversation(segments)
    if not conversation:
        for segment in reversed(segments):
            known = _SITE_BY_NAME.get(_COUNT_PREFIX_RE.sub("", segment).lower())
            if known:
                return known
    match = _DOMAIN_RE.search(text)
    if match:
        domain = match.group(0).lower().removeprefix("www.")
        return _SITE_BY_DOMAIN.get(domain, domain)
    if len(segments) >= 2:
        candidate = segments[-1]
    elif len(segments) == 1 and " " not in segments[0]:
        candidate = segments[0]
    else:
        return None
    return candidate if 2 <= len(candidate) <= 40 else None


def editor_project(exe: str, title: str) -> str | None:
    """Project/workspace name from an IDE title, or None when it has none."""
    name = exe_base(exe)
    if name not in EDITORS:
        return None
    segments = split_title(title)
    mode = EDITORS[name][1]
    if mode == "before_app" and len(segments) >= 3:
        project = segments[-2]
    elif mode == "first" and len(segments) >= 2:
        project = segments[0]
    else:
        return None
    project = _TRAILING_BRACKET_RE.sub("", project).lstrip("\u25cf* ").strip()
    return project or None


def known_site_for_host(host: str) -> str | None:
    """The KNOWN_SITES name of a host: its exact domain, else a whole-site parent domain."""
    host = (host or "").strip().lower().rstrip(".").removeprefix("www.")
    name = _SITE_BY_DOMAIN.get(host)
    if name:
        return name
    labels = host.split(".")
    for i in range(1, len(labels) - 1):  # longest parent first: a.b.reddit.com, b.reddit.com, reddit.com
        parent = ".".join(labels[i:])
        if parent in WHOLE_SITE_DOMAINS:
            return _SITE_BY_DOMAIN[parent]
    return None


def browser_site_for_host(host: str, title: str) -> str:
    """Site identity from the active tab's host (``browser_url.host_from_omnibox``)."""
    host = (host or "").strip().lower()
    if host == NEW_TAB_HOST:
        return NEW_TAB_SITE
    if host == FILE_HOST:
        return LOCAL_FILE_SITE
    if host in INTERNAL_SCHEMES:
        return BROWSER_PAGE_SITE
    known = known_site_for_host(host)
    if known == "Discord" and _is_conversation(_site_segments(_COUNT_PREFIX_RE.sub("", clean_title(title)))):
        return browser_site(title) or known  # each chat stays its own key, as without the host
    return known or host


def app_key(exe: str, title: str, host: str | None = None) -> str:
    """Low-cardinality identity used for classification. See module docstring.

    ``host`` is the active tab's host for a Chromium browser (``Sample.host``);
    it wins over the title. Without it the title decides, as before.
    """
    name = exe_base(exe)
    display = app_display_name(exe, title)
    if name in BROWSERS:
        site = browser_site_for_host(host, title) if host else browser_site(title)
        return f"Browser | {site or 'other'}"
    if name in EDITORS:
        project = editor_project(exe, title)
        return f"{display} | {project}" if project else display
    return display
