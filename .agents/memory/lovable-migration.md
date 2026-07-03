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
