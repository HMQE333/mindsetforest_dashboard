-- Knowledge OS: a read-only copy of the Obsidian vault's own notes, so the
-- dashboard can show them. The PC tracker mirrors every .md file under
-- Knowledge/ (the atomic notes the Claude routine writes) and Sessions/ (one
-- note per recorded session, with its status) as plain text; the dashboard
-- parses them. The vault stays the source of truth: the tracker overwrites a
-- row when its file changes and deletes it when the file goes. Raw transcripts
-- are not copied here; they are already in kos_recordings.
CREATE TABLE public.kos_vault_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- the vault folder's name, which is Obsidian's vault name (obsidian:// links)
  vault TEXT NOT NULL,
  -- relative to the vault, with forward slashes: "Knowledge/Reciprocity.md"
  path TEXT NOT NULL,
  folder TEXT GENERATED ALWAYS AS (split_part(path, '/', 1)) STORED,
  content TEXT NOT NULL CHECK (length(content) <= 300000),
  sha256 TEXT NOT NULL,
  modified_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, path)
);

CREATE INDEX idx_kos_vault_files_user_folder ON public.kos_vault_files(user_id, folder);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kos_vault_files TO authenticated;
GRANT ALL ON public.kos_vault_files TO service_role;

ALTER TABLE public.kos_vault_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own vault notes"
  ON public.kos_vault_files FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can add their own vault notes"
  ON public.kos_vault_files FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own vault notes"
  ON public.kos_vault_files FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own vault notes"
  ON public.kos_vault_files FOR DELETE USING (auth.uid() = user_id);

-- The recording's note in the vault ("Recordings/<note_name>.md"), which is
-- what knowledge notes cite ("[[Recordings/<note_name>#^t0750]]").
ALTER TABLE public.kos_recordings ADD COLUMN note_name TEXT;
