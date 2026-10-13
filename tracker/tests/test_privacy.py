from mindsetforest_tracker.capture import Sample
from mindsetforest_tracker.normalize import app_key
from mindsetforest_tracker.privacy import is_private
from mindsetforest_tracker.sessions import SessionTracker


def test_adult_sites_and_words_are_private():
    assert is_private("Some video - Pornhub.com – Brave")
    assert is_private("pornhub.com")
    assert is_private("Hot stuff (NSFW) - Reddit")
    assert is_private("XVIDEOS.COM - Google Chrome")
    assert is_private("Pornography research")


def test_whole_words_only():
    assert not is_private("Essex County Council - Google Chrome")
    assert not is_private("Middlesex University")
    assert not is_private("Discord | @Arnold – Brave")
    assert not is_private("YouTube - Google Chrome")


def test_user_keywords_match_anywhere():
    assert is_private("Tinder | Match", keywords=("tinder",))
    assert not is_private("Tinder | Match")


def _sample(title, idle=0.0):
    return Sample(exe="brave.exe", title=title, idle_seconds=idle, locked=False)


def test_private_windows_are_not_recorded():
    t = SessionTracker(min_seconds=0)
    out = []
    out += t.feed(0, _sample("Docs - Google Docs – Brave"))
    out += t.feed(5, _sample("Video - Pornhub.com – Brave"))
    out += t.feed(10, _sample("Video - Pornhub.com – Brave"))
    out += t.feed(15, _sample("Docs - Google Docs – Brave"))
    out += t.close_current(20)
    assert all("porn" not in (s.app_key + s.window_title).lower() for s in out)
    assert [s.seconds for s in out] == [5, 5]


def test_dashboard_keywords_apply_after_set():
    t = SessionTracker(min_seconds=0)
    t.set_private_keywords(["  Tinder "])
    out = t.feed(0, _sample("Tinder | Match – Brave")) + t.close_current(5)
    assert out == []


def test_site_keys():
    assert app_key("brave.exe", "Discord | @Arnold – Brave") == "Browser | @Arnold"
    assert app_key("chrome.exe", "Watch - youtube.com - Google Chrome") == "Browser | YouTube"
    assert app_key("chrome.exe", "Never Gonna - YouTube - Google Chrome") == "Browser | YouTube"
    assert app_key("brave.exe", "Artykuł - Hacker News - Osobisty – Brave") == "Browser | Hacker News"


def test_the_tabs_domain_is_checked_too():
    """A site whose titles never name it: the domain from the address bar catches it."""
    t = SessionTracker(min_seconds=0)
    t.set_private_keywords(["tinder"])
    out = []
    out += t.feed(0, Sample(exe="chrome.exe", title="Docs - Google Chrome", host="docs.google.com"))
    out += t.feed(5, Sample(exe="chrome.exe", title="Hot video - Google Chrome", host="pornhub.com"))
    out += t.feed(10, Sample(exe="chrome.exe", title="Match - Google Chrome", host="tinder.com"))
    out += t.feed(15, Sample(exe="chrome.exe", title="Docs - Google Chrome", host="docs.google.com"))
    out += t.close_current(20)
    assert [(s.app_key, s.seconds) for s in out] == [("Browser | docs.google.com", 5)] * 2
    assert all("pornhub" not in s.window_title + s.app_key and "tinder" not in s.app_key for s in out)


def test_the_host_only_shapes_app_key_and_is_never_stored_alone():
    t = SessionTracker(min_seconds=0)
    # A real timestamp: to_row works out the local day, and Windows rejects the epoch's.
    t0 = 1_760_000_000
    out = t.feed(t0, Sample(exe="brave.exe", title="Prośba o pomoc finansową – Brave", host="chatgpt.com"))
    out += t.close_current(t0 + 5)
    (row,) = [s.to_row() for s in out]
    assert row["app_key"] == "Browser | ChatGPT" and row["window_title"] == "Prośba o pomoc finansową – Brave"
    assert "host" not in row and "chatgpt.com" not in str(row)
