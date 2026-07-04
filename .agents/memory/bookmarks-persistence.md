---
name: Bookmarks / client persistence in the preview iframe
description: Why localStorage-only persistence silently fails here and where bookmarks are stored instead
---

# localStorage-only persistence is unreliable in this app's runtime

**Rule:** Do NOT persist user data with localStorage as the source of truth in this app. The app is viewed inside a proxied/partitioned preview iframe where localStorage writes can silently fail (or be partitioned), so localStorage-only data does not "stick" across tab-switch/reload.

**Why:** The bookmarks feature originally saved only to localStorage and users repeatedly reported "adding doesn't work." Diagnosis: every other feature (dashboard_state, user_onboarding/preferences, oracle_state, etc.) is Supabase-backed and works; localStorage is used only as a cache. Bookmarks were the *only* feature relying solely on localStorage — which is exactly why they alone failed to persist.

**How to apply:** Persist to Supabase and treat localStorage as an optional instant-paint cache only. There is no dedicated bookmarks table and the client has only the anon key (no DDL), so bookmarks live in `user_onboarding.preferences.bookmarks` (jsonb). Writes must be read-merge-write against `preferences` and upsert with `onConflict: user_id`, sending only `{ user_id, preferences }` so `completed`/`custom_categories` are preserved. This mirrors `useUserSettings.savePreferences` (the proven pattern; note its `(supabase.from(...) as any)` cast to bypass Insert-type friction).

**Testing note:** Full end-to-end verification of the authenticated write requires an already-email-confirmed account — fresh `signUp` returns no session (email confirmation is enforced on this Supabase project), so the anon client cannot exercise the RLS-protected write path.
