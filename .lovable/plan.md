

## Export Archive to Local File

### What
Add an "Export Archive" button that appears when the user scrolls to the bottom of the Library view. Clicking it downloads all archive blocks as a JSON file (human-readable, with timestamps) to the user's device.

### How

**1. Scroll-to-bottom detection in `ArchiveLibrary.tsx`**
- Wrap the block list in a ref'd container
- Use an `IntersectionObserver` on a sentinel div at the very bottom of the list
- When the sentinel is visible, show the export button with a fade-in animation

**2. Export button & logic**
- Button styled consistently with the app (glass-card style, with a 💾 icon)
- On click: serialize `blocks` array to pretty-printed JSON, create a `Blob`, trigger a download via a temporary `<a>` element
- Filename: `archive-export-YYYY-MM-DD.json`
- Toast confirmation on success

**3. Files to change**
| File | Change |
|------|--------|
| `src/components/archive/ArchiveLibrary.tsx` | Add scroll sentinel, IntersectionObserver, export button, and download logic |

