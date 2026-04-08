

## Multi-Select Projects on Map

### What changes
Replace the single project dropdown with a multi-select toggle (up to 5 projects). All selected projects render on the same ReactFlow canvas, each tree offset horizontally by ~300px+ gap.

### Technical approach

**1. Replace single select with multi-select chips** (`PlanningMap.tsx`)
- Replace `selectedProjectId` (string) with `selectedProjectIds` (string[], max 5)
- Replace the `<select>` dropdown with clickable project chips/badges that toggle selection
- Show a visual indicator (highlighted border/gradient) for selected projects
- Cap at 5 with a toast or disabled state when limit reached

**2. Fetch tasks for all selected projects** (`PlanningMap.tsx`)
- Change `usePlanningState(selectedProjectId)` → `usePlanningState()` (no filter, fetch all)
- Filter tasks client-side: `tasks.filter(t => selectedProjectIds.includes(t.project_id))`

**3. Layout multiple project trees side-by-side** (`PlanningMap.tsx`)
- Modify the `useMemo` that builds nodes/edges to loop over each selected project
- Call `layoutTree()` for each project, applying a cumulative X offset (tracking the max width of each tree + 300px gap)
- Merge all nodes and edges arrays together

**4. Update progress bar** (`PlanningMap.tsx`)
- Aggregate `totalTasks` and `doneTasks` across all selected projects' tasks

**5. Update callbacks** (`PlanningMap.tsx`)
- `handleAddChild` and `handleAddLink` need to know which project the node belongs to — derive from the parent task's `project_id` or from the project node ID clicked

### Files modified
- `src/components/planning/PlanningMap.tsx` — all changes in this single file

