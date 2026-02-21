

# Mobile Optimization: Tab Selector and Mastery Ladder

## Problem 1: Tab Selector Overflows on Mobile

The current tab bar is an `inline-flex` with 5 buttons that doesn't wrap or scroll, causing horizontal overflow on small screens.

### Solution
- Make the tab container horizontally scrollable on mobile with `overflow-x-auto` and hide the scrollbar
- Reduce padding and font size on small screens with responsive classes
- Add `whitespace-nowrap` so buttons stay on one line and scroll naturally

## Problem 2: Mastery Ladder Layout Breaks on Mobile

The ladder uses alternating left/right positioning (`flex-row` / `flex-row-reverse`) with a center vertical line, which looks cramped and broken on narrow screens.

### Solution
- On mobile (below `md` breakpoint), switch to a single-column stacked layout: remove the alternating row direction, hide the center line, and stack the node above the card
- The node (circle with emoji) becomes a small inline element above each card instead of floating beside it
- Cards go full-width instead of `max-w-[420px]`
- On desktop, keep the current alternating zigzag layout unchanged

---

## Files Changed

| File | Change |
|------|--------|
| `src/pages/Index.tsx` | Make tab bar scrollable on mobile, reduce button sizing on small screens |
| `src/components/ladder/LadderView.tsx` | Hide center line on mobile, adjust ladder gap |
| `src/components/ladder/LadderStep.tsx` | Stack node above card on mobile instead of side-by-side alternating layout, remove max-width constraint on mobile |
| `src/index.css` | Add scrollbar-hide utility if not present |

## Technical Details

**Tab bar (Index.tsx):**
- Container: add `overflow-x-auto scrollbar-hide max-w-full` and `flex-nowrap`
- Buttons: reduce to `px-3 py-2 text-xs md:px-5 md:py-2.5 md:text-sm` and add `whitespace-nowrap`

**LadderStep.tsx:**
- Change `flex items-start gap-6 relative z-[2] ${isOdd ? "flex-row" : "flex-row-reverse"}` to use responsive classes: on mobile always `flex-col items-center`, on `md+` use the existing alternating direction
- Card: remove `max-w-[420px]` on mobile, keep it on `md+`

**LadderView.tsx center line:**
- Add `hidden md:block` to hide the vertical gradient line on mobile since the stacked layout doesn't need it

