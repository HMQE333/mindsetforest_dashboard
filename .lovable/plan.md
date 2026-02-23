

# Clickable Image Thumbnails + Images Tab

## Overview
Two changes: (1) Make image thumbnails in Library block cards clickable to open a full-size lightbox, and (2) add a new "Images" tab to the Archive sub-nav that shows all images in a gallery grid.

## Part 1: Clickable Thumbnails in Block Cards

### ArchiveBlockCard.tsx
- Wrap each thumbnail `<img>` in a clickable button/div that opens a lightbox overlay
- Add local state `lightboxUrl: string | null` to track which image is being viewed
- Render a fullscreen overlay (fixed, z-50, backdrop-blur, click-to-dismiss) showing the image at full size
- Also fix the block title: when the title is just `[image] <url>`, show "Image block" instead of the raw URL
- Stop `e.stopPropagation()` on thumbnail click so it doesn't trigger `onEdit`

### Lightbox behavior
- Click thumbnail -> opens overlay with full-size image
- Click backdrop or press Escape -> closes
- Simple dark backdrop with centered image, max-w/max-h constrained

## Part 2: New "Images" Tab

### ArchiveView.tsx
- Add `"images"` to the `SubView` type union
- Add `{ id: "images", label: "Images", icon: "🖼️" }` to NAV_ITEMS (between Links and Map)
- Render new `ArchiveImagesView` component when `subView === "images"`
- Pass `blocks`, `loading`, `updateBlock`, `deleteBlock`

### New file: `src/components/archive/ArchiveImagesView.tsx`
- Scans all blocks for image URLs (same regex pattern as ArchiveBlockCard)
- Displays a responsive masonry-style grid of all images
- Each image card shows:
  - The image (clickable, opens lightbox)
  - Block title below
  - Date
  - Pillar tags
- Search/filter bar for filtering by pillar
- Clicking the block title opens `ArchiveEditModal` for that block
- Count display: "X images"

## Technical Details

### Files to modify
| File | Change |
|------|--------|
| `src/components/archive/ArchiveBlockCard.tsx` | Add clickable thumbnails with lightbox overlay; fix raw URL in title |
| `src/components/archive/ArchiveView.tsx` | Add "Images" to sub-nav, render ArchiveImagesView |

### Files to create
| File | Purpose |
|------|---------|
| `src/components/archive/ArchiveImagesView.tsx` | Gallery grid view for all images across blocks |

### Image extraction logic (shared pattern)
```text
1. Match [image] <url> tags
2. Match bare image URLs (.png, .jpg, .webp, etc.)
3. Deduplicate
4. Return array of { url, blockId, blockTitle, pillars }
```

### Lightbox component (inline in each file)
- Fixed overlay, z-50, bg-black/80, backdrop-blur
- Centered img with max-w-[90vw] max-h-[90vh] object-contain
- Click backdrop to close, Escape key to close

