---
name: Watch entry_date parsing & seeding
description: How to key/store watch_entries by calendar day, and why sample-data seeding must be non-destructive.
---

## Date parsing
- When turning a date string into a `watch_entries.entry_date` (YYYY-MM-DD), never round-trip through `new Date(t).toISOString().split("T")[0]`.

**Why:** `toISOString()` converts to UTC, so a local date like "Jul 3, 2026" parsed in a negative-offset timezone becomes the previous day. Because imports/seeds **upsert on `(user_id, entry_date)`**, a shifted date silently overwrites the wrong day or creates a phantom row — a data-integrity bug, not just a display glitch.

**How to apply:** For date-only inputs, extract the local calendar parts (`d.getFullYear()`, `d.getMonth()+1`, `d.getDate()`) or match the digits directly. See `parseCsvDate` / `generateSampleWatchEntries` in `artifacts/app/src/lib`.

## Sample-data seeding
- "Add sample data" (seedSampleData) must be **non-destructive**: only insert days that don't already have an entry (diff generated dates against loaded `entries`), never upsert-overwrite the last-N-days window.

**Why:** the sample generator spans the most recent ~12 weeks; an upsert would silently replace any *real* entries in that window behind a friendly CTA. Plain insert on only-missing dates also avoids the `(user_id, entry_date)` unique-constraint violation.
