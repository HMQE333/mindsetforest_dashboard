-- Per-request AI spend, written by the edge functions with the service role.
-- Powers the monthly budget guard in ai-assistant-chat (smart model until the
-- cap, cheap model after) and the "this month" readout in Settings -> AI.
CREATE TABLE public.ai_usage_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,            -- 'assistant-chat' | 'assistant-route' | ...
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_log_user_time ON public.ai_usage_log(user_id, created_at DESC);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own spend; only the service role writes.
GRANT SELECT ON public.ai_usage_log TO authenticated;
GRANT ALL ON public.ai_usage_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ai_usage_log_id_seq TO service_role;

CREATE POLICY "Users can view their own AI usage"
  ON public.ai_usage_log FOR SELECT USING (auth.uid() = user_id);

-- Month-to-date totals for the calling user (or, for the service role, any user).
CREATE OR REPLACE FUNCTION public.ai_usage_month(p_user UUID DEFAULT NULL)
RETURNS TABLE (cost_usd NUMERIC, requests BIGINT, prompt_tokens BIGINT, completion_tokens BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(l.cost_usd), 0)::NUMERIC,
    COUNT(*)::BIGINT,
    COALESCE(SUM(l.prompt_tokens), 0)::BIGINT,
    COALESCE(SUM(l.completion_tokens), 0)::BIGINT
  FROM public.ai_usage_log l
  WHERE l.user_id = COALESCE(p_user, auth.uid())
    AND (auth.role() = 'service_role' OR l.user_id = auth.uid())
    AND l.created_at >= date_trunc('month', now());
$$;

GRANT EXECUTE ON FUNCTION public.ai_usage_month(UUID) TO authenticated, service_role;
