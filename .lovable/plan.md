

## Archive AI Improvements Plan

### Problems Identified

1. **Multi-select AI prompt** — Only offers a free-text prompt. No quick-action buttons (expand, summarize, merge, etc.). No ability to apply per-block actions to multiple blocks at once. Result is always saved as a new block with no option to replace originals or append.

2. **Single-block AI buttons** (Expand, Shorten, Summary, Organize) — Work but have UX gaps:
   - No confirmation before overwriting content (Expand/Shorten/Summary all replace content in-place silently)
   - No preview of AI result before applying
   - No undo mechanism
   - "Organize" only suggests tags but doesn't show what it plans to change before applying

3. **Multi-select floating bar** — Only appears at 2+ selections, only has "AI Prompt" button. Missing bulk actions like bulk organize, bulk delete, merge into one block.

---

### Plan

#### 1. Enhance multi-select floating bar with quick actions
Add preset action buttons alongside the free-text prompt:
- **🔗 Merge** — Combine selected blocks into one (AI merges content, keeps all tags)
- **📝 Summarize All** — Create a summary block from all selected
- **🏷️ Organize All** — Batch auto-tag all selected blocks (runs organize on each)
- **🗑️ Delete Selected** — Bulk delete with confirmation

These call the existing `ai-archive-multi` edge function with preset prompts, or run `ai-archive-expand` (organize action) in a loop for batch tagging.

#### 2. Add preview step to single-block AI actions
Before overwriting, show a diff/preview modal:
- Display original vs AI-proposed content side by side
- Buttons: **Accept**, **Reject**, **Edit then Accept**
- Applies to Expand, Shorten, Summary actions
- Organize already shows tag changes — add a confirmation step showing old vs new tags

Implementation: New `ArchiveAIPreviewModal.tsx` component. `ArchiveBlockCard` stores the pending AI result in state, opens the preview modal instead of immediately calling `onUpdate`.

#### 3. Improve the multi-note AI prompt modal
- Add preset prompt chips at the top: "Find common themes", "Create action plan", "Merge into one", "Compare & contrast"
- Add option to **replace selected blocks** with the result (not just create new)
- Add option to **append result** to an existing block
- Show which blocks are included (titles list) with ability to remove from selection

#### 4. Align AI button purposes with app philosophy
Refine the edge function prompts to match the life-system context:
- **Expand**: "Deepen this insight — add actionable steps, connections to life pillars, and growth angles"
- **Shorten**: "Distill to core actionable wisdom. Remove fluff, keep what moves you forward"
- **Summary**: "Extract the key takeaway and one clear next action"
- **Organize**: Keep as-is (tag suggestion)

Update the system prompts in `ai-archive-expand/index.ts` accordingly.

---

### Files to change

| File | Change |
|------|--------|
| `src/components/archive/ArchiveView.tsx` | Add bulk action handlers, pass new props to floating bar |
| `src/components/archive/ArchiveBlockCard.tsx` | Preview flow instead of instant overwrite |
| `src/components/archive/ArchiveAIPreviewModal.tsx` | **New** — preview modal for AI results |
| `src/components/archive/ArchiveAIPromptModal.tsx` | Add preset chips, replace/append options, block list |
| `supabase/functions/ai-archive-expand/index.ts` | Update system prompts for app alignment |
| `supabase/functions/ai-archive-multi/index.ts` | Support preset action types alongside free prompt |

