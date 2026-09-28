"""Local SQLite store (``%APPDATA%\\MindsetForest\\tracker.db``).

``sessions`` mirrors ``app_usage_sessions`` (without ``user_id``, which is
added at upload time) plus ``synced`` and ``rev``. Rows are keyed by
``started_at``: the open session is written again every minute with a growing
``ended_at`` and the same key, so the dashboard shows live time, and the
server upsert (``on_conflict=user_id,device_id,started_at``) merges it.

``rev`` increments whenever a row's content changes so that a sync that was
already in flight cannot mark a newer version as synced.
"""
from __future__ import annotations

import sqlite3
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone, tzinfo
from pathlib import Path
from collections.abc import Iterable

from .sessions import Session

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id    TEXT    NOT NULL,
    app          TEXT    NOT NULL,
    app_key      TEXT    NOT NULL,
    window_title TEXT    NOT NULL DEFAULT '',
    started_at   TEXT    NOT NULL UNIQUE,
    ended_at     TEXT    NOT NULL,
    seconds      INTEGER NOT NULL CHECK (seconds >= 0),
    idle         INTEGER NOT NULL DEFAULT 0,
    local_date   TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    synced       INTEGER NOT NULL DEFAULT 0,
    rev          INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_sessions_synced ON sessions (synced, id);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""

UPSERT = """
INSERT INTO sessions (device_id, app, app_key, window_title, started_at, ended_at,
                      seconds, idle, local_date)
VALUES (:device_id, :app, :app_key, :window_title, :started_at, :ended_at,
        :seconds, :idle, :local_date)
ON CONFLICT (started_at) DO UPDATE SET
    app = excluded.app, app_key = excluded.app_key, window_title = excluded.window_title,
    ended_at = excluded.ended_at, seconds = excluded.seconds, idle = excluded.idle,
    local_date = excluded.local_date,
    synced = CASE WHEN sessions.ended_at = excluded.ended_at AND sessions.idle = excluded.idle
                   AND sessions.app_key = excluded.app_key
                   AND sessions.window_title = excluded.window_title
              THEN sessions.synced ELSE 0 END,
    rev = CASE WHEN sessions.ended_at = excluded.ended_at AND sessions.idle = excluded.idle
                   AND sessions.app_key = excluded.app_key
                   AND sessions.window_title = excluded.window_title
              THEN sessions.rev ELSE sessions.rev + 1 END
"""


@dataclass(frozen=True)
class SessionRow:
    id: int
    device_id: str
    app: str
    app_key: str
    window_title: str
    started_at: str
    ended_at: str
    seconds: int
    idle: bool
    local_date: str
    synced: bool
    rev: int


class Store:
    """Thread-safe wrapper around one SQLite connection."""

    def __init__(self, path: Path | str = ":memory:") -> None:
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            if path != ":memory:":
                self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.executescript(SCHEMA)

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # -- sessions ------------------------------------------------------------

    def upsert_session(self, session: Session, device_id: str, tz: tzinfo | None = None) -> None:
        """Insert or update (by ``started_at``) one session."""
        row = session.to_row(tz)
        row["idle"] = int(row["idle"])
        row["device_id"] = device_id
        with self._lock, self._conn:
            self._conn.execute(UPSERT, row)

    def delete_session(self, started_at: str) -> bool:
        """Remove a local row (used by "don't track"). Returns True if it existed."""
        with self._lock, self._conn:
            cur = self._conn.execute("DELETE FROM sessions WHERE started_at = ?", (started_at,))
        return cur.rowcount > 0

    def get_session(self, started_at: str) -> SessionRow | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM sessions WHERE started_at = ?", (started_at,)).fetchone()
        return _to_row(row) if row else None

    def unsynced(self, limit: int = 200) -> list[SessionRow]:
        """Oldest-first rows that still need uploading."""
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM sessions WHERE synced = 0 ORDER BY id LIMIT ?", (limit,)
            ).fetchall()
        return [_to_row(r) for r in rows]

    def mark_synced(self, rows: Iterable[SessionRow]) -> int:
        """Mark rows synced unless they changed since they were read."""
        pairs = [(r.id, r.rev) for r in rows]
        with self._lock, self._conn:
            cur = self._conn.executemany(
                "UPDATE sessions SET synced = 1 WHERE id = ? AND rev = ?", pairs
            )
        return cur.rowcount if cur.rowcount >= 0 else 0

    def purge_synced_older_than(self, days: int = 90, now: datetime | None = None) -> int:
        """Delete synced rows whose ``ended_at`` is older than ``days``."""
        now = now or datetime.now(timezone.utc)
        cutoff = (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
        with self._lock, self._conn:
            cur = self._conn.execute(
                "DELETE FROM sessions WHERE synced = 1 AND ended_at < ?", (cutoff,)
            )
        return cur.rowcount

    def count(self) -> int:
        with self._lock:
            return int(self._conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0])

    # -- kv ------------------------------------------------------------------

    def get_kv(self, key: str, default: str | None = None) -> str | None:
        with self._lock:
            row = self._conn.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
        return row[0] if row else default

    def set_kv(self, key: str, value: str) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO kv (key, value) VALUES (?, ?) "
                "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    def device_id(self) -> str:
        """Stable per-installation id, generated once."""
        existing = self.get_kv("device_id")
        if existing:
            return existing
        fresh = str(uuid.uuid4())
        self.set_kv("device_id", fresh)
        return fresh


def _to_row(row: sqlite3.Row) -> SessionRow:
    return SessionRow(
        id=row["id"], device_id=row["device_id"], app=row["app"], app_key=row["app_key"],
        window_title=row["window_title"], started_at=row["started_at"], ended_at=row["ended_at"],
        seconds=row["seconds"], idle=bool(row["idle"]), local_date=row["local_date"],
        synced=bool(row["synced"]), rev=row["rev"],
    )
