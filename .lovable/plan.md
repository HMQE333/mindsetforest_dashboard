## Root Cause

When a user has never customized their metrics, `userMetrics` (the DB-backed list) is empty, and the tracker falls back to the hardcoded `TRACKER_METRICS` defaults. `MetricsTab.tsx` seeds its editor from those defaults:

```ts
const source = userMetrics.length > 0 ? userMetrics : TRACKER_METRICS;
setMetrics(source.map((m, i) => ({
  tempId: `m-${i}-${Date.now()}`,
  existingId: 'id' in m ? (m as UserMetric).id : undefined, // ← BUG
  ...
})));
```

The bug: `TRACKER_METRICS` items also have an `id` field (string slugs like `"hours-trading"`, `"pushups"`). The `'id' in m` check evaluates `true` for them, so `existingId` is set to a non-UUID slug.

On save (`saveMetrics` in `useUserSettings.ts`):
- All items go into `toUpdate` because they appear to have `existingId`s.
- `currentIds = userMetrics.map(m => m.id)` is `[]` (DB had nothing), so `toDeleteIds` is `[]`.
- The `UPDATE ... WHERE id = 'hours-trading'` queries silently match zero rows (slug is not a UUID).
- `toInsert` is empty → nothing is written to the database.
- Local React state `userMetrics` gets populated with these fake-ID entries, so the UI looks correct momentarily.
- On the next page load, the DB is still empty → `getMetrics()` falls back to `TRACKER_METRICS` → the "removed" metric reappears.

## Fix

Only treat metrics as "existing" when they actually came from the database. Distinguish defaults from DB rows in the seeding step.

**`src/components/settings/MetricsTab.tsx`** — change the seeding effect so `existingId` is only populated when the source is `userMetrics` (real DB rows). For defaults (`TRACKER_METRICS`), leave `existingId` undefined so they are treated as fresh inserts on save:

```ts
useEffect(() => {
  const fromDb = userMetrics.length > 0;
  const source = fromDb ? userMetrics : TRACKER_METRICS;
  setMetrics(source.map((m, i) => ({
    tempId: `m-${i}-${Date.now()}`,
    existingId: fromDb ? (m as UserMetric).id : undefined,
    label: m.label,
    unit: m.unit,
    icon: m.icon,
    categoryId: m.categoryId,
  })));
}, [userMetrics]);
```

## Behavior After Fix

- **First customization (DB empty):** Removing "Trading Hours" then saving inserts the remaining 9 metrics into `user_metrics` as fresh rows. Reload → DB has those 9 → "Trading Hours" stays gone. ✅
- **Subsequent edits (DB populated):** Items keep their real UUID `existingId`s; removing one correctly puts its UUID into `toDeleteIds` and runs `DELETE`. ✅
- **Reset to defaults:** Still wipes `user_metrics` and falls back to `TRACKER_METRICS` until next save. ✅

## Files Touched

- `src/components/settings/MetricsTab.tsx` — single-line correction in the seeding `useEffect`.

No DB migration, no schema change, no changes to `useUserSettings.saveMetrics` (its insert/update/delete logic is correct — it was just being fed bad data).

## Memory Update

Reinforce `mem://architecture/settings-persistence`: when seeding editor state from a fallback list of hardcoded defaults, never carry their synthetic IDs into the "existing DB row" code path — only real persisted IDs count as `existingId`.