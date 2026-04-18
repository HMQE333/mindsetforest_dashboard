

## Day-of-Week Scheduled Tasks

Let users mark a task to appear only on specific weekdays (e.g., only Saturdays). On hidden days, the task doesn't exist for the user — it's invisible, not counted in totals, doesn't affect "X/3 completed" math, doesn't roll variants, doesn't appear at all.

### Concept

Each task gets an optional `daysOfWeek` array (0=Sunday … 6=Saturday). Default = undefined → shows every day (current behavior). If set (e.g. `[6, 0]` for weekends), the task only renders on those days.

### Data Model

Update `Mission` in `src/lib/dashboard-data.ts`:
```ts
interface Mission {
  // ...existing fields
  daysOfWeek?: number[]; // [0..6]; undefined = every day
}
```

No DB schema change needed — `custom_missions` JSONB already stores arbitrary mission shape.

### Filter Logic

Add a helper in `useDashboardState.ts`:
```ts
function isVisibleToday(mission: Mission, today = new Date().getDay()): boolean {
  if (!mission.daysOfWeek || mission.daysOfWeek.length === 0) return true;
  return mission.daysOfWeek.includes(today);
}
```

Apply it inside `getMissions(categoryId)` so the filtered list is the single source of truth. This automatically fixes:
- Mission cards in `MissionView`
- "X/3 completed" counters (CategoryGrid uses filtered count)
- XP totals & category-complete detection
- Variant rolling (only rolls for visible missions)

### UI Changes

**1. EditMissionsModal.tsx**
Add a compact day picker row per task (small, subtle, below the existing toggles):
```
Days:  [S] [M] [T] [W] [T] [F] [S]   ← seven small pill toggles
       (all selected or none = "Every day")
```
- Click toggles individual day on/off
- "Every day" preset button to clear all selections
- Quick presets: "Weekdays" (Mon–Fri) / "Weekends" (Sat–Sun)
- When fewer than 7 days are selected, show a small label: "Mon, Wed, Fri" or "Weekends only"

**2. MissionView.tsx**
Optional: small calendar badge `📅 Sat·Sun` in the top-right of mission cards that have `daysOfWeek` set, so users remember why a task is special. Same style as the dice variant badge.

**3. CategoryGrid.tsx**
No change needed if `getMissions()` already returns filtered list — counters will follow automatically. Will verify during implementation.

### Edge Cases

- **All 7 days selected** → treat same as undefined (every day) for cleaner UI
- **Zero days selected** → block save in modal, show inline warning ("Select at least one day or 'Every day'")
- **Variants** → variant rolling only iterates visible missions, no orphan rolls
- **Completion IDs** → unchanged (still `${categoryId}-${index}`); hidden tasks just aren't shown but their old completion records remain harmless
- **Reset defaults** → unchanged behavior

### Files to Modify

1. `src/lib/dashboard-data.ts` — add `daysOfWeek?: number[]` to `Mission`
2. `src/hooks/useDashboardState.ts` — add `isVisibleToday` helper, filter inside `getMissions`, skip hidden in variant roll loop
3. `src/components/dashboard/EditMissionsModal.tsx` — add day picker UI per task
4. `src/components/dashboard/MissionView.tsx` — optional schedule badge on cards
5. `src/components/dashboard/CategoryGrid.tsx` — verify counter uses filtered list (likely already does)

### Out of Scope

- Date-range scheduling (e.g., "only next month")
- Different tasks per day in the same slot (variants already cover that)
- Timezone handling beyond browser-local `new Date().getDay()`

