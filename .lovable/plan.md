

## Analysis & Fix Plan: Pillars Propagation + Metrics Clear

### Findings

**1. Pillars bug found:** `ArchiveAIPreviewModal.tsx` imports the static `PILLARS` array from `@/lib/archive-data` instead of using the reactive `usePillars()` hook. This means when a user customizes pillar names/icons, the AI organize preview still shows the old default names and emojis. All other consumers (ArchiveLibrary, ArchiveEditModal, LinkContextMenu, LibraryView, BookCard, CourseCard, PlanningPortfolio, etc.) correctly use `usePillars()`.

**2. Metrics — no "clear all" option:** Users can delete metrics one-by-one via the trash icon, and "Reset to defaults" restores the built-in set. But there's no way to clear/empty all metrics at once if a user wants a blank slate.

### Changes

**`src/components/archive/ArchiveAIPreviewModal.tsx`**
- Replace `import { PILLARS, DIRECTIONS }` with `import { DIRECTIONS }` + `import { usePillars }` hook
- Use `usePillars()` inside the component to get the reactive pillar list
- Update the two `PILLARS.find()` calls to use the hook's array instead

**`src/components/settings/MetricsTab.tsx`**
- Add a "Clear All" button next to "Reset to defaults" that empties the metrics list entirely
- When clicked, set `metrics` to `[]` and mark dirty, so the user can save an empty state
- Add a confirmation step (simple state toggle) before clearing

**`src/hooks/useUserSettings.ts`**
- No changes needed — `saveMetrics([])` already works correctly (deletes all existing, inserts none)

