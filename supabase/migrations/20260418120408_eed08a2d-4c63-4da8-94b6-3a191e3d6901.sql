CREATE TABLE public.finance_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🔣',
  color TEXT NOT NULL DEFAULT '#8B5CF6',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX finance_categories_user_kind_name_idx
  ON public.finance_categories (user_id, kind, lower(name));

CREATE INDEX finance_categories_user_idx ON public.finance_categories (user_id);

ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own finance categories"
ON public.finance_categories FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own finance categories"
ON public.finance_categories FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own finance categories"
ON public.finance_categories FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own finance categories"
ON public.finance_categories FOR DELETE
USING (auth.uid() = user_id);