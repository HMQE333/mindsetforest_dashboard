

## Plan: Theme Settings UX Polish (3 fixes)

### Problem 1: Frame Style Previews Inconsistent
The `FrameStylePreview` component renders inline-styled mini cards, but several frames (like Default, Aura) look nearly identical. The previews don't reflect the actual CSS hover effects users will see on real cards.

**Fix**: Rewrite `FrameStylePreview` to make all 11 frames visually distinct. Give each a more exaggerated/characteristic visual signature — Default gets a clear lift shadow, Aura gets a warm ambient glow distinct from Glow, Electric/Plasma get a subtle animated shimmer via CSS keyframes already in the project. Make the preview cards taller (44px) to give effects more room to breathe.

### Problem 2: Hero Live Preview Has No Sample Cards
The `HeroLivePreview` only shows XP bars, streak badges, and tiny stat blocks. It doesn't show how the selected **card style** or **frame style** will look on actual dashboard content cards.

**Fix**: Add 2-3 sample "category cards" below the hero preview area that reflect the current `cardStyle` and `frame` selections. These mini cards will use the same inline-style approach as `CardStylePreview` and `FrameStylePreview` but rendered as a row of small content cards (icon + title + progress bar), giving users a realistic sense of how their dashboard will look with the chosen combo. Place this as a new `DashboardLivePreview` component that appears once at the bottom of the Theme Mode section or as its own always-visible section at the top.

### Problem 3: Auto-Apply Confuses Users
Clicking any option calls `applyThemePreview()` which immediately changes the live CSS on the page. The `dirty` flag shows a "Save Theme" button, but users don't notice it and think their dashboard permanently changed.

**Fix**: Replace the "Save Theme" button with a persistent sticky banner at the bottom of the theme tab when `dirty === true`. The banner will say "Unsaved changes" with two buttons: "Save" and "Revert". Revert will call `applyThemePreview` with the original/saved values and reset all local state. The banner uses `position: sticky; bottom: 0` with a backdrop blur so it's always visible while scrolling.

### Files changed
- `src/components/settings/ThemeTab.tsx` — all three fixes live here

