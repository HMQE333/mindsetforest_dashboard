from datetime import datetime, timedelta, timezone

from mindsetforest_tracker.capture import Sample
from mindsetforest_tracker.sessions import LOCKED_APP, SessionTracker, iso_utc, local_date_for

T0 = 1_800_000_000  # 2027-01-15T08:00:00Z
CODE = Sample("Code.exe", "a.py - proj - Visual Studio Code")
CHROME = Sample("chrome.exe", "Cats - YouTube - Google Chrome")
SLACK = Sample("slack.exe", "general - Slack")


def run(tracker, steps):
    """steps: list of (offset_seconds, sample). Returns all emitted sessions."""
    out = []
    for offset, sample in steps:
        out += tracker.feed(T0 + offset, sample)
    return out


def ticks(sample, start, end, **kw):
    return [(t, Sample(sample.exe, sample.title, **kw) if kw else sample) for t in range(start, end)]


def test_app_switch_closes_session():
    tr = SessionTracker()
    out = run(tr, ticks(CODE, 0, 10) + ticks(CHROME, 10, 12))
    assert len(out) == 1
    s = out[0]
    assert (s.app, s.app_key, s.idle) == ("Code", "Code | proj", False)
    assert (s.started_at, s.ended_at, s.seconds) == (T0, T0 + 10, 10)
    assert tr.current.app_key == "Browser | YouTube" and tr.current.started_at == T0 + 10


def test_title_change_closes_session_even_for_same_key():
    tr = SessionTracker()
    out = run(tr, ticks(Sample("winword.exe", "Doc1 - Word"), 0, 5) + ticks(Sample("winword.exe", "Doc2 - Word"), 5, 8))
    assert [s.window_title for s in out] == ["Doc1 - Word"]
    assert tr.current.window_title == "Doc2 - Word"


def test_idle_transition_is_backdated_to_last_input():
    tr = SessionTracker(idle_minutes=3)
    steps = [(t, Sample(CHROME.exe, CHROME.title, idle_seconds=max(0, t - 20))) for t in range(0, 260)]
    out = run(tr, steps)
    # threshold crossed at t=200 (idle 180s) -> active session really ended at t=20
    assert len(out) == 1 and out[0].idle is False and out[0].ended_at == T0 + 20
    cur = tr.current
    assert cur.idle is True and cur.started_at == T0 + 20 and cur.app_key == "Browser | YouTube"
    # user comes back
    out = run(tr, [(260, Sample(CHROME.exe, CHROME.title, idle_seconds=0))])
    assert len(out) == 1 and out[0].idle is True and (out[0].started_at, out[0].ended_at) == (T0 + 20, T0 + 260)
    assert tr.current.idle is False and tr.current.started_at == T0 + 260


def test_idle_backdating_is_clamped_to_session_start():
    tr = SessionTracker(idle_minutes=3)
    # already 100 s idle when the window appears; threshold (180 s) crossed at t=80
    out = run(tr, [(t, Sample(CODE.exe, CODE.title, idle_seconds=100 + t)) for t in range(0, 81)])
    assert out == []  # zero-length active session is merged, not emitted
    assert tr.current.idle is True and tr.current.started_at == T0


def test_idle_not_backdated_when_app_also_changed():
    tr = SessionTracker(idle_minutes=1)
    out = run(tr, ticks(CODE, 0, 30) + [(30, Sample(CHROME.exe, CHROME.title, idle_seconds=100))])
    assert out[0].ended_at == T0 + 30 and tr.current.started_at == T0 + 30 and tr.current.idle


def test_lock_screen_is_idle_session_named_locked():
    tr = SessionTracker()
    out = run(tr, ticks(CODE, 0, 10) + [(t, Sample(locked=True, exe="LockApp.exe")) for t in range(10, 20)] + ticks(CODE, 20, 22))
    assert [s.app for s in out] == ["Code", LOCKED_APP]
    assert out[1].idle is True and out[1].seconds == 10 and out[1].window_title == ""


def test_sleep_gap_closes_at_last_good_tick():
    tr = SessionTracker(tick_seconds=1)
    out = run(tr, ticks(CODE, 0, 31) + ticks(CODE, 3600, 3602))
    assert len(out) == 1 and out[0].ended_at == T0 + 30
    assert tr.current.started_at == T0 + 3600


def test_small_hiccup_is_not_sleep():
    tr = SessionTracker(tick_seconds=1)
    out = run(tr, ticks(CODE, 0, 5) + ticks(CODE, 9, 12))
    assert out == [] and tr.current.started_at == T0 and tr.current.ended_at == T0 + 11


def test_short_session_merged_into_previous_neighbour():
    tr = SessionTracker(min_seconds=2)
    out = run(tr, ticks(CODE, 0, 10) + ticks(SLACK, 10, 11) + ticks(CHROME, 11, 20) + ticks(CODE, 20, 21))
    assert [(s.app, s.started_at, s.ended_at) for s in out] == [
        ("Code", T0, T0 + 10),      # closed when Slack appears
        ("Code", T0, T0 + 11),      # re-emitted after absorbing the 1 s Slack blip
        ("Chrome", T0 + 11, T0 + 20),
    ]


def test_short_first_session_merged_into_next():
    tr = SessionTracker(min_seconds=2)
    out = run(tr, ticks(SLACK, 0, 1) + ticks(CODE, 1, 10) + ticks(CHROME, 10, 11))
    assert [(s.app, s.started_at, s.ended_at) for s in out] == [("Code", T0, T0 + 10)]


def test_short_session_not_merged_across_a_pause():
    tr = SessionTracker(min_seconds=2)
    out = run(tr, ticks(CODE, 0, 10) + [(t, None) for t in range(10, 15)] + ticks(SLACK, 15, 16) + ticks(CHROME, 16, 20) + ticks(CODE, 20, 21))
    assert [(s.app, s.started_at, s.ended_at) for s in out] == [
        ("Code", T0, T0 + 10),
        ("Chrome", T0 + 15, T0 + 20),  # Slack blip carried into Chrome, not back into Code
    ]


def test_none_sample_closes_and_records_nothing():
    tr = SessionTracker()
    out = run(tr, ticks(CODE, 0, 5) + [(5, None), (6, None)])
    assert len(out) == 1 and out[0].ended_at == T0 + 5 and tr.current is None


def test_ignored_apps_are_skipped_at_capture():
    tr = SessionTracker(ignored_apps=["slack"])
    out = run(tr, ticks(CODE, 0, 5) + ticks(SLACK, 5, 10) + ticks(CHROME, 10, 11))
    assert [s.app for s in out] == ["Code"] and out[0].ended_at == T0 + 5
    assert tr.current.app == "Chrome" and tr.current.started_at == T0 + 10


def test_close_and_discard_current():
    tr = SessionTracker()
    run(tr, ticks(CODE, 0, 5))
    assert tr.close_current(T0 + 7)[0].ended_at == T0 + 7 and tr.current is None
    run(tr, ticks(CHROME, 8, 12))
    dropped = tr.discard_current()
    assert dropped.app == "Chrome" and tr.current is None


def test_local_date_follows_the_0400_rule():
    tz = timezone(timedelta(hours=2))

    def at(hour, minute):
        return datetime(2026, 9, 28, hour, minute, tzinfo=tz).timestamp()

    assert local_date_for(at(1, 30), tz) == "2026-09-27"
    assert local_date_for(at(0, 0), tz) == "2026-09-27"
    assert local_date_for(at(3, 59), tz) == "2026-09-27"
    assert local_date_for(at(4, 0), tz) == "2026-09-28"
    assert local_date_for(at(23, 59), tz) == "2026-09-28"


def test_to_row_uses_utc_z_and_start_for_local_date():
    tz = timezone(timedelta(hours=2))
    start = datetime(2026, 9, 28, 3, 50, tzinfo=tz).timestamp()  # 01:50Z, local 03:50 -> previous day
    tr = SessionTracker()
    tr.feed(start, CODE)
    row = tr.close_current(start + 1200)[0].to_row(tz)
    assert row["started_at"] == "2026-09-28T01:50:00Z" and row["ended_at"] == "2026-09-28T02:10:00Z"
    assert row["seconds"] == 1200 and row["local_date"] == "2026-09-27" and row["idle"] is False
    assert iso_utc(0) == "1970-01-01T00:00:00Z"
