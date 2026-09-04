# MindsetForest — Supabase Edge Functions

These are the AI backend functions the app invokes via `supabase.functions.invoke(...)`.

## Providers

| Feature | Functions | Provider | Secret |
| --- | --- | --- | --- |
| **Archive vector embeddings** (semantic search, Forest search) | `ai-embed-block`, `forest-publish-seed` | **OpenAI** (`text-embedding-3-small`) | `OPENAI_API_KEY` |
| Every other AI feature (missions, ladder, habit loop, recipes, archive clean/expand/process/multi, assistant chat, book suggest, health extract, task split) | the 12 `ai-*` LLM functions | **OpenRouter** | `OPENROUTER_API_KEY` (+ optional `OPENROUTER_MODEL`) |
| **Planning simulations** (whole-project plan generation + plan chat) | `ai-plan-simulate`, `ai-plan-chat` | **OpenRouter**, on the model the user picked in Settings → AI | `OPENROUTER_API_KEY` (+ optional `OPENROUTER_MODEL_SONNET` / `OPENROUTER_MODEL_GPT`) |

The LLM functions previously used the Lovable AI gateway; they now call
`https://openrouter.ai/api/v1/chat/completions`. The default model is
`google/gemini-2.5-flash` (cheap, ~1M-token context, strong at large/abstract
text). Override per project with the `OPENROUTER_MODEL` secret.

## Connecting your real API keys

1. Get keys: [platform.openai.com](https://platform.openai.com/api-keys) and
   [openrouter.ai/keys](https://openrouter.ai/keys).
2. Create the secrets file and fill it in (it is git-ignored — never commit real keys):
   ```bash
   cp supabase/functions/.env.example supabase/functions/.env
   # edit supabase/functions/.env
   supabase secrets set --env-file supabase/functions/.env
   ```
   Or set them individually:
   ```bash
   supabase secrets set OPENAI_API_KEY=sk-...
   supabase secrets set OPENROUTER_API_KEY=sk-or-...
   supabase secrets set OPENROUTER_MODEL=google/gemini-2.5-flash
   supabase secrets set OPENROUTER_MODEL_SONNET=anthropic/claude-sonnet-5
   supabase secrets set OPENROUTER_MODEL_GPT=openai/gpt-5
   ```
3. Deploy the functions:
   ```bash
   supabase functions deploy      # all functions
   # or one at a time, e.g. supabase functions deploy ai-mission-suggest
   ```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically by Supabase and do not need to be set.

## Planning simulation functions

`ai-plan-simulate` turns a free-text brief into a whole simulated project: phases,
concrete steps, and **loop** blocks for anything that repeats, with the decisions
already made (they come back in `decisions`, not as "decide X" steps). It returns
one JSON `plan` document, which the app stores in `plan_simulations.plan`.

`ai-plan-chat` runs **two passes** per message:

1. **Research** — reads the plan outline (every step carries its id) plus the
   user's own dashboard data and writes short notes. Shown in the UI.
2. **Answer** — returns `{reply, ops}`, where `ops` are surgical edit operations
   against individual step/phase ids (move, update, insert, delete). The client
   shows them as a diff; nothing is saved until the user approves, and every
   applied change is snapshotted so it can be undone.

Neither function ever rebuilds the plan behind the user's back — regeneration is
an explicit action, and it too lands in the version history.
