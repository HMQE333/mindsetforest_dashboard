---
name: Cross-hook data sync via window CustomEvent
description: Pattern for making page-scoped Supabase data hooks refetch when another part of the app (e.g. the AI assistant) writes to the same table directly.
---

Several data hooks in this app (`usePlanningState`, likely others for
health/finance/tracker tables) are page-scoped: each mounted instance keeps
its own local `tasks`/`entries` state and only fetches on mount. When code
outside that hook instance (e.g. `useAssistant`'s `applyActions`, which
inserts into Supabase tables directly to ride the existing edge function
without a redeploy) writes a new row, the hook instance has no idea and the
UI looks stale until reload.

**Pattern:** export a `window` `CustomEvent` name constant from the hook
module (e.g. `PLANNING_TASKS_CHANGED_EVENT`), add an effect in the hook that
listens for it and calls its own refetch function, and have any out-of-band
writer dispatch that event after a successful write.

**Why:** simplest fix with the smallest blast radius — no shared
context/provider refactor, and no Supabase realtime channel (which has its
own subscribe/reuse pitfalls in this app, see `react-version-pin.md`).
Mirrors how dashboard missions already update instantly (shared provider)
but keeps page-scoped hooks page-scoped.

**How to apply:** if the assistant (or any other out-of-band writer) gains
actions that write to another page-scoped-hook-backed table (health,
finance, tracker entries, etc.), give that hook the same
`<TABLE>_CHANGED_EVENT` + listener + dispatch treatment rather than reaching
for realtime subscriptions or a shared context by default.
