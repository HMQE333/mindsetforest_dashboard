

## Fix: Module Drag-and-Drop Reordering

### Root Causes

From the session replay, I can see drag events fire (opacity changes, scale flickers) but the reorder doesn't actually take effect. Three issues:

1. **Missing `onDrop` handler** — Without `onDrop` + `preventDefault()` on the drop target, the browser cancels the drop and `onDragEnd` fires with the drop considered "failed." The `dragOver.current` may get stale.

2. **Child element event bubbling** — `onDragEnter`/`onDragLeave` fire rapidly as the cursor moves between child elements (buttons, spans) inside each row, causing `dragOverIdx` to flicker and potentially corrupting `dragOver.current`.

3. **`window.location.reload()` after save** — This is jarring and unnecessary; state should update in-place.

### Fix Plan

**File: `src/components/settings/ModulesTab.tsx`**

- Add an `onDrop` handler on each draggable row that calls `e.preventDefault()` and executes the reorder logic
- Move the actual reorder into the `onDrop` handler (not `onDragEnd`), since `onDrop` only fires on successful drops
- Use `onDragEnd` only for cleanup (reset opacity, clear refs)
- Fix `onDragEnter` to check `e.currentTarget.contains(e.relatedTarget)` to ignore child-to-child transitions within the same row
- Remove `window.location.reload()` from `handleSave` — the state is already updated in memory

### Technical Details

```
onDrop → preventDefault + execute reorder (splice logic)
onDragEnd → cleanup only (opacity reset, clear refs)
onDragEnter → guard with relatedTarget check to prevent flicker
handleSave → remove window.location.reload()
```

Single file change, no backend modifications needed.

