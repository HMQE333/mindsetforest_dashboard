

## Persistent Node Positions with Auto-Organize Button

### Problem
Currently, all tree-connected nodes get their positions recalculated by `layoutTree` every time the task list changes. This means adding a child, toggling done, or changing parent relationships causes the entire tree to snap back to its algorithmically computed layout. Only standalone nodes persist their positions.

### Solution
Store `position_x` / `position_y` for **all** nodes (not just standalone ones), and use those saved positions whenever available. The auto-layout algorithm becomes opt-in via an "Auto-Organize" button in the toolbar.

### Changes

**1. Extend `onNodeDragStop` to save positions for ALL nodes** (`PlanningMap.tsx`)
- Remove the `if (task?.standalone)` guard — persist position for every dragged node (including project root nodes, which we can store via a separate mechanism or skip).

**2. Update `layoutTree` to respect saved positions** (`PlanningMap.tsx`)
- When building tree nodes, check if a task has `position_x` and `position_y` set. If so, use those instead of the computed layout position.
- Project root nodes will still use computed positions (or we can persist those too via localStorage keyed by project ID).

**3. Save positions on drag for tree nodes too** (`PlanningMap.tsx`)
- On `onNodeDragStop`, update `position_x` / `position_y` in the DB for any task node that gets dragged.

**4. Add "Auto-Organize" button to toolbar** (`PlanningMap.tsx`)
- A small button (e.g., grid/layout icon) in the top bar next to the legend.
- Clicking it clears all `position_x` / `position_y` for the currently visible tasks (sets them to `null` in DB), then triggers a re-layout using the algorithm.
- This gives users a way to "reset to clean layout" when things get messy.

**5. Structural change handling** (`PlanningMap.tsx`)
- When new nodes are added (structure changes), only the **new** node gets an auto-computed position; existing nodes keep their saved positions.
- The current `structureKey` diffing logic gets updated: on structure change, merge new layout positions only for nodes that don't have saved positions.

### UX Summary
- Drag any node → it stays where you put it, even after edits or navigation
- Click "Auto-Organize" → everything snaps back to the clean tree layout
- New nodes appear at computed positions until you drag them somewhere

