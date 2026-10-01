-- Pin and star are two separate things on a note. The pin
-- (archive_blocks.is_pinned) keeps a note at the top of the Library; the
-- star (is_starred) bookmarks it, so it is listed in Bookmarks. No note
-- was pinned when they were split, so nothing is carried over.
ALTER TABLE public.archive_blocks
  ADD COLUMN IF NOT EXISTS is_starred boolean NOT NULL DEFAULT false;
