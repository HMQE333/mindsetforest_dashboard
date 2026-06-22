## Archive: persistent sub-tabs + cached library

Two root causes behind the "feels like it's reloading" UX:

1. **Sub-tab switches unmount the previous view.** `ArchiveView` renders sub-views (Inbox / Library / Links / Images / Digest / Forest) inside `<AnimatePresence mode="wait">` with conditional mounting. Every switch destroys local state (search query, filters, scroll position, semantic results, *and text selection* — which is why copy/paste between tabs is broken) and plays a fresh fade-in that looks like a reload.
2. **Top-level tab leaves Archive → comes back = full refetch.** `useArchiveState` runs `fetchBlocks` on every mount and the hook is mounted inside `ArchiveView`, which unmounts when you leave the Archive top tab. On a flaky network this is what surfaces "Failed to load archive" and the offline-mode flash. Nothing is cached between visits.

### Fix 1 — Keep all Archive sub-views mounted (state preservation)

Refactor `src/components/archive/ArchiveView.tsx`:

- Replace the `AnimatePresence mode="wait"` + conditional render block with a single container where each sub-view is always mounted and visibility is toggled with CSS (`hidden` class), exactly like the Cooking Studio pattern already established in project memory.
- Drop the per-switch fade animation (or keep it cheap with `opacity` only on the active panel) so switching feels instant.
- Result: search text, filter chips, scroll position, smart-search results, and any active text selection survive sub-tab switches → copy in Library, paste in Inbox works.
- `clearSelection()` still fires on switch so the floating multi-select bar behaves the same.

### Fix 2 — Cache archive blocks across top-level tab switches

Refactor `src/hooks/useArchiveState.ts` to use the existing TanStack Query client (already provided in `App.tsx`) instead of plain `useState` + `useEffect`:

- `useQuery(["archive_blocks", user.id], fetchBlocks, { staleTime: 5 min, gcTime: 30 min, refetchOnWindowFocus: false, refetchOnMount: false })`. Leaving and re-entering the Archive tab paints instantly from cache; a background refetch only runs after `staleTime`.
- `addBlock`, `addBlocks`, `updateBlock`, `deleteBlock` become mutations that update the query cache via `queryClient.setQueryData` (optimistic) — same UX as today, no extra round-trip to re-list.
- Keep the existing `embedBlock` fire-and-forget calls untouched.
- On fetch error: keep the last good `data` visible and surface a small inline "Couldn't refresh — showing cached" hint instead of the current full "Failed to load archive" toast that wipes the view. Only show the hard error state when there's no cached data at all.
- Optional small win: seed the cache from `localStorage` on first load so even a cold reload paints instantly, then revalidate in the background. (Stored under `archive_blocks_cache_<user.id>`, capped to the last N blocks to avoid blowing local quota; skip if you'd rather keep it minimal — flag in plan, default ON.)

### Files touched

- `src/components/archive/ArchiveView.tsx` — switch sub-view renderer to always-mounted + CSS hidden.
- `src/hooks/useArchiveState.ts` — rewrite around `useQuery` + cache mutations + soft-fail on refetch.

### Out of scope (ask if you want them too)

- Same caching treatment for `useForestState`, `useDigestState`, etc. (Forest sub-tab inside Archive still has its own loader).
- Background revalidation indicator UI beyond the inline hint.
