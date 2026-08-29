# MindsetForest

A gamified life/productivity tracker ("Your Life. Your Quest.") ported from Lovable. Users sign in and track habits, stats, paths, oracle, archive, library, finance, a social "forest", and more — with several AI-assisted features.

## Run & Operate

- The web app runs via the `artifacts/app: web` workflow (`pnpm --filter @workspace/app run dev`).
- Frontend artifact: `artifacts/app/` (React + Vite, served at `/`).
- `pnpm --filter @workspace/app run typecheck` — typecheck the web app.

## Stack

- pnpm workspaces, Node.js 24, TypeScript
- Frontend: React 18 + Vite, React Router, TanStack Query, shadcn/ui, Tailwind v3, framer-motion
- Backend: **Supabase** (kept from the original Lovable app) — Postgres, Auth, Storage, Edge Functions, RPCs. Accessed directly from the client via `@supabase/supabase-js`.

## Where things live

- `artifacts/app/src/integrations/supabase/client.ts` — Supabase client (uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`).
- `artifacts/app/src/hooks/*` — data/state hooks, each backed by Supabase tables/RPCs/functions.
- `artifacts/app/src/pages/*` — routes: Index, Tracker, Auth, SharedLibrary, NotFound.
- `.migration-backup/supabase/` — original Supabase migrations + edge functions (reference only; not run here).

## AI features

- AI runs through Supabase **edge functions**, invoked from the client via `supabase.functions.invoke(...)`. Deployable source lives in `supabase/functions/` (see its `README.md`).
- **Archive vector embeddings** (semantic search + Forest search) use **OpenAI** `text-embedding-3-small` → `OPENAI_API_KEY`. Functions: `ai-embed-block`, `forest-publish-seed`.
- **Every other AI feature** (missions, paths, recipes, archive clean/expand/process/multi, assistant chat, book suggest, health extract, task split) uses **OpenRouter** → `OPENROUTER_API_KEY`, default model `google/gemini-2.5-flash` (override via `OPENROUTER_MODEL`). These previously used the Lovable AI gateway.
- Connect keys with `supabase secrets set ...` then `supabase functions deploy` — see `supabase/functions/README.md`. Real keys are never committed (`supabase/functions/.env` is git-ignored).

## Paths (replaces Mastery Ladder + Habit Loop)

- One module. A **path** is a named goal; a **step** is either done once or repeated on N separate days.
  The active step is just the first unfinished one — no level system, no "current loop" pointer.
- Reps are logged per local calendar date (`path_step_logs` has `UNIQUE (step_id, date)`), so a rep means a day.
- The active step of every live path is surfaced on Home above the category grid; completing it there awards
  XP through `completeExternal()` in `useDashboardState` (XP + streak + category engagement).
- Tables: `paths`, `path_steps`, `path_step_logs` — see `supabase/migrations/20260827120000_paths.sql`.
  That migration also drops `ladder_state` and `habit_loops`.

## The planning loop: COMMIT, SELECT, SCORE

Paths carries a written prior and grades it. The three pieces, and why each exists:

- **COMMIT** - `paths.diagnosis`. One line naming the binding constraint, written before
  the work. Optional and skippable: a prompt that blocks path creation would stop paths
  being created. The AI drafts it in `ai-path-suggest` so the user approves rather than
  composes.
- **SCORE** - `paths.diagnosis_verdict`. Asked once, when the last step finishes: was the
  named constraint the real one? Diagnosis hit-rate is the metric worth keeping; completion
  counts are noisy and confounded. Past misses are fed back into the planner brief.
- **SELECT** - `src/lib/path-router.ts`. When a step has not moved in 7 days the card asks
  once what is in the way. The routing is a **fixed table evaluated on the client, with no
  model call**, and only one of its six answers fetches information; the rest shrink the
  step, rewrite the diagnosis, or legitimise stopping. If the `inform` route turns out to
  dominate in practice, that is the evidence for building a retrieval layer - until then it
  would be a subsystem built on a guess. `path_steps.snoozed_until` is the only state it
  needs: every answer buys a few days of quiet, "wrong time" buys two weeks.

### Plan history

`path_revisions` stores the plan before every change, plus **why it changed**. The reason
column is the load-bearing one - a diff log is a transcript nobody re-reads, a reasoned
diff log is a reference class. Restoring is one click.

The rule that shapes reverting and re-planning, implemented once in `src/lib/path-writes.ts`
and used by both the Paths view and the assistant: **a revision changes the map, never the
record.** A step with logged days against it is never deleted, whatever the old or new plan
says - the XP and streaks hang off it.

`revise_path` is the assistant's only editing action (everything else appends). It matches
a path by name, replaces the whole step list, and snapshots first, so a rewrite argued out
in chat is one click to undo.

## AI planning context

- `supabase/functions/_shared/planner.ts` builds one context for every planning function
  (`ai-mission-suggest`, `ai-path-suggest`): the user's written `user_context.notes`, today's progress,
  14 days of completions, tasks they keep skipping, active paths, open planning nodes, today's calendar,
  latest watch numbers, and past accepted/rejected suggestions from `ai_suggestion_log`.
- Personal context lives on three shelves ordered by half-life: `user_context.notes`
  (constants, decades), `.lenses` (how the user thinks, years), `.season` (what is true now,
  weeks). Splitting them buys a conflict rule the prompt states explicitly: when the fast
  shelf contradicts a slow one, the fast shelf is right about this case and the slow one is
  right about the person. One box let a bad fortnight rewrite a permanent self-description.
- Edited in Settings → AI Context. Migrations: `20260827130000_user_context.sql`,
  `20260829120000_paths_engine.sql`.

## Architecture decisions

- **Supabase was intentionally kept** rather than migrated to Replit primitives. The app is large (240+ files, ~20 tables, 8 RPCs, 14 edge functions, 4 storage buckets, Supabase Auth); the user only needed a functional app that looks like the original, so the fastest, lowest-risk path was to preserve the existing Supabase backend and just port the frontend into the Replit workspace.
- The pre-existing scaffold packages (`artifacts/api-server`, `artifacts/mockup-sandbox`, `lib/*`) are unused by this app.
- Vite uses Tailwind v3 via PostCSS (`postcss.config.js` + `tailwind.config.ts`), not the v4 vite plugin.

## User preferences

- Wants the app functional and visually matching the original; does not need data migrated or preserved.

## Gotchas

- Supabase config lives in **shared** env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`). Vite embeds these at build time; restart the workflow after changing them.
- `artifacts/api-server` and `artifacts/mockup-sandbox` workflows may show as failed — they are unused scaffold and don't affect the app.
- **This app is pinned to React 18** (`react`/`react-dom`/`@types/react*` use explicit `^18` in `artifacts/app/package.json`, NOT `catalog:`). The Lovable code was written for React 18; the shared catalog's React 19 caused "Invalid hook call" crashes in the authenticated dashboard. Do not switch these back to `catalog:`.
- Supabase realtime subscriptions must remove any stale channel with the same topic before `.subscribe()` (see `useFriends.ts`, `useForestState.ts`, `useForestInbox.ts`). Re-using an already-subscribed same-named channel on remount throws `cannot add postgres_changes callbacks ... after subscribe()`.
- The app's Supabase project **requires email confirmation** for new signups, so a fresh `signUp` returns no session until the email is confirmed. Test with an already-confirmed account.
- `pnpm --filter @workspace/app run typecheck` reports a handful of pre-existing errors in components copied from `.migration-backup/` (Lovable). These do not affect the running app (Vite/esbuild transpiles without type-checking).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
