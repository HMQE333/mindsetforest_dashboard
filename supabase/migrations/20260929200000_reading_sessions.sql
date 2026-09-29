-- When a book was finished, set as its status turns to finished (cleared if
-- it turns back). Books finished before this column existed stay without one.
ALTER TABLE public.user_books ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

-- Reading speed. Each time a book's PDF is open in the in-app reader, the
-- time spent on each page is measured; one row per sitting keeps those
-- samples so the Library can show an average speed, a per-page picture of a
-- book, and how long the rest of a book will take.
--
-- A sample only counts when the reader moved on to the very next page after
-- 4 s to 10 min on it (flicking through, jumping around and walking away
-- are left out), and time with the tab hidden is not counted.
CREATE TABLE public.reading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.user_books(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  -- Totals over the counted pages only.
  seconds INTEGER NOT NULL DEFAULT 0,
  pages INTEGER NOT NULL DEFAULT 0,
  -- Words on the counted pages that have text (0 for scans).
  words INTEGER NOT NULL DEFAULT 0,
  word_seconds INTEGER NOT NULL DEFAULT 0,
  -- [{ "p": pdf page, "s": seconds, "w": words on the page (when known) }]
  samples JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reading_sessions_user_book ON public.reading_sessions(user_id, book_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_sessions TO authenticated;
GRANT ALL ON public.reading_sessions TO service_role;

ALTER TABLE public.reading_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reading sessions"
  ON public.reading_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own reading sessions"
  ON public.reading_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reading sessions"
  ON public.reading_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reading sessions"
  ON public.reading_sessions FOR DELETE USING (auth.uid() = user_id);
