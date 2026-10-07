-- Knowledge OS MVP: one row per recording (an MP3 the PC tracker found in the
-- watch folder). The raw transcript is stored exactly as Whisper returned it
-- (segments with timestamps) and never edited; everything later (the Obsidian
-- notes the Claude routine writes) points back here and to the MP3 on the PC.
-- Recordings close together in time share a session_key (one lecture recorded
-- in several parts).
CREATE TABLE public.kos_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL,
  file_name TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  duration_seconds NUMERIC NOT NULL,
  session_key TEXT NOT NULL,
  part INTEGER NOT NULL DEFAULT 1,
  model TEXT NOT NULL,
  language TEXT,
  -- [{ "start": s, "end": s, "text": "..." }] in seconds from the start of the file
  segments JSONB NOT NULL,
  raw_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sha256)
);

CREATE INDEX idx_kos_recordings_user_time ON public.kos_recordings(user_id, recorded_at DESC);

GRANT SELECT, INSERT, DELETE ON public.kos_recordings TO authenticated;
GRANT ALL ON public.kos_recordings TO service_role;

ALTER TABLE public.kos_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own recordings"
  ON public.kos_recordings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can add their own recordings"
  ON public.kos_recordings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own recordings"
  ON public.kos_recordings FOR DELETE USING (auth.uid() = user_id);
-- No UPDATE policy: a raw transcript is never changed after it is written.
