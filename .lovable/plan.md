

## Plan: Projects Folder Card in Dashboard

### Idea
Instead of showing each project as a separate card in the category grid, show a single **"Projects" folder card** that aggregates all user projects. Clicking it opens an intermediate view listing all projects, from which the user picks one to see its missions.

### Changes

**1. `CategoryGrid.tsx`** — Remove individual project cards. Add one "Projects" folder card at the end (only if user has projects). Show total project count. Style with a folder icon (📂) and a purple gradient.

**2. New: `ProjectsListView.tsx`** — A simple intermediate view (similar style to MissionView header + grid). Shows each project as a clickable card with emoji, name, and mission completion count. Has a "← Back" button to return to the category grid. Clicking a project card navigates to that project's MissionView.

**3. `DashboardView.tsx`** — Add a new state layer: when `selectedCategory === "__projects__"`, show `ProjectsListView` instead of `MissionView`. When a project is selected from that list, set `selectedCategory` to the `project-{uuid}` key to show `MissionView` as before. Back from ProjectsListView goes to grid; back from a project MissionView goes to ProjectsListView.

### File Summary

| File | Change |
|------|--------|
| `CategoryGrid.tsx` | Replace per-project cards with single "Projects" folder card |
| `src/components/dashboard/ProjectsListView.tsx` | **New** — intermediate list of all projects |
| `DashboardView.tsx` | Handle `__projects__` state for folder navigation |

No backend changes needed.

