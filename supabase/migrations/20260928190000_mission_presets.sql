-- Mission presets: named snapshots of the Home mission lists ("Monk mode",
-- "High energy day", "Lock in") that replace dashboard_state.custom_missions
-- with one click. The `missions` blob has the same shape as
-- dashboard_state.custom_missions: { [categoryId | "project-<uuid>"]: Mission[] }.
CREATE TABLE public.mission_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '⚡',
  description TEXT NOT NULL DEFAULT '',
  missions JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  last_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX idx_mission_presets_user ON public.mission_presets(user_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_presets TO authenticated;
GRANT ALL ON public.mission_presets TO service_role;

ALTER TABLE public.mission_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own mission presets"
  ON public.mission_presets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own mission presets"
  ON public.mission_presets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own mission presets"
  ON public.mission_presets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own mission presets"
  ON public.mission_presets FOR DELETE USING (auth.uid() = user_id);
