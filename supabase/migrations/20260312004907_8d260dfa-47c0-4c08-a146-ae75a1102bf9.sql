
ALTER TABLE public.user_books ADD COLUMN pillars text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.user_books ADD COLUMN directions text[] NOT NULL DEFAULT '{}'::text[];
