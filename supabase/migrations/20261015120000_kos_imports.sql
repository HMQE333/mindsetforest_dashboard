-- Knowledge OS imports: besides MP3 recordings, the PC tracker now takes
-- transcripts downloaded by hand (a lecture platform's .vtt/.docx/.pdf, a
-- course's captions, YouTube subtitles) from the vault's Import/ folder. Each
-- becomes a kos_recordings row like a recording, so it gets a session note and
-- the Claude routine processes it the same way.
--   source        where the transcript came from: 'recording' (Whisper on an
--                 MP3, every row before this migration), 'import' or 'youtube'
--   original_name the file (or "folder/file") as it was dropped into Import/
-- An import without times has no length: duration_seconds is 0 (the tracker
-- sends 0) or may be NULL, and its segments carry a paragraph number "p"
-- instead of times ({"p": 12, "start": null, "end": null, "text": "..."}).
-- Safe to run more than once.
ALTER TABLE public.kos_recordings
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'recording',
  ADD COLUMN IF NOT EXISTS original_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kos_recordings_source_check' AND conrelid = 'public.kos_recordings'::regclass
  ) THEN
    ALTER TABLE public.kos_recordings
      ADD CONSTRAINT kos_recordings_source_check CHECK (source IN ('recording', 'import', 'youtube'));
  END IF;
END $$;

ALTER TABLE public.kos_recordings ALTER COLUMN duration_seconds DROP NOT NULL;
