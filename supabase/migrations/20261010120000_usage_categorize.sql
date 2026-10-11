-- Computer time: "Przypisz w 10 sekund" (most time used to land in no class) ---
--
-- app_classes.catalog_groups    which groups of the built-in app catalog a class
--                               claims (src/lib/app-catalog-data.ts), answered
--                               once in the triage dialog's quick questions.
-- app_tracking_privacy.ai_titles whether window titles (redacted) may go to the
--                               model when it proposes classes.
-- app_class_suggestions         the model's answers per app key: the cache, the
--                               memory of what the user skipped, and the
--                               scorecard (offered -> accepted / corrected).
-- A suggestion never classifies anything: accepting writes an ordinary
-- app_rules row (source 'label'), which every consumer already loads.
--
-- Re-runnable: IF NOT EXISTS everywhere, policies dropped before they are made.

-- 1. Catalog groups a class claims ------------------------------------------------
ALTER TABLE public.app_classes
  ADD COLUMN IF NOT EXISTS catalog_groups TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.app_classes.catalog_groups IS
  'Built-in catalog groups (ai_chat, shopping, music, news, ...) whose apps and sites go to this class instead of the group''s default kind. The web app keeps each group in at most one class.';

-- 2. Titles to the model, or keys only ---------------------------------------------
ALTER TABLE public.app_tracking_privacy
  ADD COLUMN IF NOT EXISTS ai_titles BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.app_tracking_privacy.ai_titles IS
  'When false, ai-usage-classify sends only app keys and app names, never window titles. Titles are redacted either way.';

-- 3. The model's suggestions ----------------------------------------------------------
-- One row per thing the model was asked about. Only app keys are asked about
-- today ('key', title_key ''); 'title' rows (one tab title of a bucket key such
-- as "Browser | other") are kept in the shape for when tabs are asked about.
CREATE TABLE IF NOT EXISTS public.app_class_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'key' CHECK (item_type IN ('key', 'title')),
  app_key TEXT NOT NULL,
  -- lower(normTitle(window_title)) for 'title' items, '' for 'key' items.
  title_key TEXT NOT NULL DEFAULT '',
  -- SET NULL, not CASCADE: deleting a class must not erase a dismissal.
  -- NULL also stands for the model's "cannot tell" and for a skip with no answer.
  class_id UUID REFERENCES public.app_classes(id) ON DELETE SET NULL,
  alt_class_id UUID REFERENCES public.app_classes(id) ON DELETE SET NULL,
  confidence NUMERIC NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  multi_purpose BOOLEAN NOT NULL DEFAULT false,
  reason TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  -- Hash of the class list (id, name, kind) and project names the answer was
  -- given against: a different vocabulary asks again, the same one is free.
  vocab_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'accepted', 'corrected', 'dismissed')),
  final_class_id UUID REFERENCES public.app_classes(id) ON DELETE SET NULL,
  -- Whether the row was pre-selected when the user decided: precision of the
  -- pre-selected rows is what says whether the threshold is right.
  preselected BOOLEAN NOT NULL DEFAULT false,
  seconds_at_offer INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  UNIQUE (user_id, item_type, app_key, title_key)
);

COMMENT ON COLUMN public.app_class_suggestions.status IS
  'offered = the model''s answer, shown; accepted = taken as offered; corrected = the user picked another class (final_class_id); dismissed = "Pomiń": never asked about again.';

CREATE INDEX IF NOT EXISTS idx_app_class_suggestions_user
  ON public.app_class_suggestions(user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_class_suggestions TO authenticated;
GRANT ALL ON public.app_class_suggestions TO service_role;

ALTER TABLE public.app_class_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own class suggestions" ON public.app_class_suggestions;
DROP POLICY IF EXISTS "Users can insert their own class suggestions" ON public.app_class_suggestions;
DROP POLICY IF EXISTS "Users can update their own class suggestions" ON public.app_class_suggestions;
DROP POLICY IF EXISTS "Users can delete their own class suggestions" ON public.app_class_suggestions;

CREATE POLICY "Users can view their own class suggestions"
  ON public.app_class_suggestions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own class suggestions"
  ON public.app_class_suggestions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own class suggestions"
  ON public.app_class_suggestions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own class suggestions"
  ON public.app_class_suggestions FOR DELETE USING (auth.uid() = user_id);
