-- Daily and monthly reviews: the morning "how was yesterday" and the monthly
-- "what did this month go to". One row per period once it is answered or
-- skipped; the questions themselves are generated fresh (ai-review).
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('daily', 'monthly')),
  -- 'YYYY-MM-DD' for daily (the day reviewed), 'YYYY-MM' for monthly.
  period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('done', 'skipped')),
  headline TEXT NOT NULL DEFAULT '',
  -- The numbers shown on the summary screen, kept so a month can be read back.
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- [{ "question": text, "answer": text }]
  qa JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, period)
);

CREATE INDEX idx_reviews_user_period ON public.reviews(user_id, kind, period DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reviews"
  ON public.reviews FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own reviews"
  ON public.reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reviews"
  ON public.reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reviews"
  ON public.reviews FOR DELETE USING (auth.uid() = user_id);
