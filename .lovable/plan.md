

## Plan: P0 + P1 Settings Audit Fixes

### Summary

Upgrade ThemeTab with collapsible sections, rich frame style previews, accent color preview strips, and live hero layout preview. Remove misleading drag grip from MetricsTab. Save the current ThemeTab as an archive file before editing.

### Changes

| File | What |
|------|------|
| `src/components/settings/ThemeTab.archive.tsx` | **New** — exact copy of current ThemeTab for safekeeping |
| `src/components/settings/ThemeTab.tsx` | Major rewrite (details below) |
| `src/components/settings/MetricsTab.tsx` | Remove `GripVertical` icon from metric cards |

### ThemeTab Rewrite Details

**1. Collapsible Sections (P1)**
- Wrap each settings group (Theme Mode, Accent Color, Card Frame, Hero Layout) in a `<Collapsible>` from radix. Each section has a header row with label + chevron that toggles open/closed.
- All sections default open. Reduces perceived complexity and lets users collapse what they don't need.

**2. Frame Style Visual Previews (P0)**
- Replace the current cramped 5-col icon grid with a 2-col grid (matching theme mode selector style).
- Each frame button gets a `FrameStylePreview` mini-component: a small mock card (40px tall) that visually demonstrates the hover effect using CSS — e.g., Glow shows an accent-colored border glow, Neon shows a bright outline, Frost shows a white border + blur overlay, Sharp shows squared corners + hard shadow, Prism shows dual-color glow. These are static visual representations, not interactive hover demos.

**3. Accent Color Preview Strip (P1)**
- Below the accent swatch grid, add a small "preview strip" row: a mini button (filled with accent color) + a mini progress bar (partially filled with accent) + a small badge. This gives users immediate visual context for how their chosen accent applies to real UI elements — not just a colored dot.

**4. Live Hero Layout Preview (P0)**
- When user changes hero layout selection, the existing `HeroLayoutPreview` thumbnails are already present. Enhancement: add a larger "live preview" panel below the hero layout grid that shows a bigger, more detailed mockup of the selected layout — approximately 120px tall, showing streak badge, XP bar shape, and stat card arrangement at a glance. This uses the same `HeroLayoutPreview` approach but scaled up with more detail.

**5. MetricsTab Drag Grip Removal (P1)**
- Remove the `GripVertical` import and the `<GripVertical>` icon element from each metric card row in MetricsTab.tsx (line 114). This icon currently misleads users into thinking drag-reorder is supported.

### UI Structure (ThemeTab after changes)

```text
┌──────────────────────────────┐
│ ▼ Theme Mode                 │  ← Collapsible header
│   [2-col grid of 8 themes]   │
│                              │
│ ▼ Accent Color               │
│   [4-col swatches]           │
│   [btn] [━━━━━] [badge]     │  ← preview strip
│                              │
│ ▼ Card Frame Style           │
│   [2-col grid with previews] │  ← upgraded from 5-col icons
│                              │
│ ▼ Dashboard Hero Layout      │
│   [2-col grid with thumbs]   │
│   ┌─── Live Preview ───────┐ │  ← larger preview of selected
│   │  (selected layout big)  │ │
│   └─────────────────────────┘ │
│                              │
│ [gradient bar]               │
│ [Save Theme]                 │
└──────────────────────────────┘
```

### No DB changes needed. No new dependencies — `Collapsible` already exists in the project.

