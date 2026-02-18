

## Final Touch: Better Desktop Layout Balance

### Problem
Each category has only 2 metric cards, but the grid is set to 3 columns on large screens (`lg:grid-cols-3`). This leaves the right third of the screen consistently empty, making the layout feel unbalanced.

### Solution
Switch the grid to a **2-column layout on desktop** so the cards fill the available width evenly. This means changing `lg:grid-cols-3` to `lg:grid-cols-2` in the category sections grid.

### Changes (1 file)

**`src/pages/Tracker.tsx`**

- Change the grid class on the metric cards container from:
  `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
  to:
  `grid grid-cols-1 sm:grid-cols-2`

This makes each card wider on desktop, filling the full container width with 2 evenly-sized cards per row -- no more empty right side.

