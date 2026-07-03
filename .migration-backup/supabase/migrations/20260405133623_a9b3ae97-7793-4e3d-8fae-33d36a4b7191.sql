
CREATE TABLE public.planning_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.user_projects(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.planning_tasks(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'task',
  title text NOT NULL DEFAULT '',
  done boolean NOT NULL DEFAULT false,
  deadline text,
  leverage text,
  energy text,
  time_minutes integer,
  url text,
  icon text,
  notes text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.planning_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own planning tasks"
  ON public.planning_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own planning tasks"
  ON public.planning_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own planning tasks"
  ON public.planning_tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own planning tasks"
  ON public.planning_tasks FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_planning_tasks_project ON public.planning_tasks(project_id);
CREATE INDEX idx_planning_tasks_parent ON public.planning_tasks(parent_id);
CREATE INDEX idx_planning_tasks_user ON public.planning_tasks(user_id);
