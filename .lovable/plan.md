

## Plan: Propagate Custom Pillar Icons Everywhere

### Problem
`PillarIcon` is only used in `CategoryGrid` and `CategoriesTab`. All other components (archive, library, tracker, missions, settings/projects, onboarding) still render raw `{p.icon}` emoji text, ignoring any uploaded PNG icons.

The root cause is two-fold:
1. **`PILLARS` in `archive-data.ts`** maps from `CATEGORIES` but doesn't include `iconUrl` — and it's a static constant, not reactive to user customizations
2. **Most components import `CATEGORIES` or `PILLARS` directly** instead of using `getCategories()` from `useUserSettings`, so they never see custom icons

### Approach

**Step 1: Make `PILLARS` include `iconUrl`** in `archive-data.ts` — add `iconUrl` to the mapping. This fixes the type but not the reactivity problem.

**Step 2: Replace raw emoji rendering with `PillarIcon`** in all affected components. For inline text contexts like `{p.icon} {p.name}`, render `<PillarIcon icon={p.icon} iconUrl={p.iconUrl} size={14} />` inline next to the name. For standalone icon spots, use appropriate sizes.

**Step 3: Thread `getCategories()` data into components that currently use static `CATEGORIES`/`PILLARS`**. The key components that need custom category data passed in or fetched:

**Files to update:**

| File | What renders `icon` | Fix |
|------|-------------------|-----|
| `src/lib/archive-data.ts` | `PILLARS` mapping | Add `iconUrl: c.iconUrl` |
| `src/components/archive/ArchiveBlockCard.tsx` | `{p!.icon} {p!.name}` in pillar tags | Use `PillarIcon` inline |
| `src/components/archive/ArchiveLibrary.tsx` | `{p.icon} {p.name}` in filter buttons | Use `PillarIcon` inline |
| `src/components/archive/ArchiveImagesView.tsx` | `{p.icon} {p.name}` in filters + `{p!.icon}` in tags | Use `PillarIcon` inline |
| `src/components/archive/ArchiveEditModal.tsx` | `{p.icon} {p.name}` in pillar toggles | Use `PillarIcon` inline |
| `src/components/archive/LinkContextMenu.tsx` | `{p.icon} {p.name}` in pillar toggles | Use `PillarIcon` inline |
| `src/components/archive/ArchiveSearchResults.tsx` | pillar tags via `pillarColors` | Use `PillarIcon` inline |
| `src/components/library/BookCard.tsx` | `{p.icon}` standalone icons | Use `PillarIcon` |
| `src/components/library/BookDetailModal.tsx` | `{p.icon} {p.name}` in toggles | Use `PillarIcon` inline |
| `src/components/library/AddBookModal.tsx` | `{p.icon} {p.name}` in toggles | Use `PillarIcon` inline |
| `src/components/dashboard/MissionView.tsx` | `displayIcon` from `category?.icon` | Use `PillarIcon`, include `iconUrl` |
| `src/components/settings/ProjectsTab.tsx` | `{cat.icon} {cat.name}` in parent selectors | Use `PillarIcon` inline |
| `src/components/shared/CategoryProjectSelector.tsx` | `{c.icon}` in dropdown + display label | Use `PillarIcon` inline |
| `src/components/TrackerActivityPulse.tsx` | derives local `CATEGORIES` with `icon` from metrics | Include `iconUrl` from metrics data |

**Step 4: Make archive/library components use customized pillar data**. These components currently import the static `PILLARS`. The cleanest fix: since `PILLARS` is derived from `CATEGORIES` and `CATEGORIES` is a static default, we need to either:
- Pass customized pillars as props from parent components that have access to `useUserSettings`
- Or create a lightweight context/hook that provides customized pillars

The simplest approach: the parent components (`ArchiveView`, `LibraryView`, `DashboardView`) already have access to `useUserSettings().getCategories()`. We'll pass customized categories down as props where needed, or have the child components call `useUserSettings().getCategories()` directly (it's already a hook used across the app).

For archive components that use `PILLARS`, we'll replace `PILLARS` usage with a call to `useUserSettings().getCategories()` and map to the pillar shape locally.

### Summary
~14 files changed. Each change is small — import `PillarIcon`, replace `{p.icon}` with `<PillarIcon icon={p.icon} iconUrl={p.iconUrl} size={N} className="inline-block" />`, and ensure the data source includes `iconUrl`.

