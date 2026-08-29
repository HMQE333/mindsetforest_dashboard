-- Personal context + suggestion feedback loop.
--
-- Two things the AI planner never had:
--   user_context     - who the user is, written once, sent with every request
--   ai_suggestion_log - what was offered and what the user did with it, so the
--                       planner can stop repeating suggestions that get refused

CREATE TABLE public.user_context (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- One free-text block on purpose. A form with six fields is six decisions;
  -- a single "tell me about your situation" box is one.
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_context TO authenticated;
GRANT ALL ON public.user_context TO service_role;
ALTER TABLE public.user_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own context"
  ON public.user_context FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own context"
  ON public.user_context FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own context"
  ON public.user_context FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own context"
  ON public.user_context FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.ai_suggestion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'mission' (Home) or 'path' (Paths)
  scope TEXT NOT NULL,
  category_id TEXT,
  title TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);

CREATE INDEX idx_ai_suggestion_log_user ON public.ai_suggestion_log(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_suggestion_log TO authenticated;
GRANT ALL ON public.ai_suggestion_log TO service_role;
ALTER TABLE public.ai_suggestion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own suggestion log"
  ON public.ai_suggestion_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own suggestion log"
  ON public.ai_suggestion_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own suggestion log"
  ON public.ai_suggestion_log FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own suggestion log"
  ON public.ai_suggestion_log FOR DELETE USING (auth.uid() = user_id);
