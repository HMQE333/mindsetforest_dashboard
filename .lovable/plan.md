

## Plan: Add Mobile FAB + Right-Click Context Menu on Map

Two changes to `src/components/planning/PlanningMap.tsx`:

### 1. Right-click context menu on map canvas
- Add `onPaneContextMenu` handler to ReactFlow that captures the click position and shows the `AddChildPopover` at that screen coordinate
- The popover adds a root-level node (no parent) at the clicked position
- State: `contextMenu: { x: number; y: number } | null`

### 2. Floating "+" button on mobile
- Add a fixed FAB (bottom-right corner) visible only on mobile (`sm:hidden`)
- Tapping it opens the same `AddChildPopover` anchored near the button to add a root-level node
- State: `showMobileFab: boolean`

### Technical details

**File: `src/components/planning/PlanningMap.tsx`**

- Import `useIsMobile` from `@/hooks/use-mobile`
- Add `contextMenuPos` state in `MapViewInner`
- Add `onPaneContextMenu` callback: `(e) => { e.preventDefault(); setContextMenuPos({ x: e.clientX, y: e.clientY }); }`
- Pass `onPaneContextMenu` to `<ReactFlow>`
- Render a portal/fixed-position `AddChildPopover` at `contextMenuPos` when set, with `parentLevel={null}` so it adds root goals
- Add a `showMobileFab` state, render a `Plus` FAB button (`fixed bottom-6 right-6 sm:hidden`) that toggles the popover
- Click anywhere on canvas (`onPaneClick`) dismisses both the context menu and mobile FAB popover

