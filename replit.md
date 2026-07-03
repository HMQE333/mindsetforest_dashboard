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

## Architecture decisions

- **Supabase was intentionally kept** rather than migrated to Replit primitives. The app is large (240+ files, ~20 tables, 8 RPCs, 14 edge functions, 4 storage buckets, Supabase Auth); the user only needed a functional app that looks like the original, so the fastest, lowest-risk path was to preserve the existing Supabase backend and just port the frontend into the Replit workspace.
- The pre-existing scaffold packages (`artifacts/api-server`, `artifacts/mockup-sandbox`, `lib/*`) are unused by this app.
- Vite uses Tailwind v3 via PostCSS (`postcss.config.js` + `tailwind.config.ts`), not the v4 vite plugin.

## User preferences

- Wants the app functional and visually matching the original; does not need data migrated or preserved.

## Gotchas

- Supabase config lives in **shared** env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`). Vite embeds these at build time; restart the workflow after changing them.
- `artifacts/api-server` and `artifacts/mockup-sandbox` workflows may show as failed — they are unused scaffold and don't affect the app.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
