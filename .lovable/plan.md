

## Plan: Add Manual Habit Loop Creation

Currently the only way to create habit loops is via the AI Generate button. We'll add a "Create Manually" option that lets users define their own loops with a simple modal form.

### Changes

**1. Create `src/components/habitloop/ManualHabitLoopModal.tsx`**
- Modal with a form to define a loop: name (text input), reps required (number input), and a dynamic list of tasks (add/remove task text inputs)
- "Add Loop" button appends the new loop; user can add multiple loops before applying
- Shows a preview list of loops being created
- "Apply" button calls `onApply` with the new loops array, same as AI modal does
- Glassmorphic styling consistent with AI modal

**2. Update `src/components/habitloop/HabitLoopView.tsx`**
- Add a "➕ Create Manually" button next to the "🧠 AI Generate" button
- New state `showManual` to toggle the manual modal
- When loops already exist, the manual creation should append new loops rather than replace (add an `addLoops` callback)

**3. Update `src/hooks/useHabitLoopState.ts`**
- Add an `addLoops` function that appends new loops to existing ones (vs `setLoops` which replaces all)

This gives users full control to hand-craft their habit loops without AI.

