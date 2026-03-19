
## What the user wants

They want the AI to produce a clean, minimal, zero-fluff recipe format when asked to simplify. The key principles:
- Only facts about the recipe (no storytelling, no tips, no "Porada:", no backstory)
- All quantities in grams
- When there are alternatives (e.g. "or chicken instead of turkey"), AI picks the best one — no choices left for the user
- Output format: title → Ingredients (one per line, name: Xg) → Instructions (numbered, one action per step, no elaboration)

## Two changes needed

### 1. `supabase/functions/ai-recipe-process/index.ts` — strengthen the system prompt

The current system prompt says "be precise" but doesn't enforce zero-fluff. Add a strict rule set that activates when simplification is requested:

- Strip all tips, alternatives, "Porada:", backstory, anecdotes, shopping advice, and opinionated commentary
- When multiple options are listed (e.g. "or chicken, or pork"), choose the most common/best one and use it — never list alternatives
- Enforce the exact output structure:
  ```
  RECIPE NAME

  Ingredients

  - Ingredient name: Xg
  - ...

  Instructions

  1. Step.
  2. Step.
  ```
- Steps must be actions only — no explanations of why, no "you can also", no "if you prefer"
- No blank lines between ingredient items, single blank line between sections

### 2. `src/components/cooking/AIRecipeProcessor.tsx` — replace the "Simplify steps" chip

The current chip prompt is too vague: "Rewrite the instructions in simpler, numbered steps. Be concise and clear."

Replace it with a dedicated **"Clean & Simplify"** chip (rename from "Simplify steps") with a very explicit prompt that enforces the exact structure shown in the user's example. The prompt will instruct the AI to:
- Convert all quantities to grams
- Strip all tips, alternatives, backstory, porada sections
- Pick one version when alternatives exist
- Output the strict two-section format (Ingredients / Instructions)

Also add a separate "Simplify steps only" chip that just simplifies the instructions without restructuring — keeping the two behaviours distinct.

## Files to change

1. **`supabase/functions/ai-recipe-process/index.ts`** — extend system prompt with a "SIMPLIFY mode" ruleset that kicks in whenever simplification is requested
2. **`src/components/cooking/AIRecipeProcessor.tsx`** — update `SUGGESTION_CHIPS`: rename "Simplify steps" → "Clean & Simplify" with a strong, format-enforcing prompt; keep a "Simplify steps" chip for light simplification only

## No DB changes, no new files
