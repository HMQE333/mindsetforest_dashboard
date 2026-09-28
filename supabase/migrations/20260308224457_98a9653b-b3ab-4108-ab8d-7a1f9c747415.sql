ALTER TABLE public.user_projects ADD COLUMN IF NOT EXISTS color_var text NOT NULL DEFAULT 'cat-mind';
ALTER TABLE public.user_projects ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT '📁';