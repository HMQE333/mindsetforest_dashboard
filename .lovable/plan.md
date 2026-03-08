

# Archive Enhancement Plan

## 3 Features to Add

### 1. Global Quick-Capture Shortcut (`Ctrl+N` / `Cmd+N`)
A floating modal accessible from any tab (Home, Stats, Ladder, etc.) that lets you paste text and save it as an archive block instantly.

**Changes:**
- Create `src/components/archive/QuickCaptureModal.tsx` — a minimal modal with a textarea and Save button. On save, calls `addBlock` via a shared hook and closes.
- Create `src/hooks/useQuickCapture.ts` — manages open/close state and listens for `Ctrl+N` / `Cmd+N` globally.
- Mount the modal + hook in `src/pages/Index.tsx` (top-level) so it works from any tab.
- Add the keyboard shortcut to the shortcuts reference panel.

### 2. "Related Blocks" on Block Edit Modal (Minimalistic)
When editing a block, show a small collapsible "Related" section at the bottom of `ArchiveEditModal` — a subtle link that expands to show 3-5 semantically similar blocks. Does not clutter the default view.

**Changes:**
- In `src/components/archive/ArchiveEditModal.tsx`, add a collapsible "🔗 Related" toggle at the bottom.
- On expand, call `semanticSearch` with the block's title+content as the query.
- Display results as compact clickable cards (title + similarity %). Clicking opens that block for editing.
- Thread `semanticSearch` prop down from `ArchiveView` → `ArchiveLibrary` → `ArchiveEditModal`.

### 3. New "Digest" Tab with Spaced Repetition Flashcards
A new tab in the Archive sub-nav that surfaces old blocks as flashcards using a simple spaced repetition algorithm based on creation date.

**Spaced repetition logic** (client-side, no new DB tables needed initially):
- Intervals: blocks created 1 day ago, 3 days, 7 days, 14 days, 30 days, 60 days, 90 days ago (±1 day tolerance).
- Blocks matching any interval appear in the digest. Random order, shown one at a time as a flashcard.

**Changes:**
- Create `src/components/archive/ArchiveDigestView.tsx`:
  - Filters `blocks` by spaced repetition intervals.
  - Shows one block at a time as a "flashcard" card (title hidden initially, tap/click to reveal content).
  - Next/Previous navigation buttons + progress indicator ("3 of 12").
  - If no blocks match today, show "Nothing to review today — come back tomorrow."
- Add `"digest"` to the `SubView` type in `ArchiveView.tsx`.
- Add a new nav item: `{ id: "digest", label: "Digest", icon: "🔁" }` with count of due blocks.
- Render `ArchiveDigestView` in the content area.

### Summary of Files

| File | Action |
|------|--------|
| `src/components/archive/QuickCaptureModal.tsx` | Create |
| `src/hooks/useQuickCapture.ts` | Create |
| `src/pages/Index.tsx` | Edit — mount QuickCapture |
| `src/components/archive/ArchiveEditModal.tsx` | Edit — add Related section |
| `src/components/archive/ArchiveDigestView.tsx` | Create |
| `src/components/archive/ArchiveView.tsx` | Edit — add Digest tab + pass semanticSearch |

