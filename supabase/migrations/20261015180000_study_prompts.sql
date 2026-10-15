-- Study prompts: how the user wants to be taught, kept in one place.
--
-- Long study sessions run on the user's own ChatGPT / Claude subscriptions, not
-- through the dashboard's assistant. The dashboard hands them a study pack, and
-- the PC tracker copies the two prompts into the Obsidian vault
-- (_SYSTEM/learning-mode.md, _SYSTEM/primer-prompt.md) for Claude Desktop and
-- the Claude routine. Edited in Settings -> AI Context -> Nauka.
--   learning_mode       the user's "Tryb nauki": map first, Predict -> Name ->
--                       Place -> Refine, graded retrieval, control words
--   primer_prompt       the "Primer" prompt the routine follows when it writes a
--                       course textbook (Lectures/<Course>/_Podręcznik.md)
--   chatgpt_project_url optional https://chatgpt.com/... project the study
--                       buttons open; its instructions then hold the learning mode
-- The table's row-level security (own row only) covers the new columns.
-- Guarded like 20260829120000_paths_engine.sql, and safe to run more than once.
DO $$
BEGIN
  IF to_regclass('public.user_context') IS NULL THEN
    RAISE NOTICE 'Skipping study prompts: public.user_context does not exist yet. Run 20260827130000_user_context.sql, then re-run this file.';
    RETURN;
  END IF;

  ALTER TABLE public.user_context ADD COLUMN IF NOT EXISTS learning_mode TEXT NOT NULL DEFAULT '';
  ALTER TABLE public.user_context ADD COLUMN IF NOT EXISTS primer_prompt TEXT NOT NULL DEFAULT '';
  ALTER TABLE public.user_context ADD COLUMN IF NOT EXISTS chatgpt_project_url TEXT NOT NULL DEFAULT '';
  -- The study buttons open this link in a new tab: only ChatGPT itself (the settings form checks the
  -- same: https, host chatgpt.com, no user name; any case, an optional :443, a path or nothing after).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_context_chatgpt_project_url_check' AND conrelid = 'public.user_context'::regclass
  ) THEN
    ALTER TABLE public.user_context ADD CONSTRAINT user_context_chatgpt_project_url_check
      CHECK (chatgpt_project_url = '' OR chatgpt_project_url ~* '^https://chatgpt\.com(:443)?([/?#]|$)');
  END IF;

  COMMENT ON COLUMN public.user_context.learning_mode IS
    'How the user wants to be taught. Copied into the study pack and into the vault as _SYSTEM/learning-mode.md.';
  COMMENT ON COLUMN public.user_context.primer_prompt IS
    'The Primer prompt for course textbooks. Copied into the vault as _SYSTEM/primer-prompt.md.';
  COMMENT ON COLUMN public.user_context.chatgpt_project_url IS
    'Optional https://chatgpt.com/ project the study buttons open; empty opens chatgpt.com.';
END $$;
