
CREATE TABLE public.block_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  block_id uuid NOT NULL REFERENCES public.archive_blocks(id) ON DELETE CASCADE,
  rating integer NOT NULL DEFAULT 1,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.block_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reviews" ON public.block_reviews FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reviews" ON public.block_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own reviews" ON public.block_reviews FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_block_reviews_user ON public.block_reviews(user_id);
CREATE INDEX idx_block_reviews_block ON public.block_reviews(block_id);
