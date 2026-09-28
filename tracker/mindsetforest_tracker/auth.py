"""Supabase email+password auth and the encrypted saved session.

Only the refresh token (plus user id and email) is written to disk, encrypted
with Windows DPAPI (``CryptProtectData``) so only this Windows user can read
it. Off Windows the file is plain text and a warning is logged - dev only.
The access token lives in memory and is refreshed when it is within
``min_valid_seconds`` of expiry.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

log = logging.getLogger(__name__)

try:  # pragma: no cover - Windows only
    import win32crypt

    DPAPI_AVAILABLE = True
except ImportError:  # pragma: no cover
    DPAPI_AVAILABLE = False

_DPAPI_MAGIC = b"MFDPAPI1"
_PLAIN_MAGIC = b"MFPLAIN1"


class AuthError(Exception):
    """Sign-in or refresh was rejected (bad credentials, revoked token)."""


class AuthRequired(AuthError):
    """No usable session: the user has to sign in again from the tray."""


class AuthUnavailable(AuthError):
    """The auth server could not be reached (network, 5xx, 429). Tokens are kept; retry later."""


@dataclass
class Tokens:
    access_token: str
    refresh_token: str
    user_id: str
    expires_at: float
    email: str = ""


def protect(data: bytes) -> bytes:
    """Encrypt bytes for the current Windows user (plain text elsewhere)."""
    if DPAPI_AVAILABLE:  # pragma: no cover
        return _DPAPI_MAGIC + win32crypt.CryptProtectData(data, "MindsetForest", None, None, None, 0)
    return _PLAIN_MAGIC + data


def unprotect(blob: bytes) -> bytes:
    """Inverse of ``protect``. Raises ValueError for an unreadable blob."""
    if blob.startswith(_DPAPI_MAGIC):
        if not DPAPI_AVAILABLE:
            raise ValueError("session file is DPAPI-encrypted; cannot read it here")
        return win32crypt.CryptUnprotectData(blob[len(_DPAPI_MAGIC):], None, None, None, 0)[1]  # pragma: no cover
    if blob.startswith(_PLAIN_MAGIC):
        return blob[len(_PLAIN_MAGIC):]
    raise ValueError("unknown session file format")


class SupabaseAuth:
    """Holds tokens for one user and talks to ``/auth/v1``."""

    def __init__(
        self,
        supabase_url: str,
        anon_key: str,
        session_path: Path,
        http: Any | None = None,
        clock: Callable[[], float] = time.time,
        timeout: float = 15.0,
    ) -> None:
        self.url = supabase_url.rstrip("/")
        self.anon_key = anon_key
        self.session_path = session_path
        self.http = http or requests.Session()
        self.clock = clock
        self.timeout = timeout
        self.tokens: Tokens | None = None
        self._lock = threading.RLock()  # one refresh at a time: Supabase rotates refresh tokens

    # -- state ---------------------------------------------------------------

    @property
    def has_session(self) -> bool:
        return bool(self.tokens and self.tokens.refresh_token)

    @property
    def user_id(self) -> str:
        return self.tokens.user_id if self.tokens else ""

    @property
    def email(self) -> str:
        return self.tokens.email if self.tokens else ""

    # -- persistence ---------------------------------------------------------

    def load_saved(self) -> bool:
        """Load the saved refresh token. False when there is none or it is unreadable.

        Any failure (corrupt file, DPAPI blob from another user/machine, which
        raises ``pywintypes.error``) is logged, the file is moved aside as
        ``session.bin.bad`` and the tray simply offers "Sign in...".
        """
        try:
            blob = self.session_path.read_bytes()
        except FileNotFoundError:
            return False
        except OSError as exc:
            log.warning("Saved session unreadable (%s); sign in again", exc)
            return False
        try:
            data = json.loads(unprotect(blob).decode("utf-8"))
            self.tokens = Tokens("", data["refresh_token"], data["user_id"], 0.0, data.get("email", ""))
        except Exception as exc:  # ValueError, KeyError, pywintypes.error, ...
            bad = self.session_path.with_name(self.session_path.name + ".bad")
            log.warning("Saved session unreadable (%s); moved to %s, sign in again", exc, bad)
            try:
                self.session_path.replace(bad)
            except OSError as move_exc:
                log.warning("Could not move bad session file: %s", move_exc)
            self.tokens = None
            return False
        return self.has_session

    def _save(self) -> None:
        if not self.tokens:
            return
        if not DPAPI_AVAILABLE:
            log.warning("DPAPI unavailable: saving refresh token unencrypted to %s", self.session_path)
        payload = json.dumps(
            {"refresh_token": self.tokens.refresh_token, "user_id": self.tokens.user_id,
             "email": self.tokens.email}
        ).encode("utf-8")
        try:
            self.session_path.parent.mkdir(parents=True, exist_ok=True)
            self.session_path.write_bytes(protect(payload))
        except OSError as exc:
            # The rotated token only lives in memory now; a restart will need a sign-in.
            log.error("COULD NOT SAVE SESSION FILE %s: %s (token kept in memory only)", self.session_path, exc)

    def sign_out(self) -> None:
        self.tokens = None
        try:
            self.session_path.unlink()
        except FileNotFoundError:
            pass

    # -- API -----------------------------------------------------------------

    def sign_in(self, email: str, password: str) -> Tokens:
        """Password grant. Saves the refresh token on success."""
        with self._lock:
            tokens = self._token_request({"email": email, "password": password}, "password")
            tokens.email = email
            self.tokens = tokens
            self._save()
            return tokens

    def refresh(self) -> Tokens:
        """Exchange the refresh token for a new pair.

        Raises ``AuthRequired`` when the server rejects the token and
        ``AuthUnavailable`` when it cannot be reached (tokens are kept as they
        are so the next attempt can retry).
        """
        with self._lock:
            if not self.has_session:
                raise AuthRequired("not signed in")
            assert self.tokens is not None
            old = self.tokens
            try:
                tokens = self._token_request({"refresh_token": old.refresh_token}, "refresh_token")
            except AuthUnavailable as exc:
                log.warning("Refresh postponed, auth server unreachable: %s", exc)
                raise
            except AuthError as exc:
                log.warning("Refresh rejected: %s", exc)
                old.access_token = ""
                raise AuthRequired(str(exc)) from exc
            tokens.email = old.email
            self.tokens = tokens
            self._save()
            return tokens

    def ensure_access_token(self, min_valid_seconds: float = 300.0) -> str:
        """Return a valid access token, refreshing when missing or about to expire."""
        with self._lock:
            if not self.has_session:
                raise AuthRequired("not signed in")
            assert self.tokens is not None
            if not self.tokens.access_token or self.tokens.expires_at - self.clock() < min_valid_seconds:
                self.refresh()
            return self.tokens.access_token

    def headers(self) -> dict[str, str]:
        """``apikey`` + ``Authorization`` for PostgREST calls."""
        return {"apikey": self.anon_key, "Authorization": f"Bearer {self.ensure_access_token()}"}

    def _token_request(self, body: dict, grant_type: str) -> Tokens:
        url = f"{self.url}/auth/v1/token?grant_type={grant_type}"
        try:
            resp = self.http.post(
                url, headers={"apikey": self.anon_key, "Content-Type": "application/json"},
                json=body, timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise AuthUnavailable(f"network error: {exc}") from exc
        if resp.status_code == 429 or resp.status_code >= 500:
            raise AuthUnavailable(_error_message(resp))
        if resp.status_code != 200:
            raise AuthError(_error_message(resp))
        data = resp.json()
        expires_at = float(data.get("expires_at") or (self.clock() + float(data.get("expires_in", 3600))))
        return Tokens(
            access_token=data["access_token"], refresh_token=data["refresh_token"],
            user_id=(data.get("user") or {}).get("id", ""), expires_at=expires_at,
        )


def _error_message(resp: Any) -> str:
    try:
        data = resp.json()
        msg = data.get("error_description") or data.get("msg") or data.get("message") or data.get("error")
    except ValueError:
        msg = None
    return f"HTTP {resp.status_code}: {msg or resp.text[:200]}"
