-- Planning Boards: an independent planning layer on top of user_projects.
-- A board lives only inside Planning; it does NOT create a user_projects row
-- and does not appear anywhere else in the app. A board can hold its own
-- planning tasks and can optionally link existing user_projects to aggregate
-- their planning tasks in one place.

CREATE TABLE public.planning_boards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  emoji text NOT NULL DEFAULT '🗂️',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.planning_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own boards"
  ON public.planning_boards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own boards"
  ON public.planning_boards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own boards"
  ON public.planning_boards FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own boards"
  ON public.planning_boards FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_planning_boards_user ON public.planning_boards(user_id);

-- Many-to-many link between boards and existing user_projects.
CREATE TABLE public.board_projects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  board_id uuid NOT NULL REFERENCES public.planning_boards(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.user_projects(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (board_id, project_id)
);

ALTER TABLE public.board_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own board projects"
  ON public.board_projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own board projects"
  ON public.board_projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own board projects"
  ON public.board_projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own board projects"
  ON public.board_projects FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_board_projects_board ON public.board_projects(board_id);
CREATE INDEX idx_board_projects_project ON public.board_projects(project_id);
CREATE INDEX idx_board_projects_user ON public.board_projects(user_id);

-- Let a planning task belong directly to a board with no project, and allow
-- project_id to be null so board-level tasks can exist on their own.
ALTER TABLE public.planning_tasks
  ADD COLUMN IF NOT EXISTS board_id uuid REFERENCES public.planning_boards(id) ON DELETE CASCADE;

ALTER TABLE public.planning_tasks ALTER COLUMN project_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_planning_tasks_board ON public.planning_tasks(board_id);

-- One-time backfill marker (per user). The first-load backfill that creates a
-- board per existing project must run exactly once and never resurrect boards
-- the user later deletes. The user_id primary key makes claiming the backfill
-- atomic: only the client whose INSERT wins the race runs the backfill.
CREATE TABLE public.planning_board_backfill (
  user_id uuid NOT NULL PRIMARY KEY,
  done_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.planning_board_backfill ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backfill marker"
  ON public.planning_board_backfill FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own backfill marker"
  ON public.planning_board_backfill FOR INSERT
  WITH CHECK (auth.uid() = user_id);
