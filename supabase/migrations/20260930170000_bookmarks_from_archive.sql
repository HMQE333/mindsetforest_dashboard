-- Bookmarks become the one place for what you keep close from your own
-- archive: bookmarked notes (archive_blocks.is_pinned, shown with a star),
-- bookmarked links from those notes, and URLs added by hand. A link
-- remembers the note it came from; deleting the note keeps the bookmark.
ALTER TABLE public.bookmarks
  ADD COLUMN IF NOT EXISTS block_id uuid REFERENCES public.archive_blocks(id) ON DELETE SET NULL;

-- One bookmark per URL.
CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_user_url ON public.bookmarks (user_id, url);
