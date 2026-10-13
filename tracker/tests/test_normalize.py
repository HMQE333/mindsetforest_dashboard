import pytest

from mindsetforest_tracker import normalize
from mindsetforest_tracker.normalize import (
    KNOWN_SITES, WHOLE_SITE_DOMAINS, app_display_name, app_key, browser_site, clean_title, editor_project, exe_base,
    known_site_for_host, split_title,
)

CASES = [
    # exe, title, display name, app_key
    ("chrome.exe", "Rick Astley - Never Gonna Give You Up - YouTube - Google Chrome", "Chrome", "Browser | YouTube"),
    ("chrome.exe", "Inbox (3) - jan@gmail.com - Gmail - Google Chrome", "Chrome", "Browser | Gmail"),
    ("chrome.exe", "New Tab - Google Chrome", "Chrome", "Browser | New Tab"),
    ("chrome.exe", "(2) Facebook - Google Chrome", "Chrome", "Browser | Facebook"),
    ("chrome.exe", "https://github.com/owner/repo/pull/12 - Google Chrome", "Chrome", "Browser | GitHub"),
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


# -- the active tab's host (tracker 1.2) -----------------------------------------------------

HOST_KEYS = [
    # exe, title, host, app_key
    ("brave.exe", "Prośba o pomoc finansową – Brave", "chatgpt.com", "Browser | ChatGPT"),  # title names no site
    ("chrome.exe", "Sklep - Google Chrome", "rybiapaka.pl", "Browser | rybiapaka.pl"),           # unknown: the host
    ("chrome.exe", "Pytanie o najlepsiwykonawcy.pl - Google Chrome", "chatgpt.com", "Browser | ChatGPT"),
    ("brave.exe", "Nowa karta – Brave", "newtab", "Browser | New Tab"),
    ("chrome.exe", "a.pdf - Google Chrome", "file", "Browser | Local file"),
    ("brave.exe", "Ustawienia – Brave", "brave", "Browser | Browser page"),
    ("chrome.exe", "Extensions - Google Chrome", "chrome", "Browser | Browser page"),
    ("msedge.exe", "Ustawienia - Microsoft Edge", "edge", "Browser | Browser page"),
    ("chrome.exe", "Popup - Google Chrome", "chrome-extension", "Browser | Browser page"),
    ("chrome.exe", "about:blank - Google Chrome", "about", "Browser | Browser page"),
    ("chrome.exe", "r/Python - Google Chrome", "old.reddit.com", "Browser | Reddit"),             # whole-site parent
    ("chrome.exe", "Cats - Google Chrome", "m.youtube.com", "Browser | YouTube"),
    ("chrome.exe", "Song - Google Chrome", "music.youtube.com", "Browser | YouTube Music"),
    ("chrome.exe", "gist - Google Chrome", "gist.github.com", "Browser | GitHub"),
    ("chrome.exe", "Doc - Google Docs - Google Chrome", "docs.google.com", "Browser | docs.google.com"),  # not Search
    ("chrome.exe", "kot - Szukaj w Google - Google Chrome", "google.com", "Browser | Google Search"),
    ("chrome.exe", "kot - Szukaj w Google - Google Chrome", "google.pl", "Browser | Google Search"),
    ("chrome.exe", "kot - Szukaj w Google - Google Chrome", "www.google.com", "Browser | Google Search"),
    ("chrome.exe", "Czat - Google Chrome", "gemini.google.com", "Browser | Google Gemini"),
    ("chrome.exe", "Inbox - Google Chrome", "mail.proton.me", "Browser | Proton Mail"),
    ("chrome.exe", "Calendar - Google Chrome", "calendar.proton.me", "Browser | calendar.proton.me"),  # exact only
    ("chrome.exe", "Board - Google Chrome", "miro.com", "Browser | Miro"),
    ("chrome.exe", "App - Google Chrome", "lovable.dev", "Browser | Lovable"),
    ("chrome.exe", "q - Google Chrome", "perplexity.ai", "Browser | Perplexity"),
    ("chrome.exe", "Chat - Google Chrome", "chat.openai.com", "Browser | ChatGPT"),
    ("chrome.exe", "MindsetForest - Google Chrome", "hmqe333.github.io", "Browser | MindsetForest"),
    ("chrome.exe", "Fake - Google Chrome", "notyoutube.com", "Browser | notyoutube.com"),  # labels, not a suffix
    ("chrome.exe", "Fake - Google Chrome", "youtube.com.evil.net", "Browser | youtube.com.evil.net"),
    ("chrome.exe", "Dev - Google Chrome", "localhost", "Browser | localhost"),
    # Discord: a conversation keeps today's key, with or without the host.
    ("brave.exe", "Discord | @Arnold – Brave", "discord.com", "Browser | @Arnold"),
    ("brave.exe", "Discord | @Arnold – Brave", "ptb.discord.com", "Browser | @Arnold"),
    ("brave.exe", "#czat | WSB-NLU | Cybersecurity – Brave", "discord.com", "Browser | Cybersecurity"),
    ("brave.exe", "(3) Discord | Friends – Brave", "discord.com", "Browser | Discord"),
    ("brave.exe", "#general – Brave", "example.com", "Browser | example.com"),  # only Discord's chats
]


@pytest.mark.parametrize("exe,title,host,key", HOST_KEYS, ids=[f"{c[2]}:{c[1][:20]}" for c in HOST_KEYS])
def test_the_host_wins_over_the_title(exe, title, host, key):
    assert app_key(exe, title, host) == key


def test_no_host_is_the_title_logic_and_hosts_never_touch_other_apps():
    title = "Prośba o pomoc finansową – Brave"
    assert app_key("brave.exe", title) == app_key("brave.exe", title, None) == app_key("brave.exe", title, "")
    assert app_key("brave.exe", title) == "Browser | other"
    assert app_key("Code.exe", "a.py - proj - Visual Studio Code", "chatgpt.com") == "Code | proj"


NEW_TABS = [
    "New Tab - Google Chrome", "Nowa karta - Google Chrome", "New Private Tab - Brave",
    "New Incognito Tab - Google Chrome", "Nowa karta incognito – Brave", "New InPrivate tab - Microsoft Edge",
    "New tab - Personal - Microsoft​ Edge", "New Tab — Mozilla Firefox", "Nowa karta prywatna – Brave",
]


@pytest.mark.parametrize("title", NEW_TABS)
def test_new_tab_titles(title):
    exe = "firefox.exe" if "Firefox" in title else "chrome.exe"
    assert app_key(exe, title) == "Browser | New Tab"


def test_a_page_named_like_a_new_tab_is_not_one():
    assert app_key("brave.exe", "Nowa karta - fajna strona – Brave") == "Browser | fajna strona"


@pytest.mark.parametrize("title", [
    "(1) Param (@ParamSiddh) / X - Brave",
    "Home / X – Brave",
    'Elon Musk on X: "hello - world" / X - Google Chrome',
    "Notifications / Twitter - Google Chrome",
])
def test_x_title_shape(title):
    assert app_key("brave.exe", title) == "Browser | X"


def test_a_slash_x_without_spaces_is_not_x():
    assert app_key("brave.exe", "A/X – Brave") == "Browser | A/X"


SAME_KEY = [
    # (title as today, the host 1.2 reads): both must give one key, so label rules keep matching
    ("Czat - Google Gemini – Brave", "gemini.google.com", "Google Gemini"),
    ("Inbox | jan@proton.me | Proton Mail – Brave", "mail.proton.me", "Proton Mail"),
    ("Tablica - Miro – Brave", "miro.com", "Miro"),
    ("Projekt - Lovable – Brave", "lovable.dev", "Lovable"),
    ("pytanie - Perplexity – Brave", "perplexity.ai", "Perplexity"),
    ("kot - Google Search – Brave", "google.com", "Google Search"),
    ("ChatGPT – Brave", "chatgpt.com", "ChatGPT"),
    ("MindsetForest – Brave", "hmqe333.github.io", "MindsetForest"),
    ("Cats - YouTube – Brave", "youtube.com", "YouTube"),
    ("Inbox - Gmail – Brave", "mail.google.com", "Gmail"),
]


@pytest.mark.parametrize("title,host,site", SAME_KEY, ids=[c[2] for c in SAME_KEY])
def test_title_and_host_give_the_same_key(title, host, site):
    assert app_key("brave.exe", title) == app_key("brave.exe", title, host) == f"Browser | {site}"


def test_known_site_names_are_kept_and_whole_site_domains_are_known():
    before = {"YouTube", "Discord", "Instagram", "Facebook", "Messenger", "WhatsApp", "X", "Reddit", "LinkedIn",
              "TikTok", "Twitch", "Netflix", "Spotify", "Gmail", "ChatGPT", "Claude", "GitHub", "Notion"}
    assert before <= set(KNOWN_SITES)  # names label rules were written against
    assert set(KNOWN_SITES["ChatGPT"]) == {"chatgpt.com", "chat.openai.com"}
    assert WHOLE_SITE_DOMAINS <= set(normalize._SITE_BY_DOMAIN)
    assert "google.com" not in WHOLE_SITE_DOMAINS and "mail.proton.me" not in WHOLE_SITE_DOMAINS


def test_known_site_for_host():
    assert known_site_for_host("WWW.Reddit.com.") == "Reddit"
    assert known_site_for_host("a.b.reddit.com") == "Reddit"
    assert known_site_for_host("mail.google.com") == "Gmail"
    assert known_site_for_host("x.mail.google.com") is None  # mail.google.com is exact-only
    assert known_site_for_host("com") is None and known_site_for_host("") is None


def test_single_segment_gemini_title_is_now_known():
    assert app_key("brave.exe", "Google Gemini – Brave") == "Browser | Google Gemini"
