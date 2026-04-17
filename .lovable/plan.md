

## Randomized Task Variants

Add a feature where a single mission slot can hold multiple "variants" with weighted probabilities. Each day (on reset), the system rolls the dice and picks one variant to display. Perfect for users who want variety or can't decide between two similar tasks.

### Concept

Instead of a fixed task like "Push-ups + Warm-up", a slot could contain:
- 60% → "Push-ups + Warm-up" (15 min, 25 XP)
- 30% → "Pull-ups Practice" (15 min, 25 XP)  
- 10% → "Full Body Stretch" (15 min, 20 XP)

Each morning (or on day reset), one variant is rolled and shown for the day.

### Data Model Changes

Update `Mission` interface in `src/lib/dashboard-data.ts`:
```ts
interface MissionVariant {
  title: string;
  description: string;
  duration: string;
  xp: number;
  url?: string;
  weight: number; // probability weight (1-100)
}

interface Mission {
  // ...existing fields
  variants?: MissionVariant[]; // if present, daily roll picks one
}
```

Add to `DashboardState`:
```ts
rolledVariants: Record<string, number>; // missionId -> chosen variant index for the day
```

### UI Changes

**1. Edit Missions Modal** (`EditMissionsModal.tsx`)
- Add a small "🎲 Variants" toggle button per task (next to the persistent toggle)
- When enabled, expand the row to show a variants sub-list:
  - Each variant has: title, description, duration, XP, weight (%)
  - "Add variant" button
  - Auto-normalize weights display (show "60%" if weights sum doesn't equal 100)
  - Delete variant button (must keep at least 1)

**2. Mission Card** (`MissionView.tsx`)
- Show a small 🎲 dice badge in the corner of cards that have variants
- Show the currently rolled variant's content (title, description, duration, XP)
- Add a "Reroll" button (small, subtle) next to the dice badge — costs nothing but only available if mission isn't completed yet today

**3. Daily Reset Logic** (`useDashboardState.ts`)
- On `resetDay` (and on first load of a new day), iterate through all missions with `variants` and roll a new variant index based on weights
- Store rolls in `rolledVariants` map, keyed by `${categoryId}-${missionIndex}`
- Persist to DB

### Helper Function
```ts
function rollVariant(variants: MissionVariant[]): number {
  const total = variants.reduce((s, v) => s + v.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < variants.length; i++) {
    r -= variants[i].weight;
    if (r <= 0) return i;
  }
  return 0;
}
```

### Database
The `dashboard_state.custom_missions` JSONB column already stores arbitrary mission shape, so `variants` field will be persisted automatically. Need a new column `rolled_variants JSONB` on `dashboard_state` table to store the daily rolls.

### Files to Modify
1. `src/lib/dashboard-data.ts` — add `MissionVariant` type and `variants` field
2. `src/hooks/useDashboardState.ts` — add `rolledVariants` state, roll logic on reset, `rerollMission` function, persist new field
3. `src/components/dashboard/EditMissionsModal.tsx` — add variants UI editor
4. `src/components/dashboard/MissionView.tsx` — read rolled variant, show dice badge + reroll button
5. New migration to add `rolled_variants` JSONB column to `dashboard_state` table

### Out of Scope
- Manual variant picker (always random, by design — that's the point)
- Per-variant statistics / "this variant rolled X times"
- Locking a specific variant for N days

