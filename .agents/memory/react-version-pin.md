---
name: MindsetForest React 18 pin + Supabase realtime channel reuse
description: Why artifacts/app is pinned to React 18 and why realtime channels must clear stale same-topic channels.
---

# React 18 pin (MindsetForest / artifacts/app)

`artifacts/app` pins `react`, `react-dom`, `@types/react`, `@types/react-dom` to explicit
`^18` versions in its own package.json instead of the shared `catalog:` (which is React 19).

**Why:** The frontend was ported from a Lovable app written/tested against React 18.3.
Running it under the catalog's React 19 produced runtime "Invalid hook call ... more than one
copy of React" crashes in the authenticated dashboard (Index → DashboardView and friends). The
unauthenticated landing rendered fine, so the crash only showed up after login. Pinning to
React 18 (the version the code expects) resolved it. There is only ever one physical React copy;
the error was a React-19 incompatibility surfaced as the generic hook-call message.

**How to apply:** Keep react/react-dom on ^18 for this app. Do not "clean up" by switching to
`catalog:`. If a future dep requires React 19, that's a real migration, not a quick bump.

# Supabase realtime channel reuse crash

Hooks that open a realtime channel with a fixed name (`friends-${user.id}`, `forest-${user.id}`,
`forest-inbox-${user.id}`) must first remove any existing channel with the same topic before
subscribing:
`supabase.getChannels().filter(c => c.topic === 'realtime:' + topic).forEach(c => supabase.removeChannel(c))`.

**Why:** `supabase.removeChannel()` is async. On remount (navigation, HMR, an auth object
change) a new channel with the same name is created before the old one finishes tearing down;
Supabase returns the existing, already-subscribed channel, and chaining `.on("postgres_changes", ...)`
onto it throws `cannot add postgres_changes callbacks for realtime:<topic> after subscribe()`,
which crashes the dashboard via the ErrorBoundary.

**How to apply:** Any new fixed-name realtime subscription in this app should clear stale
same-topic channels first (or use a unique per-mount channel name).
