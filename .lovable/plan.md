
# Fix Cooking Tab: Reload Bug + UI Polish

## Root Cause of the Reload Bug

`CookingView.tsx` wraps the tab content in `<motion.div key={activeTab}>`. Because React uses `key` to decide whether to remount a component, switching tabs completely destroys `<AIRecipeProcessor>` — wiping the pasted recipe, prompt, and result every time. The fix is to keep all three tab panels mounted simultaneously and toggle visibility with CSS, OR remove the `key` and keep only one mounted but persistent. The cleanest approach is to render all panels at once and show/hide them with CSS `hidden`.

## Changes

### 1. `src/components/cooking/CookingView.tsx`
- Remove `key={activeTab}` from the wrapping `motion.div` so tabs don't remount on switch
- Render all three tab panels simultaneously, conditionally applying `hidden` class to inactive ones — this preserves state in all tabs across switches
- Remove the "Loading kitchen..." full-screen block that replaces the entire view (show a subtle inline skeleton in the stats strip instead so the tab layout renders immediately)
- Visually polish the header: increase spacing, add a subtle divider under the stats strip
- Tab buttons: show both icon + label always (remove `hidden sm:block` on label), improve active state styling

### 2. `src/components/cooking/AIRecipeProcessor.tsx`
- On desktop (≥ md breakpoint), split into a two-column layout: left column = recipe paste textarea (tall), right column = prompt + chips + result — so both inputs are visible at the same time without scrolling
- Make the recipe textarea taller (rows=10 on desktop) so large recipes don't require heavy scrolling
- Add a character count indicator on the recipe textarea
- Improve the result panel: add a subtle green border accent, make the pre text use a slightly larger font
- Add a "Clear" button next to the recipe label to reset the form

### 3. `src/components/cooking/RecipeJournal.tsx`
- Filter bar: make the status pills wrap better on mobile, reduce padding slightly
- Recipe cards: add a subtle left-side colored accent bar based on status color (tried=green, favourite=amber, etc.)

### 4. `src/components/cooking/MealPlanner.tsx`
- Add a "Jump to today" button next to the week nav arrows
- Slightly increase the min-height of day cells from 80px to 96px for better readability

## Files to Change
- `src/components/cooking/CookingView.tsx` — primary fix for reload bug + header polish
- `src/components/cooking/AIRecipeProcessor.tsx` — two-column layout, clear button, better result panel
- `src/components/cooking/RecipeJournal.tsx` — status accent bar on cards
- `src/components/cooking/MealPlanner.tsx` — today button, taller day cells
