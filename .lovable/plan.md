

# Archive Finishing Touches

After reviewing all 7 archive components, here are the polish items grouped by priority.

## 1. Empty States & Loading Consistency

**Problem**: Each sub-view has a slightly different loading/empty state style. Images view says just "Loading images..." in plain text, while Library uses an animated emoji. The Map tab is a bare placeholder.

**Fix**: Standardize all loading states to use the animated emoji pattern + consistent "No X yet" messaging. Remove the Map tab entirely (or keep it but hide it from nav until implemented).

## 2. Block Count per Tab

**Problem**: The top bar only shows a single "X blocks" count. Users can't tell at a glance how many links or images they have without clicking into each tab.

**Fix**: Show contextual counts in the sub-nav buttons themselves — e.g., "📚 Library (12)", "🔗 Links (8)", "🖼️ Images (5)". Computed from the blocks array.

## 3. Lightbox Polish

**Problem**: The lightbox in both ArchiveBlockCard and ArchiveImagesView is bare — no close button visible, no download option, no navigation between images.

**Fix**:
- Add an **X close button** in the top-right corner of the lightbox
- Add a **download button** (anchor with `download` attribute)
- In ArchiveImagesView, add **prev/next arrows** to navigate between images in the gallery without closing the lightbox

## 4. ArchiveEditModal — Content Preview for Images

**Problem**: When editing a block with images, the raw `[image] https://...` text is shown in a plain textarea with no preview.

**Fix**: Below the textarea, render image thumbnails extracted from the content (same regex logic), so users can see what images are in the block while editing.

## 5. Inbox — Better Feedback for Image Upload

**Problem**: The image thumbnail strip in Inbox doesn't have a way to remove an already-inserted image tag.

**Fix**: Add a small **X button** on each image thumbnail in the Inbox preview strip that removes the corresponding `[image] <url>` line from the text.

## 6. Library — Sort Options

**Problem**: Blocks are always shown newest-first with no way to change order.

**Fix**: Add a small sort toggle: **Newest** / **Oldest** / **A-Z** next to the search bar.

## 7. Confirm Before Delete

**Problem**: The delete button in ArchiveEditModal has no confirmation — one click and the block is gone.

**Fix**: Add a confirmation step — either a "Are you sure?" inline toggle or use the existing AlertDialog component.

---

## Technical Details

### Files to modify

| File | Changes |
|------|---------|
| `ArchiveView.tsx` | Add per-tab counts to nav buttons; optionally hide Map tab |
| `ArchiveBlockCard.tsx` | Add close/download buttons to lightbox overlay |
| `ArchiveImagesView.tsx` | Add close/download/prev-next to lightbox; standardize loading state |
| `ArchiveEditModal.tsx` | Add image preview strip below textarea; add delete confirmation |
| `ArchiveInbox.tsx` | Add remove button on image thumbnail strip |
| `ArchiveLibrary.tsx` | Add sort toggle (newest/oldest/A-Z) |

### No new files needed

All changes are incremental polish to existing components. No new dependencies required — `AlertDialog` and `lucide-react` icons (X, Download, ChevronLeft, ChevronRight) are already available.

