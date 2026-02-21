
# Enhanced AI Ladder Suggestions -- User Controls

Currently the AI Ladder modal only has a mode selector (Focused/Strategic/Recovery) and a generate button. This plan adds a **customization panel** where you can define goals, constraints, time limits, and focus levels before generating -- giving you much more control over what the AI produces.

---

## What's Changing

### 1. New "Context & Controls" Section in `AILadderModal.tsx`

A collapsible section between the AI Mode selector and the Generate button with these fields:

- **Goal** (text input): Free-text field to describe your end goal, e.g. "Be able to trade options profitably" or "Run a half marathon". This gets injected into the AI prompt so suggestions align with your vision.
- **Constraints** (text input): Things to avoid or limitations, e.g. "No gym access", "Max 30 min per task", "Budget under $50". The AI will respect these when generating tasks.
- **Focus Levels** (multi-select checkboxes): Pick which ladder levels (0-5) to generate tasks for, instead of always getting all 6. Default: all selected.
- **Tasks Per Level** (small selector): Choose 1-4 tasks per level. Default: 3.
- **Time Horizon** (optional toggle): "This week" / "This month" / "Long-term" -- tells the AI whether to suggest quick wins or deeper investments.

All fields are optional -- if left blank, the AI generates with defaults as it does now.

### 2. Updated Edge Function `ai-ladder-suggest/index.ts`

Accept new optional fields in the request body: `goal`, `constraints`, `focusLevels`, `tasksPerLevel`, `timeHorizon`. Inject them into the system prompt:

- If `goal` is set: "The user's end goal is: [goal]. Align all tasks toward this goal."
- If `constraints` is set: "The user has these constraints: [constraints]. Respect them strictly."
- If `focusLevels` is set: only generate for those levels instead of all 6.
- If `tasksPerLevel` is set: use that count instead of "2-4".
- If `timeHorizon` is set: adjust task scope accordingly (e.g. "this week" = quick actionable items, "long-term" = deeper projects).

### 3. UI Layout

The modal structure becomes:

```text
+------------------------------------------+
| Header: AI Ladder Suggestions - [Category]|
+------------------------------------------+
| AI Mode: [Focused] [Strategic] [Recovery] |
+------------------------------------------+
| > Context & Controls (collapsible)        |
|   Goal: [___________________________]     |
|   Constraints: [_____________________]    |
|   Focus Levels: [x]0 [x]1 [x]2 ...       |
|   Tasks/Level: [3 v]                      |
|   Time Horizon: [This week v]             |
+------------------------------------------+
| [Generate Ladder Tasks] / Results         |
+------------------------------------------+
| Footer: [Regenerate] [Cancel] [Apply]     |
+------------------------------------------+
```

The "Context & Controls" section starts collapsed so the modal stays clean for quick use. A small arrow/chevron toggles it open.

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/ladder/AILadderModal.tsx` | Add state for goal, constraints, focusLevels, tasksPerLevel, timeHorizon. Add collapsible UI section with inputs. Pass new fields to edge function call. |
| `supabase/functions/ai-ladder-suggest/index.ts` | Accept new optional fields. Inject them into the system prompt conditionally. Use `focusLevels` to filter which levels to generate. Use `tasksPerLevel` for count. |

---

## Technical Details

**AILadderModal.tsx new state:**
```typescript
const [goal, setGoal] = useState("");
const [constraints, setConstraints] = useState("");
const [focusLevels, setFocusLevels] = useState<number[]>([0,1,2,3,4,5]);
const [tasksPerLevel, setTasksPerLevel] = useState(3);
const [timeHorizon, setTimeHorizon] = useState<"week"|"month"|"longterm">("week");
const [showControls, setShowControls] = useState(false);
```

These get passed in the `supabase.functions.invoke` body alongside the existing fields.

**Edge function prompt additions (conditional):**
- Goal: appended as "USER GOAL: ..." paragraph
- Constraints: appended as "USER CONSTRAINTS: ..." paragraph
- Focus levels: filters which level indices to include in the "generate for these levels" instruction
- Tasks per level: replaces the "2-4" in the prompt with the exact number
- Time horizon: adds a sentence like "Generate tasks suitable for completion within one week"
