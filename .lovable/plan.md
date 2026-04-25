## Mention Ladder & Habit Loop on Planning Map

When the **Mastery Ladder** or **Habit Loop** modules are enabled, let any node on the Planning Map (Goal / Phase / Task / Action) "mention" a ladder level or a habit loop. The mention shows up as a tiny chip on the node and as a richer block inside the side panel — clicking it jumps you to the corresponding ladder/loop scope.

### Why it matters

Right now the Planning Map and Ladder/Habit Loop feel like separate worlds. A goal on the map might secretly *be* a Ladder Level 3 milestone, or an action might *belong to* a habit loop you're already running. Mentioning lets you cross-reference without duplicating data — the ladder/loop stays the source of truth, the map just points at it.

### Concept

On any non-link node, when you open the side panel (`PlanningNodeDetail`), a new **🔗 Mentions** section appears between the URL block and the metadata grid. It only renders sub-options the user actually has enabled in Settings → Modules:

- 🪜 **Mention a ladder level** — pick a category (or the project's own category if it's a project-scoped node) + level 0–5
- 🔄 **Mention a habit loop** — pick a category + one of its loops by name

You can attach **multiple mentions** to a node (e.g. one ladder + two loops). On the canvas itself, mentions render as small chips under the title — `🪜 Mind · L3` or `🔄 Body · Morning Routine` — clamped to max 2 visible plus a `+N` overflow.

Clicking a chip (canvas or panel) navigates to the corresponding module with the right category preselected. We'll dispatch a custom event `lov:navigate-module` with `{ module, categoryId, loopIndex? }` that `Index.tsx` listens for and uses to switch tabs + set state — same pattern already used elsewhere for tab switching.

### Storage

Mentions live on the planning task itself as a JSON column — no new table needed since they're tightly coupled to the node and small in volume.

```sql
ALTER TABLE public.planning_tasks
  ADD COLUMN mentions jsonb NOT NULL DEFAULT '[]'::jsonb;
```

Shape stored:
```ts
type Mention =
  | { kind: "ladder"; categoryId: string; level: number }   // 0–5
  | { kind: "loop";   categoryId: string; loopIndex: number };
```

`PlanningTask` interface in `usePlanningState.ts` gains `mentions: Mention[]`. The hook's existing `updateTask` already handles arbitrary partial updates, so no new method needed — we just call `updateTask(id, { mentions: [...] })`.

### UI breakdown

**1. Side panel — `PlanningNodeDetail.tsx`**

New collapsible section under the URL block, hidden when neither module is enabled:

```
🔗 Mentions                            [+ Add]
─────────────────────────────────────────────
🪜  Mind · Level 3 — Feedback              ✕
🔄  Body · Morning Routine                 ✕
```

Clicking `+ Add` opens a small inline picker with two tabs (Ladder / Loop), each shown only if its module is enabled. Each tab has:
- Category dropdown (populated from `getCategories()` in `useUserSettings`)
- For Ladder: 6 level buttons (0–5) using the `LADDER_LEVELS` color tokens
- For Loop: list of that category's loops by name, fetched from `useHabitLoopState` (read-only — we don't mutate)

Empty states: if a category has no loops yet, show "No loops in this category — create one first" with a chip-link to the Habit Loop module.

**2. Canvas — `TaskNode` in `PlanningMap.tsx`**

Below the title row, when `task.mentions?.length > 0`, render a flex row of small chips:
- Ladder chip: `bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 border-violet-500/40` + 🪜 emoji + `L{n}`
- Loop chip: `bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-500/40` + 🔄 emoji + truncated loop name
- Max 2 chips visible, `+N` pill if more
- Click → `e.stopPropagation()` + dispatch the navigation event

Chips inherit the `opacity-50` when `task.done` so they fade with the node.

**3. Navigation glue — `src/pages/Index.tsx`**

Add a `useEffect` that listens for `lov:navigate-module` and:
- sets the active tab to `"ladder"` or `"habitloop"`
- For ladder: dispatches a follow-up event `lov:set-ladder-category` consumed by `LadderView` to call `setActiveCategory(categoryId)` and scroll to the chosen level
- For loop: dispatches `lov:set-loop-category` consumed by `HabitLoopView` to switch category and highlight the loop by index

This keeps Planning decoupled — it just emits events, doesn't import Ladder/Loop internals.

**4. Module gating**

Throughout, gate visibility with:
```ts
const { preferences } = useUserSettings();
const ladderOn = !preferences.enabledModules.length || preferences.enabledModules.includes("ladder");
const loopOn   = !preferences.enabledModules.length || preferences.enabledModules.includes("habitloop");
```
(matches the pattern in `DashboardView.tsx`)

If neither is enabled, the entire Mentions section is hidden — no empty UI.

### Edge cases handled

- **Mentioned ladder/loop deleted later** — when rendering a chip, look up the target; if missing, render it greyed-out with a small ⚠ tooltip "Source no longer exists" + an X to remove. No silent breakage.
- **Project-scoped nodes** — the category picker defaults to the project's parent category if available (project key starts with `project-` and `useUserProjects` exposes the parent).
- **Duplicates** — adding the same `kind+categoryId+level/loopIndex` twice is a no-op (deduped before save).
- **Shared library / public views** — Planning isn't in the public share scope, so no SharedLibrary impact.

### Files

**New**
- `supabase/migrations/<ts>_planning_mentions.sql` — adds `mentions jsonb` column with default `[]`

**Modified**
- `src/hooks/usePlanningState.ts` — add `mentions: Mention[]` to interface, default `[]` in fetch & insert
- `src/components/planning/PlanningNodeDetail.tsx` — new Mentions section + inline picker UI
- `src/components/planning/PlanningMap.tsx` — render mention chips inside `TaskNode`
- `src/pages/Index.tsx` — listen for `lov:navigate-module` and switch tab + relay sub-event
- `src/components/ladder/LadderView.tsx` — listen for `lov:set-ladder-category` to apply category + scroll
- `src/components/habitloop/HabitLoopView.tsx` — listen for `lov:set-loop-category` to apply category + highlight

### Out of scope

- Mentioning Archive blocks, Library books, or Calendar events (same pattern can be cloned later)
- Reverse view (a "Mentioned by" panel inside Ladder/Loop showing which planning nodes reference them)
- Bulk-mention from multi-select on the map
- Drag-to-mention (dragging a ladder level onto a node)
