
## Plan: "Copy Shopping Prompt" button in AI Processor

### What the user wants
A small, easy-to-find button that builds a ready-made prompt the user can copy and paste directly into ChatGPT, Gemini, or any external AI to get an ordered shopping list with the right ingredient amounts from the current recipe (either raw pasted text or the processed result).

### Where it lives
- A small secondary button in the **left panel** (below the recipe textarea, near the char count) — visible as soon as a recipe is pasted
- If a processed result exists, also offer it in the **result panel** alongside Copy/Save buttons, so the user can generate a shopping prompt from the clean version

### What the prompt generates
A pre-built, copy-ready prompt string:

```
Here is a recipe. Please generate a clean, ordered shopping list with all ingredients grouped by category (produce, dairy, meat, dry goods, etc.) and exact amounts in grams. Do not include instructions — only the shopping list.

---
[recipe text or processed result here]
---
```

### Implementation — only `AIRecipeProcessor.tsx`

**State**: one `copiedShoppingPrompt` boolean for the feedback tick animation (reuses same pattern as `copied` state).

**Helper function** `buildShoppingPrompt(text: string): string`:
```ts
const buildShoppingPrompt = (text: string) =>
  `Here is a recipe. Please generate a clean, ordered shopping list with all ingredients grouped by category (produce, dairy, meat, dry goods, etc.) and exact amounts in grams. Do not include any instructions — only the shopping list.\n\n---\n${text.trim()}\n---`;
```

**Two placements**:
1. **Left panel** — below the char count line, shown when `recipe.trim()` exists. Small muted button: `🛒 Copy shopping prompt`. Uses `recipe` as the source text.
2. **Result panel** — in the action buttons row (next to Copy / Save to Recipe). Small button: `🛒 Shopping prompt`. Uses `result` as the source text (the clean processed version is more accurate for amounts).

**Copy feedback**: same pattern as existing `copied` state — shows a check icon + "Copied!" for 2 seconds then resets.

### Files to change
- `src/components/cooking/AIRecipeProcessor.tsx` only — no edge function changes, no DB changes, no new files. Pure UI addition.
