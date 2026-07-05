---
name: Lovable → Replit migration (MindsetForest)
description: Why this imported Lovable app kept Supabase instead of migrating to Replit primitives.
---

# MindsetForest migration decision

The imported Lovable app uses Supabase as a heavy backend: ~20 tables, 8 RPCs, 14 edge
functions (mostly AI), 4 storage buckets, and Supabase Auth, across 240+ source files.

**Decision:** keep the existing Supabase backend as-is and only port the frontend into the
Replit `pnpm_workspace` (new `artifacts/app` react-vite artifact). Did NOT build a Replit
api-server / Drizzle / Clerk replacement.

**Why:** The user explicitly wanted just a functional app that looks like the original, with
no data migration needed. A full swap to Replit primitives (rewriting 14 edge functions,
recreating all tables + RLS + RPCs, replacing auth/storage) would be enormous and high-risk
for regressions. Preserving Supabase was the fastest, safest path to parity.

**How to apply:** For future changes, data/auth still flow through `@supabase/supabase-js`
directly from the client (see `src/integrations/supabase/client.ts` and `src/hooks/*`). The
Supabase URL + anon (publishable) key live in shared env vars (`VITE_SUPABASE_*`). The scaffold's
`artifacts/api-server` and `lib/db` are unused. Only revisit a Replit-primitive migration if the
user explicitly asks to leave Supabase.

## Schema changes can't be applied from the workspace

Only the anon/publishable key is available here — there is **no service role key or DB
connection string for Supabase** (the `DATABASE_URL`/`PG*` secrets point at Replit's unused
built-in Postgres, not Supabase). So any new table/column must be written as a SQL file under
`.migration-backup/supabase/migrations/` (reference only) **and the user must run it against
their Supabase project themselves** — the agent cannot apply it.

**Why:** anon key can't run DDL, and PostgREST hides missing tables behind `PGRST205` ("could
not find the table in the schema cache") rather than a SQL error.

**How to apply:** When adding a feature that needs new tables/columns, (1) write the migration
file + update `integrations/supabase/types.ts`, (2) make the hooks **degrade gracefully** when
the table is missing (treat errors as empty arrays) so the app still builds/runs, and (3) tell
the user the migration must be applied to Supabase before the feature works. To check whether a
table exists, hit `${VITE_SUPABASE_URL}/rest/v1/<table>?select=id&limit=1` with the anon key —
404 `PGRST205` means not yet applied.

## New AI behaviors must reuse existing edge functions

Same constraint applies to AI: the workspace can't deploy new Supabase edge functions, so any
new AI feature has to reuse the existing `ai-archive-*` functions. Two reusable shapes:
`ai-archive-process` (`{items:string[]}` → `{blocks:[{title,content,pillars,directions,tags}]}`)
for batch auto-tagging, and `ai-archive-clean` (`{rawText, customPrompt}` → `{cleanedText}`) which
can be **repurposed as a general classifier**: put JSON-output instructions in `customPrompt` and
parse `cleanedText` (strip ``` fences / slice between first `[` and last `]`).

**Why:** no dedicated keep/skip classifier exists and we can't add one; `ai-archive-clean`'s free
-form `customPrompt` + string output is the only client-callable way to get arbitrary AI JSON.

**How to apply:** always keep a local heuristic fallback and wrap each AI batch in try/catch so a
failed/malformed AI response degrades to the heuristic instead of aborting (see the Obsidian
import: `lib/obsidian-import.ts` heuristicKeep + `components/archive/ObsidianImportModal.tsx`).

## Assistant write-actions ride on the existing chat function (no new function)

The assistant can now propose write actions (add task / add mission), but since we can't
deploy edge functions, the action **protocol is injected client-side into `context`** (the
existing `ai-assistant-chat` embeds `context` into the system prompt and streams the reply
back verbatim). The model emits a fenced ```action JSON block; the client parses it out,
gates each action by the granted scope, shows a confirm card, then applies via the state
hooks (`useDashboardState.addMission`; planning tasks via a direct `planning_tasks` insert
because `usePlanningState` is page-scoped and can't mount globally without a full fetch).

**Why:** matches the "reuse existing edge functions" constraint — the feature works against
the already-deployed function with no redeploy, while `ai-assistant-chat/index.ts` was also
updated (sentinel-guarded) to carry the same instructions for any future redeploy.

**How to apply:** to add a new action type, extend `lib/assistant-actions.ts` (type,
`ACTION_SCOPE`, `buildActionInstructions`, `coerceAction`, `describeAction`) and its executor
in `useAssistant.applyActions`. Keep every action gated by a scope the user enabled.
