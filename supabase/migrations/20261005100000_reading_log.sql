-- Reading log: "today I read pages 100 to 123 of Influence", typed in the
-- book's card or said to the assistant. One row per stretch read, on the
-- owner's day (04:00 boundary, src/lib/today.ts). The book's bookmark
-- (user_books.pages_read) moves forward with it; this table keeps the
-- history, so the Library can show where each sitting began and ended.
-- Timed sittings in the PDF reader stay in reading_sessions.
CREATE TABLE public.reading_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.user_books(id) ON DELETE CASCADE,
  read_on DATE NOT NULL,
  -- Both pages included: 100 to 123 is 24 pages.
  from_page INTEGER NOT NULL CHECK (from_page >= 1),
  to_page INTEGER NOT NULL CHECK (to_page >= from_page),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'assistant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reading_log_user_book ON public.reading_log(user_id, book_id, read_on DESC, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_log TO authenticated;
GRANT ALL ON public.reading_log TO service_role;

ALTER TABLE public.reading_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reading log"
  ON public.reading_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own reading log"
  ON public.reading_log FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.user_books b WHERE b.id = book_id AND b.user_id = auth.uid())
  );
CREATE POLICY "Users can update their own reading log"
  ON public.reading_log FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reading log"
  ON public.reading_log FOR DELETE USING (auth.uid() = user_id);
