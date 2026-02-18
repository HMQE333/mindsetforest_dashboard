

## Fix: Bars Not Rendering in 12-Month Overview

### Problem
The bar chart shows only numbers and month labels but no visible bars. This is a CSS issue: the bars use `height: ${heightPct}%` but their parent container uses `flex-1` (no explicit height), so the percentage resolves to nothing.

### Solution
Restructure the bar chart so each column uses a fixed-height bar area with absolute positioning for the bar itself. This guarantees the percentage height works correctly.

### Changes (1 file)

**`src/components/TrackerDetailedStats.tsx`** -- lines 137-167 (the bar chart section)

Replace the current flex-based bar layout with:
- A wrapper div with explicit `h-32` for the bar growth area
- Each bar uses `absolute bottom-0` positioning inside a `relative h-full` container
- The bar height as a percentage of the explicitly-sized parent will now render correctly
- Keep the same `#5AC7D7` gradient, glow, hover effect, value labels, and month labels

The key structural change per column:
```
<div class="flex-1 flex flex-col items-center gap-1">
  <div class="text-[10px] ...">33</div>          <!-- value -->
  <div class="relative w-full h-full">            <!-- fixed-height context -->
    <div class="absolute bottom-0 w-full ..."     <!-- bar grows upward -->
         style="height: 75%;" />
  </div>
  <span class="text-[9px] ...">Mar</span>         <!-- month -->
</div>
```

The outer container changes from `h-44` to a structure where the bar area explicitly gets height, ensuring CSS percentage heights resolve correctly.
