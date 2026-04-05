

## Problem

The desktop tab bar shows all enabled modules inline. With 10+ modules, it overflows and becomes unwieldy. The user wants a maximum of ~8-9 visible tabs, with the rest accessible via an expandable overflow menu.

## Solution: Overflow "More" Button with Grid Popup

Show the first N tabs (e.g. 8) directly in the bar. If there are more, render a **"⋯" (more) button** at the end that opens an animated popover grid showing ALL modules — like a quick app-launcher screen.

### Desktop Tab Bar Behavior
- Show the first 8 visible tabs inline as today
- If `visibleTabs.length > 8`, show a "⋯" pill button at the end
- Clicking "⋯" opens a popover/overlay grid (3-4 columns) with all modules as icon+label cards
- The active tab is highlighted in the grid
- Clicking a module switches to it and closes the grid
- If the active tab is in the overflow, the "⋯" button gets a subtle highlight to indicate "you're in an overflow tab"

### Grid Popup Design
- Glassmorphism card matching existing `glass-card` / `bg-card/90 backdrop-blur-xl` style
- Each module rendered as a square-ish tile: emoji icon on top, label below
- Active module gets `gradient-purple` highlight
- Animated entrance with framer-motion (scale + fade)

### Technical Changes

**`src/pages/Index.tsx`**
1. Add state: `const [moreOpen, setMoreOpen] = useState(false)`
2. Split `visibleTabs` into `inlineTabs = visibleTabs.slice(0, 8)` and `hasOverflow = visibleTabs.length > 8`
3. In the desktop branch, render `inlineTabs` then conditionally render a "⋯" button
4. The "⋯" button toggles a positioned popover with a grid of ALL `visibleTabs`
5. Active-in-overflow detection: highlight the "⋯" button when `activeTab` is not in `inlineTabs`
6. Mobile dropdown already shows all tabs — no changes needed there

