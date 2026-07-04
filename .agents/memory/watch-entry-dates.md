---
name: Watch entry_date parsing
description: Why date-only strings must be parsed as local calendar dates, not via toISOString(), when building watch_entries.
---

- When turning a date string into a `watch_entries.entry_date` (YYYY-MM-DD), never round-trip through `new Date(t).toISOString().split("T")[0]`.

**Why:** `toISOString()` converts to UTC, so a local date like "Jul 3, 2026" parsed in a negative-offset timezone becomes the previous day. Because imports **upsert on `(user_id, entry_date)`**, a shifted date silently overwrites the wrong day or creates a phantom row — a data-integrity bug, not just a display glitch.

**How to apply:** For date-only inputs, extract the local calendar parts (`d.getFullYear()`, `d.getMonth()+1`, `d.getDate()`) or match the digits directly. Same rule anywhere a calendar day is keyed/stored (health entries, tracker days). See `parseCsvDate` in `artifacts/app/src/lib/watch-import.ts`.
