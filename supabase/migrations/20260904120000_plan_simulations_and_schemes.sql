-- Planning Simulations (regenerable "whole project, decisions made" plans),
-- their version history (undo), their chat, and dashboard Schemes
-- (saveable/loadable sets of missions, e.g. "low energy day").

-- 1. Simulations ------------------------------------------------------------
CREATE TABLE public.plan_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id UUID REFERENCES public.planning_boards(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.user_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled simulation',
  brief TEXT NOT NULL DEFAULT '',
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_simulations_user ON public.plan_simulations(user_id);
CREATE INDEX idx_plan_simulations_board ON public.plan_simulations(board_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_simulations TO authenticated;
GRANT ALL ON public.plan_simulations TO service_role;
ALTER TABLE public.plan_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own simulations"
  ON public.plan_simulations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own simulations"
  ON public.plan_simulations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own simulations"
  ON public.plan_simulations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own simulations"
  ON public.plan_simulations FOR DELETE USING (auth.uid() = user_id);

-- 2. Version history (undo of recent changes, GitHub-style) ------------------
CREATE TABLE public.plan_simulation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id UUID NOT NULL REFERENCES public.plan_simulations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan JSONB NOT NULL,
  label TEXT NOT NULL DEFAULT 'Change',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_versions_sim ON public.plan_simulation_versions(simulation_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_simulation_versions TO authenticated;
GRANT ALL ON public.plan_simulation_versions TO service_role;
ALTER TABLE public.plan_simulation_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own plan versions"
  ON public.plan_simulation_versions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own plan versions"
  ON public.plan_simulation_versions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own plan versions"
  ON public.plan_simulation_versions FOR DELETE USING (auth.uid() = user_id);

-- 3. Per-simulation chat ----------------------------------------------------
CREATE TABLE public.plan_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id UUID NOT NULL REFERENCES public.plan_simulations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL DEFAULT '',
  research TEXT,
  ops JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_chat_sim ON public.plan_chat_messages(simulation_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_chat_messages TO authenticated;
GRANT ALL ON public.plan_chat_messages TO service_role;
ALTER TABLE public.plan_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own plan chat"
  ON public.plan_chat_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own plan chat"
  ON public.plan_chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own plan chat"
  ON public.plan_chat_messages FOR DELETE USING (auth.uid() = user_id);

-- 4. Dashboard schemes ------------------------------------------------------
CREATE TABLE public.dashboard_schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🎛️',
  description TEXT NOT NULL DEFAULT '',
  -- { "<categoryId>": Mission[] } — the mission set this scheme loads.
  missions JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dashboard_schemes_user ON public.dashboard_schemes(user_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_schemes TO authenticated;
GRANT ALL ON public.dashboard_schemes TO service_role;
ALTER TABLE public.dashboard_schemes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own schemes"
  ON public.dashboard_schemes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own schemes"
  ON public.dashboard_schemes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own schemes"
  ON public.dashboard_schemes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own schemes"
  ON public.dashboard_schemes FOR DELETE USING (auth.uid() = user_id);
