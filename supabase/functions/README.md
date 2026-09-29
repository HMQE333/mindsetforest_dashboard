# MindsetForest — Supabase Edge Functions

These are the AI backend functions the app invokes via `supabase.functions.invoke(...)`.

## Providers

| Feature | Functions | Provider | Secret |
| --- | --- | --- | --- |
| **Archive vector embeddings** (semantic search, Forest search) | `ai-embed-block`, `forest-publish-seed` | **OpenRouter** (`openai/text-embedding-3-small`) | `OPENROUTER_API_KEY` |
| Every other AI feature (missions, paths, recipes, archive clean/expand/process/multi, assistant chat, book suggest, health extract, task split) | the `ai-*` LLM functions | **OpenRouter** | `OPENROUTER_API_KEY` (+ optional `OPENROUTER_MODEL`) |
| **Assistant voice** (`ai-tts`): reads replies aloud in voice mode; without the key the browser voice is used | `ai-tts` | **ElevenLabs** | `ELEVENLABS_API_KEY`, optional `ELEVENLABS_VOICE_ID` (default: the first male voice on the account; users pick any account voice in Settings -> AI Context or in the voice strip), `ELEVENLABS_MODEL` (default `eleven_flash_v2_5`; `eleven_multilingual_v2` for top quality at 2x credits) |
| **Assistant chat** (`ai-assistant-chat`): smart model until a monthly cap, cheap model after; a small router model picks context sections | `ai-assistant-chat` | **OpenRouter** | `ASSISTANT_MODEL` (default `anthropic/claude-haiku-4.5`; `anthropic/claude-sonnet-5.5` for top quality, `google/gemini-3-flash-preview` for the cheapest decent option), `ASSISTANT_FALLBACK_MODEL` (default `OPENROUTER_MODEL` or `google/gemini-2.5-flash`), `ASSISTANT_ROUTER_MODEL` (default `google/gemini-2.5-flash`), `ASSISTANT_BUDGET_USD` (default `10`) |

### Assistant budget

`ai-assistant-chat` logs every answered request to `ai_usage_log` (migration
`20260928200000_ai_usage_log.sql`) with OpenRouter's cost accounting and reads the
month-to-date total through `ai_usage_month()`. Once a user passes
`ASSISTANT_BUDGET_USD` in a calendar month the function answers from
`ASSISTANT_FALLBACK_MODEL` until the month rolls over. Without the migration the
function still works, but spend is not tracked and the cap is not enforced.
Settings -> AI Context shows the models and this month's spend.

### Shared planner

`ai-mission-suggest` and `ai-path-suggest` both build their prompt with
`_shared/planner.ts`. It authenticates the caller, then reads their written
personal context (`user_context.notes`) plus a factual snapshot - today's
progress, 14 days of completions, tasks they keep skipping, active paths, open
planning nodes, today's calendar, latest watch numbers, and which past
suggestions they accepted or rejected (`ai_suggestion_log`). Everything degrades
to silence if a table is missing, so a partly set-up account still works.

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
   supabase secrets set OPENROUTER_API_KEY=sk-or-...
   supabase secrets set OPENROUTER_MODEL=google/gemini-2.5-flash
   ```
3. Deploy the functions:
   ```bash
   supabase functions deploy      # all functions
   # or one at a time, e.g. supabase functions deploy ai-mission-suggest
   ```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically by Supabase and do not need to be set.
