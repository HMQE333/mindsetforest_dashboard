

## Monthly Focus → Compact Notification Redesign

### Current Problem
The Monthly Focus banner takes up significant vertical space at the top of the dashboard — feels cluttered and intrusive.

### New Design
Replace the banner with a **floating 🎯 icon button** positioned in the top-left area of the dashboard. It works like a notification bell:

```text
┌─────────────────────────────────┐
│ 🎯 ←(icon, subtle pulse)       │
│   ┌──────────────────┐          │
│   │ Monthly Focus     │ ← popover appears on click
│   │ March 2026        │
│   │ • Focus item 1    │
│   │ • Focus item 2    │
│   │ [+ Add item]  [✏] │
│   └──────────────────┘          │
│                                 │
│  Dashboard Hero                 │
│  Category Grid                  │
└─────────────────────────────────┘
```

**Behavior:**
- **Icon**: Small 🎯 button with a subtle periodic pulse/glow animation (every ~8 seconds) as a gentle reminder
- **Badge**: Shows item count as a tiny dot/number badge when items exist
- **Click → Popover**: Opens a compact dropdown with the focus items list, edit mode, and add input — same CRUD logic, just in a popover
- **No banner, no dismiss** — it's always there as a small icon, never takes space

### Technical Plan

1. **Rewrite `MonthlyFocusBanner.tsx`** → rename conceptually to a compact widget
   - Replace the full-width banner with a `Popover` (from shadcn) triggered by a 🎯 button
   - Add a CSS `animate-pulse` variant that triggers every ~8s using a keyframe + interval toggle
   - Show a small badge dot when `items.length > 0`
   - Popover contains: month label, items list, edit/add controls (reuse existing logic)

2. **Update `DashboardView.tsx`**
   - Move `MonthlyFocusBanner` from above the hero to inside/beside the hero action buttons area, or as a fixed-position element in the top-left
   - Position it as part of the dashboard header row rather than a standalone block

3. **Add subtle reminder animation** in CSS
   - A gentle glow pulse on the 🎯 icon that fires periodically (not constantly) — e.g., 2s animation every 10s via a class toggle interval

No database changes needed — same data, just a different UI container.

