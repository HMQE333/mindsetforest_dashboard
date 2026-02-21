

# Three Improvements Plan

## 1. Glow Effect on Nearly-Complete Ladder Steps

When most tasks in a ladder level are completed, that level's card gets an animated glow effect matching the level's color scheme -- similar to the original HTML's hover glow.

**What changes:**
- `LadderStep.tsx`: Calculate completion ratio from `tasks`. When >= 75% complete (e.g. 3/4 tasks done), add a pulsing glow border and subtle animated box-shadow using the level's color. When 100% complete, the glow intensifies further.
- `src/index.css`: Add a `@keyframes ladder-glow` animation for a subtle pulsing box-shadow effect.

**Technical detail:**
- Compute `completedRatio = tasks.filter(t => t.completed).length / tasks.length`
- At >= 0.75: apply `box-shadow: 0 0 20px <levelColor>40, 0 0 40px <levelColor>20` with a pulse animation
- At 1.0 (all done): stronger glow + the existing "Completed" seal

---

## 2. "Generate Today's Missions from Ladder" Button in Dashboard AI Modal

A new button/mode in the Dashboard's AI Suggestions modal that pulls context from the user's current ladder state to generate smarter daily missions.

**What changes:**

- **`AISuggestionsModal.tsx`**: Add a new toggle/button "Generate from Ladder" that, when active, fetches the user's ladder state and passes it to the edge function. The modal will accept an optional `ladderData` prop.
- **`DashboardView.tsx`**: Pass the ladder state into the AI modal. Import `useLadderState` here so data is available.
- **`ai-mission-suggest/index.ts` (edge function)**: Accept an optional `ladderContext` field in the request body. When present, include it in the system prompt so AI knows which ladder levels have the most completed tasks and what specific tasks exist, generating daily missions that align with the user's current progression stage.

**How it works:**
- The frontend gathers: which category's ladder has most completed tasks, which level the user is currently at (first non-complete level), and completed task names
- This context goes to the edge function as a structured object
- The AI prompt says: "The user is currently at [level] in their mastery ladder. They've completed these tasks: [...]. Generate today's missions that push them to the next level."

---

## 3. "Split Task" Button on Mission Cards

Each uncompleted mission card gets a split button that calls AI to break it into 3 smaller, less intimidating sub-tasks with reduced XP.

**What changes:**

- **`MissionView.tsx`**: Add a "Split" button (scissors icon) on each uncompleted mission card. When clicked, calls a new edge function and replaces the original mission with 3 smaller ones.
- **New edge function `ai-split-task/index.ts`**: Takes a mission title, description, duration, and XP. Returns 3 smaller tasks, each with ~1/3 of the XP (rounded), shorter durations, and concrete actionable steps (like "get training clothes" -> "play playlist" -> "start first 20min").
- **`useDashboardState.ts`**: Add a `splitMission` function that replaces one mission at a given index with multiple sub-missions in `customMissions`, then persists.

**How the split works:**
- Original mission: "Train for 1h" (40 XP)
- After split: 3 missions each ~13 XP, with concrete micro-steps
- The split missions replace the original in `customMissions` for that category
- Completed sub-missions each count independently for XP

**Edge function prompt:** "Break this task into exactly 3 smaller, immediately actionable micro-tasks. Each should take less time and feel easy to start. Distribute the XP proportionally. Example: 'Train for 1h' becomes: 1. Get training clothes ready, 2. Play your workout playlist, 3. Start first 20 min of training."

---

## Summary of Files Changed

| File | Change |
|------|--------|
| `src/components/ladder/LadderStep.tsx` | Add glow effect based on completion ratio |
| `src/index.css` | Add `ladder-glow` keyframe animation |
| `src/components/dashboard/AISuggestionsModal.tsx` | Add "Generate from Ladder" toggle + pass ladder context |
| `src/components/dashboard/DashboardView.tsx` | Import `useLadderState`, pass data to AI modal |
| `src/components/dashboard/MissionView.tsx` | Add "Split" button per mission card |
| `src/hooks/useDashboardState.ts` | Add `splitMission` helper |
| `supabase/functions/ai-mission-suggest/index.ts` | Accept + use ladder context in prompt |
| `supabase/functions/ai-split-task/index.ts` | New edge function for splitting tasks |

