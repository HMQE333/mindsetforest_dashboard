

## Standalone Nodes in Planning Map

### Problem
Every node created on the canvas (via right-click or long-press) is automatically connected to the project root because `parent_id: null` tasks are treated as root children in the tree layout. The user wants freely-placed "standalone" nodes that float independently unless manually connected.

### Approach
Use a **client-side-only** approach — no DB migration needed. We'll treat context-menu-created nodes differently from `+` button nodes by giving them a special marker, and use ReactFlow's built-in `onConnect` to let users drag edges between any nodes.

### Changes

**1. Add `standalone` flag to PlanningTask interface** (`usePlanningState.ts`)
- Add optional `standalone: boolean` field. Store it in the existing `notes` field as a JSON flag (or add a DB column). Since we want to avoid fighting the DB, we'll add an actual `standalone` boolean column via migration — it's cleaner.

**2. DB Migration**
- Add `standalone boolean default false` column to `planning_tasks`.

**3. Update `layoutTree` in `PlanningMap.tsx`**
- Filter out standalone tasks from the tree layout (skip them from `rootTasks`).
- After tree layout, position standalone tasks at their stored coordinates (we'll store `position_x` and `position_y` in the DB too, so standalone nodes remember where the user dragged them).

**4. DB Migration (combined with step 2)**
- Add `position_x float`, `position_y float` columns to `planning_tasks` (nullable, only used by standalone nodes).

**5. Context menu creates standalone nodes** (`PlanningMap.tsx`)
- When adding via right-click/long-press on canvas, set `standalone: true` and store the click position as `position_x`/`position_y`.
- When adding via the `+` button on an existing node, keep current behavior (`standalone: false`, `parent_id` set).

**6. Enable manual edge connections** (`PlanningMap.tsx`)
- Add `onConnect` handler to ReactFlow that updates the dragged-to node's `parent_id` to the source node's task ID, effectively "adopting" it into the tree. Set `standalone: false` on the target.
- This converts a standalone node into a connected child naturally.

**7. Allow node dragging for standalone nodes** (`PlanningMap.tsx`)
- On `onNodeDragStop`, if the node is standalone, persist its new position to the DB (`position_x`, `position_y`).
- Tree-connected nodes remain auto-positioned by the layout algorithm.

**8. Visual distinction**
- Standalone nodes get a subtle dashed border to indicate they're unconnected.
- A small "unlinked" icon badge on standalone nodes.

### UX Summary
- **Right-click / long-press canvas** → creates a standalone floating node at that position
- **Click `+` on existing node** → creates a connected child (unchanged)
- **Drag from a node's handle to a standalone node** → connects them (standalone becomes a child)
- Standalone nodes are freely draggable and remember their position

