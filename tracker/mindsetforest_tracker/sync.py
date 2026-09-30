"""Background upload of sessions to ``app_usage_sessions`` via PostgREST.

Every ``interval_seconds`` the worker refreshes the access token if needed,
upserts unsynced rows in batches (``on_conflict=user_id,device_id,started_at``
with ``resolution=merge-duplicates``) and marks them synced. The open session
is written to the store every minute with the same ``started_at`` and a growing
``ended_at``, so it is picked up here like any other row and the dashboard
shows live time. On a network error rows stay unsynced and the worker backs
off (60 s, 120 s, ... up to 10 min). When the server *rejects* a batch (4xx
other than 401/429) it is retried row by row and the rows that fail on their
own are quarantined (``synced = -1``) and logged, so one bad row never blocks
the rest. Nothing here can crash the capture thread.
"""
from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

import requests

from .auth import AuthError, AuthRequired, SupabaseAuth
from .store import SessionRow, Store

log = logging.getLogger(__name__)

TABLE = "app_usage_sessions"
PRIVACY_TABLE = "app_tracking_privacy"
MAX_BACKOFF = 600.0


class SyncError(Exception):
    """Upload failed for a reason worth retrying later (network, 5xx, 429)."""


class SyncRejected(SyncError):
    """The server refused the payload (4xx other than 401/429); retrying it unchanged is pointless."""

    def __init__(self, status: int, text: str) -> None:
        super().__init__(f"HTTP {status}: {text[:300]}")
        self.status = status


def build_payload(rows: Sequence[SessionRow], user_id: str) -> list[dict]:
    """JSON rows for the PostgREST upsert."""
    return [
        {
            "user_id": user_id,
            "device_id": r.device_id,
            "app": r.app,
            "app_key": r.app_key,
            "window_title": r.window_title,
            "started_at": r.started_at,
            "ended_at": r.ended_at,
            "seconds": max(0, int(r.seconds)),
            "idle": bool(r.idle),
            "local_date": r.local_date,
        }
        for r in rows
    ]


class SyncClient:
    """Thin PostgREST client. ``http`` is anything with ``post``/``delete`` like ``requests``."""

    def __init__(self, supabase_url: str, anon_key: str, auth: SupabaseAuth,
                 http: Any | None = None, timeout: float = 20.0) -> None:
        self.base = f"{supabase_url.rstrip('/')}/rest/v1/{TABLE}"
        self.privacy_url = f"{supabase_url.rstrip('/')}/rest/v1/{PRIVACY_TABLE}?select=keywords"
        self.anon_key = anon_key
        self.auth = auth
        self.http = http or requests.Session()
        self.timeout = timeout

    def upsert(self, payload: list[dict]) -> None:
        """Upsert one batch; refreshes the token once on 401."""
        if not payload:
            return
        url = f"{self.base}?on_conflict=user_id,device_id,started_at"
        for attempt in (1, 2):
            headers = {
                **self.auth.headers(),
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            }
            resp = self._request("post", url, headers, payload)
            if resp.status_code in (200, 201, 204):
                return
            if resp.status_code == 401 and attempt == 1:
                self.auth.refresh()
                continue
            if resp.status_code == 401:
                raise AuthRequired("token rejected twice")
            if resp.status_code != 429 and 400 <= resp.status_code < 500:
                raise SyncRejected(resp.status_code, resp.text)
            raise SyncError(f"HTTP {resp.status_code}: {resp.text[:300]}")

    def delete(self, device_id: str, started_at: str) -> None:
        """Best-effort delete of one row (used by "don't track")."""
        url = f"{self.base}?device_id=eq.{device_id}&started_at=eq.{started_at}"
        resp = self._request("delete", url, {**self.auth.headers(), "Prefer": "return=minimal"}, None)
        if resp.status_code not in (200, 204):
            raise SyncError(f"HTTP {resp.status_code}: {resp.text[:300]}")

    def private_keywords(self) -> list[str]:
        """The user's never-record keywords from the dashboard ([] when none are set)."""
        resp = self._request("get", self.privacy_url, self.auth.headers(), None)
        if resp.status_code != 200:
            raise SyncError(f"HTTP {resp.status_code}: {resp.text[:300]}")
        rows = resp.json() or []
        return [str(k) for r in rows for k in (r.get("keywords") or [])]

    def _request(self, method: str, url: str, headers: dict, payload: list[dict] | None) -> Any:
        try:
            if method == "post":
                return self.http.post(url, headers=headers, json=payload, timeout=self.timeout)
            if method == "get":
                return self.http.get(url, headers=headers, timeout=self.timeout)
            return self.http.delete(url, headers=headers, timeout=self.timeout)
        except requests.RequestException as exc:
            raise SyncError(f"network error: {exc}") from exc


@dataclass
class SyncStatus:
    last_sync_at: float | None = None
    last_error: str | None = None
    needs_login: bool = False
    uploaded_total: int = 0
    quarantined_total: int = 0
    backoff_seconds: float = 0.0


class SyncWorker(threading.Thread):
    """Daemon thread that runs ``sync_once`` on a schedule."""

    def __init__(self, store: Store, client: SyncClient, interval_seconds: float = 60.0,
                 batch_size: int = 200, on_status: Callable[[SyncStatus], None] | None = None,
                 clock: Callable[[], float] = time.time) -> None:
        super().__init__(name="mf-sync", daemon=True)
        self.store = store
        self.client = client
        self.interval = interval_seconds
        self.batch_size = min(200, batch_size)
        self.on_status = on_status
        # Called with the dashboard's private keywords after each good sync.
        self.on_private_keywords: Callable[[list[str]], None] | None = None
        self.clock = clock
        self.status = SyncStatus()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._lock = threading.Lock()

    def request_sync(self) -> None:
        """Run a sync as soon as possible (after sign-in, on quit)."""
        self._wake.set()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()

    def run(self) -> None:  # pragma: no cover - exercised on the real machine
        while not self._stop.is_set():
            self.sync_once()
            wait = self.status.backoff_seconds or self.interval
            self._wake.wait(wait)
            self._wake.clear()

    def sync_once(self) -> int:
        """Upload everything unsynced. Returns the number of rows uploaded; never raises."""
        with self._lock:
            uploaded = 0
            try:
                while True:
                    rows = self.store.unsynced(self.batch_size)
                    if not rows:
                        break
                    try:
                        self.client.upsert(build_payload(rows, self.client.auth.user_id))
                    except SyncRejected as exc:
                        log.warning("Batch of %d rejected (%s); retrying row by row", len(rows), exc)
                        uploaded += self._upload_individually(rows)
                    else:
                        self.store.mark_synced(rows)
                        uploaded += len(rows)
                    if len(rows) < self.batch_size:
                        break
                self.status.last_sync_at = self.clock()
                self.status.last_error = None
                self.status.needs_login = False
                self.status.backoff_seconds = 0.0
                self.status.uploaded_total += uploaded
                self.store.set_kv("last_sync_at", str(self.status.last_sync_at))
                if uploaded:
                    log.info("Synced %d session row(s)", uploaded)
                self._pull_private_keywords()
            except AuthRequired as exc:
                self.status.needs_login = True
                self.status.last_error = f"sign in required: {exc}"
                self.status.backoff_seconds = MAX_BACKOFF
                log.warning("Sync needs sign-in: %s", exc)
            except (SyncError, AuthError) as exc:
                self.status.last_error = str(exc)
                self.status.backoff_seconds = min(MAX_BACKOFF, max(60.0, self.status.backoff_seconds * 2))
                log.warning("Sync failed (%s); retrying in %.0fs", exc, self.status.backoff_seconds)
            except Exception as exc:  # anything else: log, keep rows, keep running
                self.status.last_error = f"unexpected: {exc}"
                self.status.backoff_seconds = min(MAX_BACKOFF, max(60.0, self.status.backoff_seconds * 2))
                log.exception("Unexpected sync error")
            if self.status.last_error:
                self.store.set_kv("last_error", self.status.last_error)
            if self.on_status:
                try:
                    self.on_status(self.status)
                except Exception:
                    log.exception("on_status callback failed")
            return uploaded

    def _pull_private_keywords(self) -> None:
        """Fetch the dashboard's private keywords; a failure keeps the last list."""
        if not self.on_private_keywords:
            return
        try:
            keywords = self.client.private_keywords()
        except Exception as exc:  # the server copy of the filter still applies
            log.warning("Could not fetch private keywords: %s", exc)
            return
        try:
            self.on_private_keywords(keywords)
        except Exception:
            log.exception("on_private_keywords callback failed")

    def _upload_individually(self, rows: Sequence[SessionRow]) -> int:
        """Upsert rows one at a time; quarantine the ones the server rejects."""
        ok = 0
        user_id = self.client.auth.user_id
        for row in rows:
            try:
                self.client.upsert(build_payload([row], user_id))
            except SyncRejected as exc:
                self.store.quarantine([row])
                self.status.quarantined_total += 1
                log.error("Quarantined session %s (%s, %ss): %s", row.started_at, row.app_key, row.seconds, exc)
                continue
            self.store.mark_synced([row])
            ok += 1
        return ok
