# MindsetForest

A gamified life/productivity tracker ("Your Life. Your Quest.") ported from Lovable. Users sign in and track habits, stats, ladders, oracle, archive, library, finance, a social "forest", and more — with several AI-assisted features.

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
- **Every other AI feature** (missions, ladder, habit loop, recipes, archive clean/expand/process/multi, assistant chat, book suggest, health extract, task split) uses **OpenRouter** → `OPENROUTER_API_KEY`, default model `google/gemini-2.5-flash` (override via `OPENROUTER_MODEL`). These previously used the Lovable AI gateway.
- **Planning simulations** (`ai-plan-simulate`, `ai-plan-chat`) also use OpenRouter, but on the model the user picks in **Settings → AI** — Claude Sonnet or GPT (`OPENROUTER_MODEL_SONNET` / `OPENROUTER_MODEL_GPT`). The chat researches the plan and the user's data before proposing edits, and returns edit *operations* against individual step ids rather than a rewritten plan.
- Connect keys with `supabase secrets set ...` then `supabase functions deploy` — see `supabase/functions/README.md`. Real keys are never committed (`supabase/functions/.env` is git-ignored).

## Planning simulations & schemes

- **Simulation** (`Planning → Simulation`) is a generated walk-through of a whole project: phases, ~40-140 concrete steps, and loop blocks for repeated cycles, with the decisions made up front. Stored as one JSON document per simulation (`plan_simulations.plan`), not as `planning_tasks` rows, because it is regenerated, versioned and diffed as a whole.
- Every mutation — AI edit, drag-and-drop, rename, tick — goes through `applyOps` in `src/lib/plan-model.ts`, and each one snapshots the previous plan into `plan_simulation_versions`, so any recent change can be undone from the History panel.
- Personal context for the plan chat comes from `src/lib/plan-context.ts`, which reuses the assistant's gatherers with one rule: **productivity/consistency data is withheld until there is enough history** (14+ active days, 30+ completions, 21+ days of account age). Below that the prompt explicitly forbids the model from drawing conclusions about the user's consistency.
- **Schemes** (`dashboard_schemes`) are named, loadable mission sets — "low energy day", "deep work". Loading one replaces today's missions via `applyMissionSet`, which re-maps completion ticks by mission title (so a task already done today stays done) and returns the previous set for the Undo button.

## Architecture decisions

- **Supabase was intentionally kept** rather than migrated to Replit primitives. The app is large (240+ files, ~20 tables, 8 RPCs, 14 edge functions, 4 storage buckets, Supabase Auth); the user only needed a functional app that looks like the original, so the fastest, lowest-risk path was to preserve the existing Supabase backend and just port the frontend into the Replit workspace.
- The pre-existing scaffold packages (`artifacts/api-server`, `artifacts/mockup-sandbox`, `lib/*`) are unused by this app.
- Vite uses Tailwind v3 via PostCSS (`postcss.config.js` + `tailwind.config.ts`), not the v4 vite plugin.

## User preferences

- Wants the app functional and visually matching the original; does not need data migrated or preserved.

## Gotchas

- The Simulation + Schemes tables live in `supabase/migrations/20260904120000_plan_simulations_and_schemes.sql` and must be applied to the Supabase project (`supabase db push`) before those features work; the client calls them through untyped `from(... as never)` accessors because `integrations/supabase/types.ts` is generated and does not know them yet.

- Supabase config lives in **shared** env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`). Vite embeds these at build time; restart the workflow after changing them.
- `artifacts/api-server` and `artifacts/mockup-sandbox` workflows may show as failed — they are unused scaffold and don't affect the app.
- **This app is pinned to React 18** (`react`/`react-dom`/`@types/react*` use explicit `^18` in `artifacts/app/package.json`, NOT `catalog:`). The Lovable code was written for React 18; the shared catalog's React 19 caused "Invalid hook call" crashes in the authenticated dashboard. Do not switch these back to `catalog:`.
- Supabase realtime subscriptions must remove any stale channel with the same topic before `.subscribe()` (see `useFriends.ts`, `useForestState.ts`, `useForestInbox.ts`). Re-using an already-subscribed same-named channel on remount throws `cannot add postgres_changes callbacks ... after subscribe()`.
- The app's Supabase project **requires email confirmation** for new signups, so a fresh `signUp` returns no session until the email is confirmed. Test with an already-confirmed account.
- `pnpm --filter @workspace/app run typecheck` reports a handful of pre-existing errors in components copied from `.migration-backup/` (Lovable). These do not affect the running app (Vite/esbuild transpiles without type-checking).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
