-- Planning: two kinds of open loop.
--
-- Every planning node is an open loop of one of two kinds. A Step waits to be
-- done (tick it). A Question waits to be answered (one line), optionally after
-- a guess is written first; when it is answered the guess is graded once
-- (right / wrong / unknown), the node-sized twin of paths.diagnosis. Target,
-- Plan, Option, Test, Decision and Model are positions or states of these two,
-- so no type column and no relationship table: structure carries tests and
-- answers, "chosen over" is the dropped children of a settled Question, and
-- "depends on" is sibling order (sort_order, now written).
--   ask        true = Question
--   guess      the prior, written before the work (Questions only)
--   outcome    the line that closed it: the answer, '→ Home: …', or why dropped
--   verdict    right | wrong | unknown, only when a guess and an outcome exist
--   dropped    off the board without being done; dropped implies done, so every
--              existing done = false "open" filter stays correct
--   closed_at  stamped on close, cleared on reopen
--
-- Additive: level, leverage, energy, time_minutes, icon, deadline, standalone
-- and project_id stay (stale bundles and the deployed planner still select
-- some; level's default keeps inserts valid). New code stops writing them.
-- The table's row-level security (own rows only) covers the new columns.
-- Safe to run more than once.

ALTER TABLE public.planning_tasks
  ADD COLUMN IF NOT EXISTS ask BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guess TEXT,
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS verdict TEXT,
  ADD COLUMN IF NOT EXISTS dropped BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Guarded: Postgres has no ADD CONSTRAINT IF NOT EXISTS, and a second run that
-- errors here would roll back the columns above with it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'planning_tasks_guess_on_question' AND conrelid = 'public.planning_tasks'::regclass
  ) THEN
    ALTER TABLE public.planning_tasks ADD CONSTRAINT planning_tasks_guess_on_question
      CHECK (guess IS NULL OR ask);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'planning_tasks_verdict_shape' AND conrelid = 'public.planning_tasks'::regclass
  ) THEN
    ALTER TABLE public.planning_tasks ADD CONSTRAINT planning_tasks_verdict_shape
      CHECK (verdict IS NULL OR (verdict IN ('right', 'wrong', 'unknown') AND guess IS NOT NULL AND outcome IS NOT NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'planning_tasks_dropped_is_closed' AND conrelid = 'public.planning_tasks'::regclass
  ) THEN
    ALTER TABLE public.planning_tasks ADD CONSTRAINT planning_tasks_dropped_is_closed
      CHECK (NOT dropped OR done);
  END IF;
END $$;

COMMENT ON COLUMN public.planning_tasks.ask IS
  'true = a Question (waits to be answered); false = a Step (waits to be done).';
COMMENT ON COLUMN public.planning_tasks.guess IS
  'The prior on a Question, written before the work. Graded once by verdict when the Question settles.';
COMMENT ON COLUMN public.planning_tasks.outcome IS
  'The line that closed the node: the answer, ''→ Home: <category>'', or why it was dropped.';
COMMENT ON COLUMN public.planning_tasks.verdict IS
  'right | wrong | unknown: did the guess hold? Only when a guess and an outcome exist.';
COMMENT ON COLUMN public.planning_tasks.dropped IS
  'Taken off the board without being done (dropped implies done). Dropped options of a settled Question are its "chosen over".';
COMMENT ON COLUMN public.planning_tasks.closed_at IS
  'When the node was ticked, settled or dropped; cleared on reopen.';

-- ---------------------------------------------------------------- sibling order

-- A new row with no position goes last among its siblings. Clients that send
-- an explicit sort_order keep it; old clients and the assistant, which send
-- none (the column default 0), no longer pile up at 0. Siblings share a user,
-- a board and a parent (NULL parents compared with IS NOT DISTINCT FROM).
-- SECURITY INVOKER: row-level security lets the user read his own rows, which
-- are the only ones it counts. Rows inserted by the same statement count too
-- (Postgres shows a BEFORE ROW trigger the rows processed before it).
CREATE OR REPLACE FUNCTION public.planning_tasks_default_sort_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sort_order IS NULL OR NEW.sort_order = 0 THEN
    SELECT coalesce(max(t.sort_order), 0) + 1 INTO NEW.sort_order
    FROM public.planning_tasks t
    WHERE t.user_id = NEW.user_id
      AND t.board_id IS NOT DISTINCT FROM NEW.board_id
      AND t.parent_id IS NOT DISTINCT FROM NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS planning_tasks_default_sort_order ON public.planning_tasks;
CREATE TRIGGER planning_tasks_default_sort_order
  BEFORE INSERT ON public.planning_tasks
  FOR EACH ROW EXECUTE FUNCTION public.planning_tasks_default_sort_order();

-- Backfill 1..n per sibling group. Ordered by the current sort_order first,
-- then created_at: every existing row is 0, so this is creation order the first
-- time, and a re-run keeps whatever order the user has set since.
WITH o AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, board_id, parent_id
           ORDER BY sort_order, created_at, id
         ) AS n
  FROM public.planning_tasks
)
UPDATE public.planning_tasks t
SET sort_order = o.n
FROM o
WHERE o.id = t.id AND t.sort_order IS DISTINCT FROM o.n;

-- Children are read by parent (tree walks, the frontier). Exists since the
-- table was created; kept here so the file stands on its own.
CREATE INDEX IF NOT EXISTS idx_planning_tasks_parent ON public.planning_tasks(parent_id);

-- ---------------------------------------------------------------- no parent loops

-- The client refuses a move that would put a node under itself or anything
-- below it, but only against the rows it has loaded: two devices (or two quick
-- drag-connects on the Map) can each pass that check and leave A under B under
-- A, which hides both and everything below them from every view. This refuses
-- such an update in the database. It walks up from the new parent through the
-- rows the user can see (SECURITY INVOKER; his own rows under row-level
-- security) and stops after 10000 steps on data that already holds a loop.
-- Two transactions committing at the same instant can still race past it; the
-- views then lift one node of the loop to the top level (childrenMap) so it
-- stays reachable and can be moved back.
CREATE OR REPLACE FUNCTION public.planning_tasks_no_parent_loop()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_id IS NULL OR NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id OR EXISTS (
    WITH RECURSIVE up(id, parent_id, depth) AS (
      SELECT t.id, t.parent_id, 1 FROM public.planning_tasks t WHERE t.id = NEW.parent_id
      UNION ALL
      SELECT t.id, t.parent_id, up.depth + 1
      FROM public.planning_tasks t JOIN up ON t.id = up.parent_id
      WHERE up.depth < 10000 AND up.id <> NEW.id
    )
    SELECT 1 FROM up WHERE up.id = NEW.id
  ) THEN
    RAISE EXCEPTION 'A node cannot go under itself or anything below it'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS planning_tasks_no_parent_loop ON public.planning_tasks;
CREATE TRIGGER planning_tasks_no_parent_loop
  BEFORE UPDATE OF parent_id ON public.planning_tasks
  FOR EACH ROW EXECUTE FUNCTION public.planning_tasks_no_parent_loop();
