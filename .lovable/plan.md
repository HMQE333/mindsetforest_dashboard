
## Plan: Save AI Result to Recipe

### What this does
Adds a "Save to Recipe" button in the AI Processor result panel. When clicked, it shows a smart inline modal letting the user:
1. **Attach to existing recipe** — pick from their journal, with a warning if that recipe already has AI content (asks to overwrite)
2. **Create new journal entry** — opens a pre-filled RecipeFormModal with the AI result in the `aiProcessedContent` field and the pasted recipe text split into ingredients/instructions as best as possible

### How it works

**`AIRecipeProcessor.tsx`** needs access to the recipe list and `saveRecipe` function — currently it's a standalone component with no props. The `CookingView.tsx` already has `cooking` state so we'll pass `recipes` and `saveRecipe` down as props.

**Save modal** (inline, inside AIRecipeProcessor) — triggered when result exists:
- Two-option selector: "Attach to existing" or "Create new entry"
- **Attach to existing**: a searchable dropdown of recipe titles. On confirm — if the recipe already has `aiProcessedContent`, show a yellow warning: "This recipe already has AI content. Overwrite?" with Cancel / Overwrite buttons. On confirm, saves and toasts success.
- **Create new**: opens `RecipeFormModal` pre-filled with `title` extracted from the pasted recipe (first non-empty line), `aiProcessedContent` set to the result, and the raw recipe pasted into the ingredients field as a starting point.

### Files to change

**`src/components/cooking/CookingView.tsx`**
- Pass `recipes={cooking.recipes}` and `onSaveRecipe={cooking.saveRecipe}` props to `<AIRecipeProcessor />`

**`src/components/cooking/AIRecipeProcessor.tsx`**
- Accept `recipes` and `onSaveRecipe` props
- Add "Save to Recipe" button below the Copy button in the result panel
- Add inline `SaveToRecipeModal` component (no separate file needed, small enough) with:
  - Mode selector: "Attach to existing" / "Create new"
  - Existing recipe search/select + overwrite confirmation
  - New recipe pre-fill flow using `RecipeFormModal`

### No DB changes needed
`ai_processed_content` column already exists on `cooking_recipes`. Just writing to it via `onSaveRecipe`.

### User flow diagram
```text
[Result appears]
      ↓
[💾 Save to Recipe button]
      ↓
 ┌─────────────────────────┐
 │  Attach to existing     │
 │  ──────────────────     │
 │  [search recipes]       │
 │  ↓ select one           │
 │  → has AI content?      │
 │     YES → "Overwrite?"  │
 │     NO  → save directly │
 └─────────────────────────┘
 ┌─────────────────────────┐
 │  Create new entry       │
 │  ──────────────────     │
 │  Opens RecipeFormModal  │
 │  pre-filled with:       │
 │  - title (first line)   │
 │  - AI result in notes   │
 │  - raw text in ingred.  │
 └─────────────────────────┘
```
