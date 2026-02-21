

# Habit Loop Feature

## Concept

A **Habit Loop** is a repeating cycle of tasks tied to a category. Unlike the Mastery Ladder (which is a one-time progression) or daily missions (which reset each day), a Habit Loop focuses on **repetition-based mastery** -- you must complete a set of habits a defined number of times (e.g., 7 reps, 14 reps, 21 reps) before the loop advances to the next stage with harder or evolved tasks.

```text
Loop 1 (Foundation)          Loop 2 (Building)            Loop 3 (Mastery)
+-----------------------+    +-----------------------+    +-----------------------+
| - Meditate 5 min  x7 |    | - Meditate 10 min x14|    | - Meditate 20 min x21|
| - Read 10 pages   x7 | -> | - Read 20 pages  x14 | -> | - Read 30 pages  x21 |
| - Journal 5 min   x7 |    | - Journal 10 min x14 |    | - Deep journal   x21 |
+-----------------------+    +-----------------------+    +-----------------------+
```

Each task tracks how many times it has been completed. Once ALL tasks in a loop hit their required reps, the loop advances automatically.

---

## Data Model

### New Database Table: `habit_loops`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner |
| category_id | text | Which category (mind, body, etc.) |
| current_loop | integer | Which loop stage the user is on (0, 1, 2...) |
| loops | jsonb | Array of loop definitions with tasks and rep targets |
| created_at | timestamptz | Creation time |
| updated_at | timestamptz | Last update |

The `loops` JSONB structure:

```json
{
  "loops": [
    {
      "name": "Foundation",
      "repsRequired": 7,
      "tasks": [
        { "id": "abc", "text": "Meditate 5 min", "completedReps": 3 },
        { "id": "def", "text": "Read 10 pages", "completedReps": 7 }
      ]
    },
    {
      "name": "Building",
      "repsRequired": 14,
      "tasks": [
        { "id": "ghi", "text": "Meditate 10 min", "completedReps": 0 }
      ]
    }
  ]
}
```

RLS policies: same pattern as ladder_state -- users can only read/insert/update their own rows.

---

## UI Design

### New Tab: "Habit Loop" (or integrated as a sub-view within the existing tabs)

A new tab button in the Index page header alongside Dashboard, Tracker, and Ladder:

```text
[Dashboard] [Stats Tracker] [Next Action Ladder] [Habit Loop]
```

### Habit Loop View

```text
+--------------------------------------------------+
| Category: [Mind v]                    [AI Generate]|
+--------------------------------------------------+
|                                                    |
|  LOOP 1: Foundation  (7 reps to advance)           |
|  ================================================  |
|                                                    |
|  [ ] Meditate 5 min        |||||||__ (5/7)         |
|  [ ] Read 10 pages         |||||____ (4/7)         |
|  [x] Journal 5 min         ||||||||| (7/7) done    |
|                                                    |
|  Overall: 16/21 reps  [=====>    ] 76%             |
|                                                    |
|  ------------------------------------------------  |
|  LOOP 2: Building  (locked)                        |
|  LOOP 3: Mastery   (locked)                        |
+--------------------------------------------------+
```

Key UI elements:
- Each task has a **"Log Rep"** button (not a checkbox -- since you do it multiple times)
- A **progress bar** per task showing reps completed / reps required
- An **overall loop progress** bar
- Locked future loops shown as dimmed/preview
- **Celebration animation** when a loop completes and advances
- A "+" button to manually add habits
- Category selector (same as ladder)

### Loop Advancement

When all tasks in the current loop reach their rep target:
- Confetti/glow celebration (reuse MasteryOverlay)
- Auto-advance to next loop
- Next loop's tasks become active with fresh rep counters

---

## AI Integration

### "AI Generate Loops" Button

A modal (similar to AILadderModal) that generates loop definitions. The AI receives:
- Category name and context
- User's goal and constraints (reuse the same controls pattern)
- Current loop stage

The AI returns 3 loops with progressively harder tasks and increasing rep requirements (e.g., 7 -> 14 -> 21).

### New Edge Function: `ai-habit-loop-suggest`

Takes category info and returns structured loop definitions. Same pattern as `ai-ladder-suggest` but outputs loops instead of levels.

---

## Files to Create/Modify

| File | Change |
|------|--------|
| **New** `src/lib/habit-loop-data.ts` | TypeScript interfaces for HabitTask, HabitLoop, AllHabitLoops, and helper functions |
| **New** `src/hooks/useHabitLoopState.ts` | Hook for CRUD operations on habit loops, persistence to database, loop advancement logic |
| **New** `src/components/habitloop/HabitLoopView.tsx` | Main view component with category selector, loop display, progress tracking |
| **New** `src/components/habitloop/HabitLoopCard.tsx` | Individual loop card showing tasks with rep counters and progress bars |
| **New** `src/components/habitloop/AIHabitLoopModal.tsx` | AI generation modal with goal/constraints controls |
| **New** `supabase/functions/ai-habit-loop-suggest/index.ts` | Edge function for AI-powered loop generation |
| **Modify** `src/pages/Index.tsx` | Add "Habit Loop" tab |
| **DB Migration** | Create `habit_loops` table with RLS policies |

---

## Implications and Considerations

### How It Differs From Existing Features

| Feature | Purpose | Completion Model |
|---------|---------|-----------------|
| **Daily Missions** | One-off daily tasks | Complete once per day, resets |
| **Mastery Ladder** | Linear skill progression | Complete once, permanent |
| **Habit Loop** | Repetition-based habit building | Complete N times, then evolve |

### Interaction With Other Features

- **Dashboard XP**: Each rep logged in a Habit Loop could grant small XP (e.g., 5-10 XP per rep), feeding into the existing leveling system
- **Ladder Context**: The AI loop generator could reference ladder progress to suggest habits that reinforce current mastery stage
- **Streak Integration**: Consecutive daily reps could tie into the existing streak counter

### Edge Cases to Handle

- User can manually add/remove tasks within a loop
- User can reset a loop if they want to start over
- If all loops are completed, show a "mastery achieved" state with option to create new, harder loops
- Rep logging should have a daily cap (e.g., max 1 rep per task per day) to encourage consistency over grinding

---

## Technical Notes

- The `useHabitLoopState` hook follows the exact same pattern as `useLadderState`: load from DB on mount, persist on every change via upsert
- The JSONB `loops` column stores the full loop structure to avoid complex relational tables
- Loop advancement is computed client-side: when all tasks in `loops[currentLoop]` have `completedReps >= repsRequired`, increment `currentLoop`
- The AI edge function uses the same Lovable AI gateway pattern with tool calling for structured output

