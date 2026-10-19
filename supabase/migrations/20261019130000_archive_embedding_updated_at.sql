-- Archive: writing a note's embedding no longer counts as changing the note.
--
-- archive_blocks.updated_at is bumped by a BEFORE UPDATE trigger on every update. ai-embed-block
-- writes the embedding right after each save, so every add or edit moved updated_at a second time,
-- a few seconds after the app had already taken the save's own updated_at into its list. The
-- Archive's 5 s poll compares "row count : newest updated_at" with the list it holds
-- (useArchiveState.ts), saw a change, and re-downloaded every note on every open device: about
-- 0.7 MB per save, and every 5 s during a bulk import while the embeddings were written.
--
-- An update that changes only the embedding now keeps updated_at; any other update bumps it as
-- before. Rows and data are not touched.

CREATE OR REPLACE FUNCTION public.update_archive_blocks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.embedding IS DISTINCT FROM OLD.embedding
     AND (to_jsonb(NEW) - 'embedding' - 'updated_at') = (to_jsonb(OLD) - 'embedding' - 'updated_at') THEN
    RETURN NEW;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_archive_blocks_updated_at ON public.archive_blocks;
CREATE TRIGGER update_archive_blocks_updated_at
  BEFORE UPDATE ON public.archive_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_archive_blocks_updated_at();
