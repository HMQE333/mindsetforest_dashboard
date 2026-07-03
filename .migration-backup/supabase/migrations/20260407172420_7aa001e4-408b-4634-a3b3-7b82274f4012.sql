ALTER TABLE public.planning_tasks
  ADD COLUMN standalone boolean NOT NULL DEFAULT false,
  ADD COLUMN position_x double precision,
  ADD COLUMN position_y double precision;