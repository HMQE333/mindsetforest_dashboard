

## Rebuild: Smooth, Stable Node Positioning

### Problems Identified

1. **Position thrashing**: The `initialNodes` useMemo recomputes ALL positions every render. The sync useEffect tries to preserve positions but has conflicting logic — it keeps tree nodes frozen even when siblings change (so the tree never properly rebalances), yet standalone nodes get random positions on each memo recompute before the effect can rescue them.

2. **Standalone nodes re-randomize**: `layoutTree` generates `Math.random()` positions for standalone nodes whose `position_x`/`position_y` are null. Since `initialNodes` is a memo that runs on every `tasks` change, this produces new random coords each cycle, causing flicker until the effect patches them.

3. **Connect causes full rebuild**: `handleConnect` updates `standalone: false` + `parent_id`, which changes the task hash, triggers a full layout recompute, and all nodes shift because the leaf-count algorithm redistributes space.

### Solution: Decouple Layout from React State

**1. Move layout computation into the sync effect, not a memo**
- Remove the `initialNodes`/`initialEdges` useMemo entirely
- Compute layout inside the `useEffect` directly, so we have access to `currentNodes` at the same time
- This eliminates the "compute then patch" two-step that causes flicker

**2. Per-node structural fingerprint for selective repositioning**
- For each node, compute a fingerprint: `parentId + siblingCount + siblingIndex`
- Only reposition a node if its fingerprint changed (meaning its place in the tree actually shifted)
- New nodes get layout-computed positions; unchanged nodes keep their current ReactFlow position
- This means adding a distant cousin won't shift unrelated branches

**3. Standalone position stability**
- Never generate random positions — if `position_x`/`position_y` are null, place at a deterministic offset (e.g., `xOffset + index * 200, treeBottom + 100`)
- Always prefer the existing ReactFlow node position for standalone nodes (already dragged)
- On connect: the node gets a layout-computed position and smoothly transitions via CSS

**4. CSS transitions for all position changes**
- Keep `style: { transition: 'transform 0.3s ease' }` on all nodes
- This makes any remaining shifts (sibling rebalancing) feel smooth rather than jarring

**5. Debounce edge case: rapid task additions**
- Wrap the sync effect body in a `requestAnimationFrame` to batch rapid state changes into a single layout pass

### Files to Change

**`src/components/planning/PlanningMap.tsx`**:
- Remove `initialNodes`/`initialEdges` useMemo (lines 453-470)
- Rewrite sync useEffect (lines 477-514) to:
  - Compute layout inline
  - Build per-node structural fingerprint (`parentId:siblingIndex:siblingCount`)
  - Compare against previous fingerprints (stored in ref)
  - Only update position for nodes with changed fingerprints or new nodes
  - Standalone nodes always keep existing ReactFlow position
- Fix `layoutTree` standalone section: use deterministic positioning instead of `Math.random()`
- Ensure all nodes get `style: { transition: 'transform 0.3s ease' }`

### Expected Behavior
- Adding a node: only its direct siblings shift slightly (with animation); distant branches stay put
- Connecting a standalone: it glides to its tree position; other nodes stay stable
- Dragging a standalone: position persists across all re-renders
- Disconnecting: node stays at current position as standalone

