"""Windows that are never recorded, not even in the local database.

Adult sites and words are built in (``PRIVATE_TERMS``); the user adds their
own keywords in the dashboard (Stats -> Computer -> Private), which the agent
pulls at each sync. A private window is treated like an ignored app: the open
session closes and nothing is written until something else is in front.

The same term list is compiled into the database trigger that drops private
rows (``supabase/migrations/20260930120000_app_usage_privacy.sql``), so an
agent that is out of date still cannot store them. Keep the two in step.

Built-in terms match as whole words, case-insensitively: ``sex`` matches
"Sex Education" but not "Essex". A trailing ``*`` matches any continuation
(``porn*`` covers "porno", "pornography"). User keywords match anywhere.
"""
from __future__ import annotations

import re
from collections.abc import Iterable

PRIVATE_TERMS: tuple[str, ...] = (
    # sites
    "pornhub", "xvideos", "xnxx", "xhamster", "xhamsterlive", "redtube", "youporn", "youjizz",
    "spankbang", "eporner", "tube8", "txxx", "hqporner", "porntrex", "beeg", "motherless",
    "chaturbate", "stripchat", "bongacams", "livejasmin", "cam4", "camsoda", "myfreecams",
    "onlyfans", "fansly", "manyvids", "brazzers", "bangbros", "realitykings", "rule34",
    "nhentai", "e-hentai", "hanime", "erome", "literotica", "sex.com", "fapello", "thothub",
    # words
    "porn*", "xxx*", "nsfw", "hentai*", "nude", "nudes", "naked", "sex", "sexy", "seks*",
    "erotic*", "erotyk*", "camgirl*", "sexcam*", "milf*", "18+",
)


def _term(term: str) -> str:
    if term.endswith("*"):
        return re.escape(term[:-1]) + "[a-z0-9]*"
    return re.escape(term)


PRIVATE_RE = re.compile(
    r"(?<![a-z0-9])(?:" + "|".join(_term(t) for t in PRIVATE_TERMS) + r")(?![a-z0-9])",
    re.IGNORECASE,
)


def normalize_keywords(keywords: Iterable[str]) -> tuple[str, ...]:
    """Lower-cased, trimmed, de-duplicated keywords of at least two characters."""
    seen: dict[str, None] = {}
    for k in keywords:
        k = str(k).strip().lower()
        if len(k) >= 2:
            seen.setdefault(k, None)
    return tuple(seen)


def is_private(*texts: str, keywords: Iterable[str] = ()) -> bool:
    """True when any text names a built-in private term or contains a user keyword."""
    joined = " ".join(t for t in texts if t)
    if not joined:
        return False
    if PRIVATE_RE.search(joined):
        return True
    lowered = joined.lower()
    return any(k in lowered for k in keywords)
