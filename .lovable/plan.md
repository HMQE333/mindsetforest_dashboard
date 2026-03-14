

## Fix: Snowfall invisible on light/Frost themes

**Problem**: Snowflakes use hardcoded near-white colors (`rgba(220, 235, 255, ...)`) — invisible against light backgrounds like Frost or Sandstone.

**Solution**: Detect the `light-theme` class on `document.documentElement` inside the snow animation and swap to blue-tinted flakes when active.

### Changes — `src/components/BackgroundPattern.tsx`

In the snow `useEffect`:

1. At the start of the animation setup, read `document.documentElement.classList.contains("light-theme")` and store it
2. Set up a `MutationObserver` on the root element's class list to reactively update when the theme changes mid-session
3. Swap flake colors based on the flag:
   - **Dark themes**: keep current `rgba(220, 235, 255, opacity)` (white-blue)
   - **Light themes**: use `rgba(100, 160, 220, opacity)` for flakes and `rgba(80, 140, 200, opacity * 0.08)` for glow — a visible soft blue
4. Clean up the observer in the effect teardown

This is a minimal, self-contained change — only the snow `useEffect` block is touched. No new props or CSS needed.

### Files
- `src/components/BackgroundPattern.tsx` — snow animation color logic (~10 lines changed)

