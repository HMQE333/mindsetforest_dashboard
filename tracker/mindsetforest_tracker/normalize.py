"""Pure functions that turn a raw (exe name, window title) pair into

* ``app_display_name`` - the human name shown in the tray and stored in ``app``;
* ``app_key`` - a deliberately low-cardinality identity stored in ``app_key``,
  which is what the web dashboard classifies into classes.

Rules for ``app_key`` (first match wins):

1. Browsers -> ``"Browser | <site>"`` regardless of which browser it is.
   ``site`` is a domain-like token found in the title (``github.com``) when
   present; otherwise the LAST title segment after the browser's own name is
   removed (``"Never Gonna Give You Up - YouTube - Google Chrome"`` ->
   ``YouTube``); a one-word title (``"(2) Facebook"``) is taken as the site;
   otherwise ``"Browser | other"``.
2. IDEs/editors -> ``"<App> | <project>"``. VS Code style titles are
   ``"file - project - App"`` (project = second to last segment); JetBrains
   and Visual Studio put the project first (``"project – file"``). Without a
   project the key is just the app name.
3. Electron workspace hosts (Rambox, Franz, Ferdi, Ferdium, Station) take the
   workspace name from the title suffix: ``"Slack - Rambox"`` -> ``Slack``.
4. UWP apps hosted by ``ApplicationFrameHost.exe`` use their window title.
5. Everything else -> the display name (``"Document1 - Word"`` -> ``Word``).

Titles are cleaned first: zero-width and non-breaking spaces removed and
whitespace collapsed, because Edge puts a zero-width space in its own name.
"""
from __future__ import annotations

import re

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
    "mozilla firefox (private browsing)", "personal", "work",
}

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
_INVISIBLE_RE = re.compile("[\u200b\u200c\u200d\u2060\ufeff]")
_COUNT_PREFIX_RE = re.compile(r"^\(\d+\+?\)\s*")
_TRAILING_BRACKET_RE = re.compile(r"\s*(\[[^\]]*\]|\([^)]*\))$")
_DOMAIN_RE = re.compile(
    r"(?<![\w.@-])(?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|app|ai|co|pl|eu|de|uk|us|me|tv|"
    r"info|edu|gov|xyz|so|gg|sh|fm|to|cc|ly|it|fr|es|nl|cz|sk|ru|jp|in|br|ca|au|ch|at|"
    r"be|se|no|fi|dk|tech|cloud|design|studio|blog|wiki|news|live|site|online)(?![\w-])",
    re.IGNORECASE,
)


def clean_title(title: str) -> str:
    """Remove invisible characters and collapse whitespace."""
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


def browser_site(title: str) -> str | None:
    """Site identity of a browser window title, or None when there is none."""
    text = _COUNT_PREFIX_RE.sub("", clean_title(title))
    match = _DOMAIN_RE.search(text)
    if match:
        return match.group(0).lower().removeprefix("www.")
    segments = split_title(text)
    while segments and segments[-1].lower() in BROWSER_TITLE_WORDS:
        segments.pop()
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


def app_key(exe: str, title: str) -> str:
    """Low-cardinality identity used for classification. See module docstring."""
    name = exe_base(exe)
    display = app_display_name(exe, title)
    if name in BROWSERS:
        return f"Browser | {browser_site(title) or 'other'}"
    if name in EDITORS:
        project = editor_project(exe, title)
        return f"{display} | {project}" if project else display
    return display
