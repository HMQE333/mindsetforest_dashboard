import pytest

from mindsetforest_tracker.normalize import (
    app_display_name, app_key, browser_site, clean_title, editor_project, exe_base, split_title,
)

CASES = [
    # exe, title, display name, app_key
    ("chrome.exe", "Rick Astley - Never Gonna Give You Up - YouTube - Google Chrome", "Chrome", "Browser | YouTube"),
    ("chrome.exe", "Inbox (3) - jan@gmail.com - Gmail - Google Chrome", "Chrome", "Browser | Gmail"),
    ("chrome.exe", "New Tab - Google Chrome", "Chrome", "Browser | other"),
    ("chrome.exe", "(2) Facebook - Google Chrome", "Chrome", "Browser | Facebook"),
    ("chrome.exe", "https://github.com/owner/repo/pull/12 - Google Chrome", "Chrome", "Browser | github.com"),
    ("chrome.exe", "Login \u2013 www.example.com - Google Chrome", "Chrome", "Browser | example.com"),
    ("chrome.exe", "ChatGPT - Google Chrome", "Chrome", "Browser | ChatGPT"),
    ("firefox.exe", "Python 3.11 documentation \u2014 Mozilla Firefox", "Firefox", "Browser | other"),
    ("firefox.exe", "r/Python - Reddit \u2014 Mozilla Firefox", "Firefox", "Browser | Reddit"),
    ("firefox.exe", "(1) WhatsApp \u2014 Mozilla Firefox Private Browsing", "Firefox", "Browser | WhatsApp"),
    ("msedge.exe", "Issues \u00b7 owner/repo \u00b7 GitHub - Personal - Microsoft\u200b Edge", "Edge", "Browser | GitHub"),
    ("msedge.exe", "Home | Microsoft 365 - Microsoft Edge", "Edge", "Browser | Microsoft 365"),
    ("brave.exe", "Twitch - Brave", "Brave", "Browser | Twitch"),
    ("Code.exe", "\u25cf tracker.py - mindsetforest_dashboard - Visual Studio Code", "Code", "Code | mindsetforest_dashboard"),
    ("Code.exe", "sessions.py - tracker (Workspace) - Visual Studio Code", "Code", "Code | tracker"),
    ("Code.exe", "main.py - api [SSH: box] - Visual Studio Code", "Code", "Code | api"),
    ("Code.exe", "Welcome - Visual Studio Code", "Code", "Code"),
    ("pycharm64.exe", "mindsetforest_dashboard \u2013 tracker.py", "PyCharm", "PyCharm | mindsetforest_dashboard"),
    ("pycharm64.exe", "mindsetforest_dashboard [C:\\dev\\mf] \u2013 ...\\database.py \u2013 PyCharm", "PyCharm", "PyCharm | mindsetforest_dashboard"),
    ("pycharm64.exe", "Settings", "PyCharm", "PyCharm"),
    ("devenv.exe", "MyApp (Running) - Microsoft Visual Studio", "Visual Studio", "Visual Studio | MyApp"),
    ("WINWORD.EXE", "Report Q3.docx - Word", "Word", "Word"),
    ("explorer.exe", "Downloads", "Explorer", "Explorer"),
    ("Discord.exe", "#general | Friends - Discord", "Discord", "Discord"),
    ("rambox.exe", "Slack - Rambox", "Slack", "Slack"),
    ("rambox.exe", "Rambox", "Rambox", "Rambox"),
    ("Spotify.exe", "Daft Punk - Harder, Better, Faster, Stronger", "Spotify", "Spotify"),
    ("WindowsTerminal.exe", "Administrator: Windows PowerShell", "Terminal", "Terminal"),
    ("ApplicationFrameHost.exe", "Settings", "Settings", "Settings"),
    ("some_weird-tool.exe", "whatever", "Some Weird Tool", "Some Weird Tool"),
    ("", "Something - Foo Bar", "Foo Bar", "Foo Bar"),
]


@pytest.mark.parametrize("exe,title,display,key", CASES, ids=[c[1][:30] for c in CASES])
def test_display_and_key(exe, title, display, key):
    assert app_display_name(exe, title) == display
    assert app_key(exe, title) == key


def test_exe_base_handles_full_paths():
    assert exe_base("C:\\Program Files\\Code\\Code.exe") == "code.exe"
    assert exe_base("/usr/bin/python3") == "python3"


def test_clean_title_removes_invisible_chars_and_collapses_spaces():
    assert clean_title("Microsoft\u200b Edge  \u00a0 x") == "Microsoft Edge x"


def test_split_title_does_not_split_on_dashes_inside_words():
    assert split_title("opera-gx - foo_bar | baz") == ["opera-gx", "foo_bar", "baz"]


def test_browser_site_prefers_domain_over_segments():
    assert browser_site("Dashboard - app.mindsetforest.app - Google Chrome") == "app.mindsetforest.app"
    assert browser_site("Settings - Google Chrome") == "Settings"
    assert browser_site("Google Chrome") is None


def test_editor_project_only_for_editors():
    assert editor_project("notepad.exe", "a - b - c") is None
    assert editor_project("code.exe", "a - b") is None


def test_clean_title_strips_control_chars_and_lone_surrogates():
    assert clean_title("a\ud83d\x00b\x1f\x9fc") == "abc"
    assert clean_title("tab\tand\nnewline") == "tab and newline"
    assert clean_title("emoji \U0001F600 ok") == "emoji \U0001F600 ok"  # real astral chars kept
