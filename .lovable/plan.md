

## Plan: Project-Scoped Ladders and Habit Loops

### Problem
Currently ladders and habit loops are locked to the 8 life categories (Mind, Body, Creation, etc.). But sometimes you need a ladder or habit loop for a specific project (e.g., "Learn Rust", "Launch SaaS", "Piano") that doesn't map cleanly to a single category and shouldn't pollute the category-level AI context.

### Solution: Custom Projects
Add a "Projects" concept — user-created scopes that appear alongside the 8 categories in the Ladder and Habit Loop dropdowns. Each project gets its own independent ladder and habit loop data.

A project is just a name + optional emoji + optional parent category (for loose grouping). It uses the same data structures — the `AllLadders` and `AllHabitLoops` interfaces already support arbitrary string keys.

### Data Storage
New database table `user_projects`:

```sql
CREATE TABLE user_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '📁',
  parent_category text, -- optional link to a life pillar
  created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: standard user_id ownership policies
```

No changes to `ladder_state` or `habit_loops` tables — they already store data keyed by arbitrary string IDs. Projects will use `project-{uuid}` as the key.

### UI Changes

**Category selector in LadderView and HabitLoopView:**
- Add an optgroup separator: "Categories" (8 pillars) then "Projects" (user-created)
- Add a "+ New Project" button next to the dropdown
- Clicking it opens a small inline form: name + emoji picker
- Projects can be renamed or deleted via a small context menu on the dropdown option

**AI generation:**
- When a project scope is active, AI prompts include the project name instead of category name/tagline
- This keeps AI suggestions relevant to the project, not the broad category

### Files to Change

| File | Change |
|------|-------|
| DB migration | Create `user_projects` table with RLS |
| `src/hooks/useUserProjects.ts` | **New** — CRUD for projects |
| `src/components/ladder/LadderView.tsx` | Enhanced dropdown with projects + create button |
| `src/components/habitloop/HabitLoopView.tsx` | Same enhanced dropdown |
| `src/hooks/useLadderState.ts` | Accept project IDs as activeCategory |
| `src/hooks/useHabitLoopState.ts` | Accept project IDs as activeCategory |
| `src/components/ladder/AILadderModal.tsx` | Pass project name to AI when project scope is active |
| `src/components/habitloop/AIHabitLoopModal.tsx` | Pass project name to AI when project scope is active |

### How It Works
1. User clicks "+ New Project" next to the category dropdown
2. Types "Learn Rust" with emoji "🦀"
3. Project appears in dropdown under a "Projects" section
4. Selecting it loads an empty ladder / habit loop scoped to that project
5. AI Suggest uses "Learn Rust" as context instead of "Mind - Learning & Programming"
6. Project data is stored independently — doesn't interfere with category data

