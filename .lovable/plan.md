

# Image Paste in Inbox + Right-Click Context Menu on Links

## Overview
Two enhancements: (1) Allow pasting images directly into the Inbox textarea area, and (2) add a right-click context menu on link items across all view modes with options to edit notes, add tags, and manage the parent block.

---

## 1. Image Paste in Inbox

### What it does
- Users can paste images (Ctrl+V / Cmd+V) or drag-and-drop images into the Inbox area
- Pasted images get uploaded to Lovable Cloud file storage
- The resulting public URL is inserted into the textarea as `[image] <url>`
- Images also show as small thumbnails in a preview strip below the textarea

### Implementation

**Storage setup:**
- Create a new storage bucket `archive-images` with public access for reading
- Add RLS policy so only authenticated users can upload

**Database migration:**
- None needed -- images are stored as URLs in the block `content` field, which already exists

**ArchiveInbox.tsx changes:**
- Add `onPaste` handler on the textarea that intercepts `clipboardData.files` for image types
- Add a hidden drop zone wrapper with `onDragOver` / `onDrop` handlers
- When an image is detected: upload to `archive-images` bucket, get public URL, insert `[image] <public_url>` at cursor position in the textarea
- Show a small thumbnail strip below textarea for any detected image URLs in the current text
- Add a visual indicator (dashed border highlight) when dragging files over the area
- Show upload progress with a small spinner/toast

---

## 2. Right-Click Context Menu on Links

### What it does
- Right-clicking any link item (in any view mode: list, grid, compact, domain) opens a context menu
- Menu options:
  - **Open Link** -- opens URL in new tab (default behavior)
  - **Copy URL** -- copies to clipboard
  - **Edit Block** -- opens the ArchiveEditModal for the parent block (edit title, content, pillars, directions, tags)
  - **Add Note** -- quick inline note that appends to the block's content
  - **Edit Tags** -- quick tag editor (pillar + direction + custom tags) without opening full modal
  - **Delete Link** -- removes just this URL from the block content (not the whole block)

### Implementation

**ArchiveLinksView.tsx changes:**

- Extend `ExtractedLink` interface to include full block reference (pillars, directions, tags) instead of just `blockTitle`/`blockId`
- Add `onContextMenu` handler to all link items (ListItem, GridCard, CompactRow, DomainGroupView rows)
- Prevent default browser context menu
- Render a custom positioned context menu using absolute positioning based on click coordinates
- Close menu on outside click or Escape key

**New props needed on ArchiveLinksView:**
- `updateBlock: (id: string, updates: Partial<ArchiveBlock>) => Promise<void>` -- passed from ArchiveView
- `deleteBlock: (id: string) => Promise<void>` -- passed from ArchiveView
- Full `blocks` array already available for looking up parent block data

**Context menu sub-features:**

1. **Copy URL**: `navigator.clipboard.writeText(url)` + toast
2. **Edit Block**: Open the existing `ArchiveEditModal` -- import and render it inside ArchiveLinksView, controlled by state
3. **Add Note**: Small inline input that appears in the context menu; on submit, appends text to block.content via `updateBlock`
4. **Edit Tags**: Inline pillar/direction/tag chips in a small popover; toggles update the block via `updateBlock`
5. **Delete Link**: Remove the specific URL string from `block.content`, call `updateBlock` with cleaned content

**ArchiveView.tsx changes:**
- Pass `updateBlock` and `deleteBlock` to `ArchiveLinksView`

---

## Technical Details

### Files to Create
| File | Purpose |
|------|---------|
| `src/components/archive/LinkContextMenu.tsx` | Reusable context menu component for link items |

### Files to Modify
| File | Change |
|------|--------|
| `src/components/archive/ArchiveInbox.tsx` | Add paste/drop image handlers, upload logic, thumbnail preview strip |
| `src/components/archive/ArchiveLinksView.tsx` | Add context menu trigger on all link renderers, import LinkContextMenu, accept updateBlock/deleteBlock props |
| `src/components/archive/ArchiveView.tsx` | Pass updateBlock + deleteBlock to ArchiveLinksView |

### Storage Bucket
- Bucket name: `archive-images`
- Public: yes (for reading)
- RLS: authenticated users can INSERT, owner can DELETE
- File path pattern: `{user_id}/{timestamp}-{filename}`

### Context Menu Structure
```text
+---------------------------+
| Open Link            ->   |
| Copy URL             📋   |
|---------------------------|
| Edit Block           ✏️   |
| Add Note             📝   |
| Edit Tags            🏷️   |
|---------------------------|
| Remove Link          🗑️   |
+---------------------------+
```

The menu renders as an absolutely-positioned div at the mouse coordinates, with a backdrop click listener to dismiss. Uses existing `glass-card` styling with `border-white/10`.
