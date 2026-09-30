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
