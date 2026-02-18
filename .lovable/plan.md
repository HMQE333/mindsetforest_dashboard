
## Smartwatch / Ultra-Small Screen Adaptive View

### Concept
When the screen is very small (under ~280px width -- typical smartwatch territory), the Tracker page automatically switches to a **circle-grid view** optimized for quick tapping. No calendar, no detailed stats, no activity pulse, no recent log -- just the essentials for logging stats fast.

### Layout: Watch Mode

```text
+---------------------+
|   🔥 3-day streak   |
+---------------------+
|                     |
|   📖    📄    💥   |
|                     |
|   ⏱️    📨    🛠️   |
|                     |
|   🎯    📈    🤝   |
|                     |
|   🔭              |
|                     |
+---------------------+
```

Each emoji sits inside a **circular button** (~56px). Tapping it opens a simplified input modal (compact version: just the preset buttons + confirm, no text input field -- or a minimal one).

### Detection Strategy
- A custom hook `useIsWatch()` that checks `window.innerWidth < 280` (covers Apple Watch at 198px, Wear OS at ~227px)
- Updates on resize via `matchMedia`, same pattern as existing `useIsMobile()`

### Changes

**1. New hook: `src/hooks/useIsWatch.ts`**
- Returns `true` when viewport width is under 280px
- Uses `matchMedia` listener for reactive updates

**2. New component: `src/components/TrackerWatchView.tsx`**
- Renders a compact circle-grid of all metric emojis
- Each circle button shows the emoji + today's value below it (tiny text)
- Tapping a circle calls `onAdd(metricId)` to open the input modal
- Top area: streak badge (smaller version)
- No header nav links (no room), no category grouping labels

**3. Modified: `src/pages/Tracker.tsx`**
- Import `useIsWatch` hook
- If `isWatch` is true, render `TrackerWatchView` instead of the full layout
- The input modal (`TrackerInputModal`) stays the same -- it already works as an overlay
- Skip rendering Calendar, DetailedStats, ActivityPulse, RecentLog, OverviewBar, and category sections

**4. Modified: `src/components/TrackerInputModal.tsx`**
- Add watch-mode adaptations: smaller padding, smaller emoji, compact preset buttons
- Detect small screen with the same hook or a CSS approach
- Keep the number input but make it smaller, or rely on presets only

### Technical Details

**useIsWatch hook:**
```typescript
const WATCH_BREAKPOINT = 280;
// Uses window.matchMedia(`(max-width: ${WATCH_BREAKPOINT - 1}px)`)
// Same pattern as existing useIsMobile
```

**TrackerWatchView structure:**
- Streak pill at top (compact: just "🔥 3" instead of "🔥 3 Day Streak")
- CSS grid: `grid-cols-3`, gap-2, centered
- Each cell: 56px circle with emoji (text-2xl), bg-secondary/50, border matching category color
- Below emoji: today's value in tiny mono font (e.g., "17")
- Tap triggers `onAdd(metricId)`

**TrackerInputModal watch adaptations:**
- Reduce padding from p-8 to p-4
- Emoji size from text-5xl to text-3xl
- Input field smaller (text-xl instead of text-3xl)
- Preset buttons in a tighter grid
- Max-width reduced to fit ~200px screens

### Files Summary
| File | Action |
|------|--------|
| `src/hooks/useIsWatch.ts` | Create |
| `src/components/TrackerWatchView.tsx` | Create |
| `src/pages/Tracker.tsx` | Modify -- conditionally render watch view |
| `src/components/TrackerInputModal.tsx` | Modify -- compact mode for small screens |
