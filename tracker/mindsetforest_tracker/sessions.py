"""The session state machine. Pure: feed it ``(timestamp, Sample)`` pairs.

A session is a run of ticks with the same ``app_key``, the same window title
and the same idle flag. Any change closes the current session and opens a new
one at the same instant. Rules worth knowing:

* Idle = no input for ``idle_minutes`` or the screen is locked. Idle spans are
  recorded as their own sessions (``idle=True``) with the app that was in front,
  so the web can count them for "watching" classes. When the idle threshold
  is crossed the split is back-dated to the last input, because that is when
  the user really stopped (clamped to the current session's start).
* Sleep/hibernate shows up as a wall-clock jump larger than ``sleep_gap``
  between two ticks, and a clock set backwards as ``ts < last_ts``: either way
  the open session is closed at the last good tick and a fresh one starts at
  the new time. Nothing is merged across such a break. A ``started_at`` is
  never reused: if a fresh session would collide with one already opened
  (possible after a backwards step) it is bumped by one second.
* Sessions shorter than ``min_seconds`` are merged into a neighbour: into the
  previous session when it ends exactly where the short one starts, else into
  the next one (which then starts where the short one did). The short session
  is also emitted as a zero-length *tombstone* (``ended_at == started_at``):
  ``Store.upsert_session`` applies it only to a row it already holds, which
  zeroes a live-flushed copy that would otherwise keep its stale duration.
* ``local_date`` follows the 04:00 rule: a session that starts at 01:30 local
  time belongs to the previous calendar day.

All timestamps are unix seconds floored to whole seconds; ``to_row`` renders
them as UTC ISO-8601 with a ``Z`` suffix.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone, tzinfo

from .capture import Sample
from .normalize import app_display_name, app_key, clean_title

LOCKED_APP = "Locked"
DAY_START_HOUR = 4


def iso_utc(ts: float) -> str:
    """``2026-09-28T10:00:00Z`` for a unix timestamp."""
    return datetime.fromtimestamp(int(ts), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def local_date_for(ts: float, tz: tzinfo | None = None, day_start_hour: int = DAY_START_HOUR) -> str:
    """Calendar day a timestamp belongs to when the day starts at 04:00 local."""
    local = datetime.fromtimestamp(ts, tz) if tz else datetime.fromtimestamp(ts).astimezone()
    return (local - timedelta(hours=day_start_hour)).date().isoformat()


@dataclass(frozen=True)
class Activity:
    """What the desktop is doing at a tick, after normalisation."""

    app: str
    app_key: str
    title: str
    idle: bool


@dataclass
class Session:
    app: str
    app_key: str
    window_title: str
    idle: bool
    started_at: float
    ended_at: float

    @property
    def seconds(self) -> int:
        return max(0, int(self.ended_at - self.started_at))

    def to_row(self, tz: tzinfo | None = None) -> dict:
        """Column values matching ``app_usage_sessions`` (minus ids)."""
        return {
            "app": self.app,
            "app_key": self.app_key,
            "window_title": self.window_title,
            "started_at": iso_utc(self.started_at),
            "ended_at": iso_utc(self.ended_at),
            "seconds": self.seconds,
            "idle": self.idle,
            "local_date": local_date_for(self.started_at, tz),
        }


class SessionTracker:
    """Turns a stream of samples into closed sessions. Not thread-safe."""

    def __init__(
        self,
        *,
        tick_seconds: float = 1.0,
        idle_minutes: float = 3.0,
        min_seconds: int = 2,
        sleep_gap_seconds: float | None = None,
        ignored_apps: tuple[str, ...] | list[str] = (),
    ) -> None:
        self.idle_threshold = idle_minutes * 60.0
        self.min_seconds = min_seconds
        # Brief says "> 3x tick"; a floor of 10 s keeps a busy machine's
        # scheduling hiccups from being mistaken for sleep.
        self.sleep_gap = sleep_gap_seconds if sleep_gap_seconds is not None else max(3 * tick_seconds, 10.0)
        self._ignored: set[str] = set()
        self.set_ignored(ignored_apps)
        self._current: Session | None = None
        self._last_ts: float | None = None
        self._last_closed: Session | None = None
        self._carry: tuple[float, float] | None = None
        self._started: set[float] = set()  # every started_at handed out, to avoid collisions

    # -- configuration -------------------------------------------------------

    def set_ignored(self, names: tuple[str, ...] | list[str] | set[str]) -> None:
        """Replace the don't-track list (display names, case-insensitive)."""
        self._ignored = {n.strip().lower() for n in names}

    # -- inspection ----------------------------------------------------------

    @property
    def current(self) -> Session | None:
        """Copy of the open session (``ended_at`` = last tick), or None."""
        return replace(self._current) if self._current else None

    # -- feeding -------------------------------------------------------------

    def feed(self, ts: float, sample: Sample | None) -> list[Session]:
        """Consume one tick. ``sample=None`` means "record nothing" (paused).

        Returns the sessions that changed and must be written: closed ones,
        and occasionally the previous session re-emitted with a later end
        after absorbing a short neighbour.
        """
        ts = float(math.floor(ts))
        out: list[Session] = []
        if self._last_ts is not None and (ts - self._last_ts > self.sleep_gap or ts < self._last_ts):
            out += self._close(self._last_ts)  # sleep, or the clock was set back
            self._last_closed = None
            self._carry = None
        self._last_ts = ts
        activity = self._activity(sample)
        if activity is None:
            return out + self._close(ts)
        cur = self._current
        if cur is None:
            self._open(activity, ts)
            return out
        if (activity.app_key, activity.title, activity.idle) == (cur.app_key, cur.window_title, cur.idle):
            cur.ended_at = max(cur.started_at, ts)
            return out
        split_at = ts
        same_window = activity.app_key == cur.app_key and activity.title == cur.window_title
        if activity.idle and not cur.idle and same_window and sample is not None and not sample.locked:
            split_at = max(cur.started_at, ts - math.floor(sample.idle_seconds))
        out += self._close(split_at)
        self._open(activity, split_at)
        return out

    def close_current(self, ts: float) -> list[Session]:
        """Close the open session at ``ts`` (quit, pause)."""
        self._last_ts = float(math.floor(ts))
        return self._close(self._last_ts)

    def discard_current(self) -> Session | None:
        """Drop the open session without emitting it ("don't track this app")."""
        cur = self._current
        self._current = None
        self._carry = None
        return cur

    # -- internals -----------------------------------------------------------

    def _activity(self, sample: Sample | None) -> Activity | None:
        if sample is None:
            return None
        if sample.locked:
            return Activity(LOCKED_APP, LOCKED_APP, "", True)
        title = clean_title(sample.title)
        if not sample.exe and not title:
            return None
        app = app_display_name(sample.exe, title)
        if app.lower() in self._ignored:
            return None
        return Activity(app, app_key(sample.exe, title), title, sample.idle_seconds >= self.idle_threshold)

    def _open(self, activity: Activity, at: float) -> None:
        if self._carry and self._carry[1] == at:
            start = self._carry[0]  # takes over the merged short session's row
        else:
            start = at
            while start in self._started:
                start += 1.0
        self._carry = None
        self._started.add(start)
        if len(self._started) > 50_000:
            self._started = {s for s in self._started if s >= at - 86_400}
        self._current = Session(activity.app, activity.app_key, activity.title, activity.idle, start, max(at, start))

    def _close(self, at: float) -> list[Session]:
        cur = self._current
        if cur is None:
            return []
        self._current = None
        cur.ended_at = max(cur.started_at, at)
        if cur.seconds < self.min_seconds:
            tombstone = replace(cur, ended_at=cur.started_at)
            prev = self._last_closed
            if prev is not None and prev.ended_at == cur.started_at:
                prev.ended_at = cur.ended_at
                return [replace(prev), tombstone]
            self._carry = (cur.started_at, cur.ended_at)
            return [tombstone]
        self._last_closed = cur
        return [replace(cur)]
