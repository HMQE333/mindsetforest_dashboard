

## Smart Project Placement on the Planning Map

**Problem:** When persisted task positions extend far left/right of the project root, the current shift logic drags the project root node to a weird position (or pushes the next project miles away). Toggling projects on/off can also feel unstable.

**Goal:** Each task keeps its dragged position. The project root sits naturally above its task cluster. When a new project is enabled, it's auto-placed in a free slot close to existing projects without disturbing them or overlapping.

### Approach

**1. Anchor the project root to its actual task cluster (not to `xOffset`)**

In `layoutTree`, when persisted positions exist, compute the project root's X as the centroid (or midpoint of min/max X) of its first-row children. This stops the project node from drifting away from its tasks when persisted positions skew the bounding box.

**2. Persist a per-project layout offset**

Store a `position_x` / `position_y` offset on the project itself (via a new `planning_project_layout` table keyed by `user_id` + `project_id`, or a JSONB column on `user_projects`). When a project is toggled on:
- If it has a saved offset → reuse it (project stays where the user last saw it).
- If not → compute its bounding-box width and place it in the first horizontal gap that doesn't overlap currently-shown projects.

**3. Smart placement algorithm (only for projects with no saved offset)**

```
For each currently-visible project, compute [minX, maxX] of its bounding box.
Sort these intervals by minX.
For the new project (width = W), walk left→right:
  - Try slot at far-left of viewport (if free)
  - Otherwise insert in first gap between two projects where (gap >= W + GAP)
  - Otherwise append after the rightmost project (xOffset + GAP)
Save the chosen offset to the new project's layout record.
```

This guarantees: existing projects don't move, new project lands close, no overlap.

**4. Stop the global shift logic that moves all of a project's nodes**

Remove the current `shift = xOffset - minX` block. Instead:
- Apply the saved per-project offset to all nodes belonging to that project (or 0 if positions are already absolute and saved).
- The "where do I start the next project" calculation uses the actual right edge after offset is applied.

**5. Auto-organize button stays as the escape hatch**

The existing 🔄 Auto-organize button already clears all positions and redoes the clean layout — keep it as-is for users who want a fresh start.

### Files to modify

1. **New migration** — add `layout_x` / `layout_y` (nullable floats) to `user_projects` table. Simple, no new table.
2. `src/hooks/useUserProjects.ts` — expose `updateProjectLayout(projectId, x, y)`.
3. `src/components/planning/PlanningMap.tsx`:
   - Anchor project root to its task cluster centroid when persisted positions exist (fix the "drives miles away" bug).
   - Replace the global-shift logic with per-project offset application.
   - Implement `findFreeSlot(existingBoxes, newWidth)` and call it when a project is toggled on without a saved offset.
   - Persist the chosen offset back to the project.
4. Save offset on project root drag too — let users move whole projects by dragging the project node (currently the project root has `draggable: true` by default but no drag handler).

### Out of Scope

- Auto-rearranging existing projects when a new one is added (would be intrusive).
- Vertical stacking of projects (horizontal placement is enough for now).
- Collision detection between individual tasks of different projects (only project bounding boxes).

