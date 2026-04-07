

## Fix: Stable Node Positioning After Attach/Detach

### Problem
When any new node is added or a standalone node gets connected, the entire tree re-layouts from scratch via `layoutTree()`. This causes all previously-connected nodes (including formerly-standalone ones) to jump to new positions because the leaf-count-based algorithm redistributes horizontal space every time.

### Root Cause
The `initialNodes` memo recalculates all positions on every `tasks` change. The sync `useEffect` detects a `taskHash` change and replaces all non-standalone node positions with freshly computed ones. There's no position stability — it's a full recompute every time.

### Solution: Two-part fix

**1. Animate node position changes (CSS transition)**
- Add `style: { transition: 'transform 0.3s ease' }` to all nodes produced by `layoutTree()`. ReactFlow uses CSS `transform` for positioning, so this makes any position shift smooth instead of instant. This alone eliminates the "teleport" feeling.

**2. Smarter sync merge — preserve positions for nodes whose parent didn't change**
- Track each node's `parent_id` in the previous render. When syncing, only reposition a node if its `parent_id` actually changed (meaning it was attached/detached) or if it's a brand new node. Nodes whose structure didn't change keep their current ReactFlow position, letting the animation handle gradual drift only when needed.
- Specifically in the `useEffect` sync block (lines 477-505):
  - Build a map of `taskId → parent_id` from the previous render
  - For each node in the new layout, if it existed before with the same `parent_id`, keep `existing.position`
  - If `parent_id` changed (attach/detach) or node is new, use the layout-computed position
  - Standalone nodes always keep their current dragged position (already handled)

**3. Stabilize layout after connect**
- When `handleConnect` fires, the target node's `standalone` flips to `false` and `parent_id` is set. The layout will compute a proper tree position for it. With the animation from step 1, this will glide smoothly into place instead of teleporting.

### Files to change
- `src/components/planning/PlanningMap.tsx`:
  - Add `style: { transition: 'transform 0.3s ease' }` to all nodes in `layoutTree()`
  - Refactor the sync `useEffect` to track previous `parent_id` per node and only reposition nodes whose parent changed
  - Remove the overly broad `taskHash` check; use a per-node structural diff instead

### Expected behavior
- Adding a new node: existing tree nodes stay put (or shift minimally with animation)
- Connecting a standalone node: it glides into its tree position; other nodes stay stable
- Disconnecting a node: it stays at its current position as a standalone; tree adjusts smoothly

