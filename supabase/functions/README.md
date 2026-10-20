# MindsetForest — Supabase Edge Functions

These are the AI backend functions the app invokes via `supabase.functions.invoke(...)`.

## Providers

| Feature | Functions | Provider | Secret |
| --- | --- | --- | --- |
| **Archive vector embeddings** (semantic search, Forest search) | `ai-embed-block`, `forest-publish-seed` | **OpenRouter** (`openai/text-embedding-3-small`) | `OPENROUTER_API_KEY` |
| Every other AI feature (missions, paths, recipes, archive clean/expand/process/multi, assistant chat, book suggest, health extract, task split) | the `ai-*` LLM functions | **OpenRouter** | `OPENROUTER_API_KEY` (+ optional `OPENROUTER_MODEL`) |
| **Speech to text** (`ai-transcribe`): the assistant microphone, voice mode and voice notes. GPT-4o Transcribe detects the language (Polish and English in one sentence) and does not invent Whisper's "thank you" on silence; about $0.003 per minute; Whisper turbo is the fallback | `ai-transcribe` | **OpenRouter** | `OPENROUTER_API_KEY`, optional `TRANSCRIBE_MODEL` (default `openai/gpt-4o-transcribe`; `openai/gpt-4o-mini-transcribe` costs half) |
| **Assistant voice** (`ai-tts`): reads replies aloud in voice mode; without the key the browser voice is used | `ai-tts` | **ElevenLabs** | `ELEVENLABS_API_KEY`, optional `ELEVENLABS_VOICE_ID` (default: the first male voice on the account; users pick any account voice in Settings -> AI Context or in the voice strip), `ELEVENLABS_MODEL` (default `eleven_flash_v2_5`; `eleven_multilingual_v2` for top quality at 2x credits) |
| **Video summaries** (`ai-video-summary`): on request from a YouTube link's menu. Gemini watches the video once through OpenRouter's `video_url` (a link in plain text gets an invented summary) and writes the transcript; the summary, questions and search vector are made from the text; the workshop is a second watch. About 0.7 cents per minute of video per watch; logged to `ai_usage_log`. Stored in `link_summaries` | `ai-video-summary` (search via `ai-embed-block`) | **OpenRouter** | `OPENROUTER_API_KEY`, optional `VIDEO_MODEL` / `VIDEO_TEXT_MODEL` (default `google/gemini-2.5-flash`; the video model must accept `video_url`) |
| **Archive tag suggestions** (`ai-suggest-tags`): chips for a note from his most similar tagged notes, his past answers, a type rule and the model (mode `learn`), or plain model tags (mode `items`, the Inbox's AI Tag). About a tenth of a cent per 20 notes; logged to `ai_usage_log` as `archive-tags` | `ai-suggest-tags` (embeds a just-saved note through `ai-embed-block`) | **OpenRouter** | `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL`, `TAGS_BUDGET_USD` (monthly cap per user for this feature, default 1) |
| **Screen-time classes** (`ai-usage-classify`): the "Przypisz w 10 sekund" dialog in Stats -> Komputer asks it for a class for the app keys the catalog, rules and keywords left unassigned. Answers are cached in `app_class_suggestions`, so a repeated run is free; about 1 cent for a first run of 60 keys; logged to `ai_usage_log` as `usage-classify` | `ai-usage-classify` | **OpenRouter** | `OPENROUTER_API_KEY`, optional `CLASSIFY_MODEL` (default `OPENROUTER_MODEL`, then `google/gemini-2.5-flash`), `CLASSIFY_BUDGET_USD` (monthly cap per user for this feature, default 1) |
| **Assistant chat** (`ai-assistant-chat`): smart model until a monthly cap, cheap model after; a small router model picks context sections | `ai-assistant-chat` | **OpenRouter** | `ASSISTANT_MODEL` (default `anthropic/claude-haiku-4.5`; `anthropic/claude-sonnet-5.5` for top quality, `google/gemini-3-flash-preview` for the cheapest decent option), `ASSISTANT_FALLBACK_MODEL` (default `OPENROUTER_MODEL` or `google/gemini-2.5-flash`), `ASSISTANT_ROUTER_MODEL` (default `google/gemini-2.5-flash`), `ASSISTANT_BUDGET_USD` (default `10`) |

### Assistant budget

`ai-assistant-chat` logs every answered request to `ai_usage_log` (migration
`20260928200000_ai_usage_log.sql`) with OpenRouter's cost accounting and reads the
month-to-date total through `ai_usage_month()`. Once a user passes
`ASSISTANT_BUDGET_USD` in a calendar month the function answers from
`ASSISTANT_FALLBACK_MODEL` until the month rolls over. Without the migration the
function still works, but spend is not tracked and the cap is not enforced.
Settings -> AI Context shows the models and this month's spend.

### Screen-time classes

`ai-usage-classify` (migration `20261010120000_usage_categorize.sql`) proposes one
of the user's `app_classes` per app key; it never classifies anything itself. The
client lib is `artifacts/app/src/lib/app-usage-ai.ts`.

- It reads the classes, project names, the first 600 characters of
  `user_context.notes` and the `app_tracking_privacy.ai_titles` opt-out itself, and
  takes only keys, app names, minutes and titles from the body: at most 60 keys,
  3 titles each. Every key and title is redacted before the prompt is built
  (emails, DM handles, URL queries, UUIDs, hex ids, tokens, long numbers); with
  `ai_titles` off no title is sent at all.
- Classes go to the model as `c1..cN` plus `"none"` in a string enum, so it cannot
  invent an id. Batches of up to 20 keys run in parallel at temperature 0; a
  failed batch is not cached and is asked again next time. 402 and 429 are passed
  through when nothing could be answered.
- `app_class_suggestions` holds one row per key: an answer given against the same
  vocabulary (class ids, names, kinds and project names) is returned from there
  for free, a key the user skipped is never sent again, and a key they decided
  comes back as their own pick (never pre-selected). It is written with the
  user's token, and never over a decision made while the model was answering.
- It asks for endpoints that do not collect prompts
  (`provider.data_collection: "deny"`) and retries once without that when
  OpenRouter has no such endpoint for the model.

Without the migration the function still answers, but nothing is cached or
remembered.

### Archive tag suggestions

`ai-suggest-tags` with `{ mode: "learn", blockIds, pillars }` (at most 20 of the
caller's notes; `pillars` is his list of life areas from his settings, `{ id, name,
tagline }`) answers at most five chips per note, the type chip first, each with a
short Polish reason, then up to two pillar chips (`kind: "pillar"`, tag
`pillar:<id>`). Migration `20261019180000_archive_tag_learning.sql`; the pure half
(tag rules, scoring, prompt, credential check) is `_shared/archive-tags.ts`, whose
rules block is a word-for-word copy of `artifacts/app/src/lib/archive-tags.ts`
(`src/test/archive-tags.test.ts` fails when they drift). The client is
`artifacts/app/src/hooks/useTagSuggestions.ts`.

- Neighbours: `similar_archive_blocks` (service role only, like
  `search_archive_blocks`) returns up to 12 of his most similar notes that carry a
  real tag or a pillar; each of their tags and pillars scores the summed similarity
  (notes below 0.3 are ignored). Only their ids, tags and pillars are read, never
  their text.
- Pillars: the neighbours' pillars plus the model's pick from the list the app
  sent (1-2, by id), ranked like tags. Never `uncategorized`, a pillar the note
  has, or one he turned down for this note; without the list, no pillar chips.
  Accepting adds the pillar and never removes one; feedback rows use the tag
  `pillar:<id>` (a turned-down pillar on a neighbour counts against it).
- Feedback: `archive_tag_feedback` holds his answers (accepted chips, the ones he
  left out, the ones he turned down). On those neighbours a turned-down tag loses
  1.5x the similarity, an accepted one gains 0.5x; a tag he turned down for the note
  itself is never offered again.
- Type: his eight types are ordinary tags. `detectType` decides when the text leaves
  no doubt (links only, a picture or file only, a quote with its author, one short
  question, a list); otherwise the model picks; without the model, the similar notes'
  type or `fragment`.
- Model: one call for all the notes: the note's text (first 2,000 characters, link
  queries and email addresses removed), his vocabulary with counts (top 150, plus
  saved folders from `user_saved_tags` with module `archive` or `all`), the type
  definitions and the neighbours' candidates. It asks for endpoints that keep no
  prompts, like `ai-usage-classify`.
- Over `TAGS_BUDGET_USD` for the month, without a key, or when the model fails, the
  neighbours' and the rule's chips still come back (`ai` says which happened).
- A note with no embedding yet is embedded first through `ai-embed-block` with the
  caller's token. A note whose first 10,000 characters look like a password, PIN,
  token or key is never embedded from here and never sent to the model. The items
  mode skips such items too (they get no tags), `ai-embed-block` does not embed
  such a note (`embed` answers `skipped: "credential"`, `embed-all` counts them in
  `skipped`), and the app runs the same check
  (`artifacts/app/src/lib/credential-check.ts`) before any AI action sends a note.
  `ai-embed-block` now imports `_shared/archive-tags.ts`, so deploy it with that file.

Without the migration the function still answers from the rule and the model; the
neighbours need `similar_archive_blocks` and the service role key.

### Archive AI actions

`ai-archive-expand` (Shorten, Expand), `ai-archive-clean` (Clean, and his own
prompt with `customPrompt`) and `ai-archive-multi` (Merge, Summarize and the other
presets over several notes) each have borders, stated once in
`artifacts/app/src/lib/archive-ai.ts` (`AI_ACTIONS`: the button tooltip and the
preview header) and given to the model here:

- Shorten: same meaning and language; every link, number, name, date and #tag kept;
  repetition and filler removed; nothing added.
- Expand: the model never sends his text back. It names where an explanation goes
  ("after paragraph N") and what it says; the note is put together in
  `_shared/archive-expand.ts`, every addition a marked block `> 💡 AI: …`, so his
  text stays character for character.
- Clean: typos, spacing and formatting only; it no longer splits the text into `---`
  items or adds `[note]`/`[link]` labels.
- Merge keeps every unique point, link, number and #tag; Summarize adds nothing.

Markdown is kept (the old "plain text only" rule is gone). A text longer than a
function takes (30,000 characters for Shorten/Expand, 60,000 for Clean and a prompt,
15,000 per note and 60,000 in all for several notes) is refused with a 413 instead of
being cut. Failures answer `{ error }` with a sentence the app shows as it is
(`_shared/ai-errors.ts`: rate limit, out of credits, a missing key, an empty answer).
Every result opens the preview in the app (word diff, the warnings from
`checkAIResult`, Replace / Save as new / Cancel); nothing is written unseen.

### Shared planner

`ai-mission-suggest` and `ai-path-suggest` both build their prompt with
`_shared/planner.ts`. It authenticates the caller, then reads their written
personal context (`user_context.notes`) plus a factual snapshot - today's
progress, 14 days of completions, tasks they keep skipping, active paths, the
Planning tree's open questions (with the user's guesses) and settled questions
(with the options they were chosen over), a separate tally of how often those
plan guesses held (`_shared/planning-lines.ts`), today's calendar, latest watch
numbers, and which past suggestions they accepted or rejected
(`ai_suggestion_log`). Everything degrades to silence if a table or column is
missing, so a partly set-up account still works.

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
