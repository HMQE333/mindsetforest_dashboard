
# Links Tab: Multiple View Modes

## Overview
Add a view mode toggle to the Links tab so users can switch between four distinct visual layouts for fast navigation. A small toggle group sits to the right of the type filter chips.

## View Modes

### 1. List View (current default)
- Compact rows with favicon, hostname, URL, type badge, and source block name
- YouTube/image previews inline above the row
- Best for scanning many links quickly

### 2. Grid View
- Responsive card grid: 2 columns mobile, 3 medium, 4 large
- Each card has a large thumbnail area:
  - Videos: YouTube thumbnail (aspect-video)
  - Images: image preview
  - Links: large favicon centered on a subtle gradient background with hostname text
- Below the thumbnail: hostname, type badge, source block name
- Best for visual browsing, especially videos and images

### 3. Compact View
- Dense single-line rows (no thumbnails at all)
- Each row: favicon (16px) + hostname + truncated URL + type badge -- all on one line
- Minimal padding, smaller text
- Best for power users with lots of links who want maximum density

### 4. Group by Domain View
- Links grouped under collapsible domain headers (e.g., "youtube.com (5)", "notion.site (3)")
- Each domain header shows favicon + hostname + count
- Expanded sections show compact link rows underneath
- Best for seeing which domains appear most and navigating by source

## Technical Details

### File to Modify

| File | Change |
|------|--------|
| `src/components/archive/ArchiveLinksView.tsx` | Add `viewMode` state, toggle buttons, and conditional rendering for all four layouts |

### Implementation Details

**State**: `useState<"list" | "grid" | "compact" | "domain">("list")`

**Toggle UI**: Four small icon buttons using Lucide icons placed with `ml-auto` to the right of the filter chips row:
- `LayoutList` -- List view
- `LayoutGrid` -- Grid view  
- `AlignJustify` -- Compact view
- `FolderOpen` -- Group by domain

Active button uses `gradient-purple` + `glow-sm`, inactive uses `bg-muted/40`.

**Grid layout**: `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3` with `glass-card` cards. Thumbnail area uses `aspect-video` for videos, `aspect-square` for images/links. For plain links without visual preview, show a large favicon (48px) centered on a muted background with the hostname underneath.

**Compact layout**: `space-y-1` with each row being a single `flex items-center gap-2 px-3 py-1.5 glass-card` -- favicon, hostname (bold, fixed width), truncated URL (flex-1), type badge, all in one horizontal line. Font size `text-xs`.

**Domain grouping**: 
- Compute `groupedByDomain` memo that buckets filtered links by hostname
- Sort groups by count (descending)
- Render each group as a collapsible section using a simple `useState` toggle (no external dependency needed)
- Group header: `glass-card` row with favicon + hostname + count badge + chevron icon
- Expanded content: compact link rows nested inside
