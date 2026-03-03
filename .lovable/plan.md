

## Plan: Add plain-text formatting rules to all AI edge functions

The AI models default to markdown formatting (###, **, ", bullet lists with `*`, etc.) which looks noisy in your app's UI since you display raw text, not rendered markdown.

### Fix
Add a formatting constraint to the system prompt in every edge function that returns user-facing text. The instruction:

> "FORMATTING: Write in plain text only. Do not use markdown symbols like ###, **, `, >, or *. Use simple line breaks and dashes (-) for structure. Keep it clean and readable as raw text."

### Files to change (8 edge functions)

| File | Where |
|------|-------|
| `supabase/functions/ai-archive-expand/index.ts` | Append to each `actionPrompts` value (expand, shorten, summarize) |
| `supabase/functions/ai-archive-multi/index.ts` | Append to the system prompt + each preset prompt |
| `supabase/functions/ai-archive-clean/index.ts` | Append to `defaultSystemPrompt` |
| `supabase/functions/ai-archive-process/index.ts` | Append to system prompt |
| `supabase/functions/ai-mission-suggest/index.ts` | Append to system prompt |
| `supabase/functions/ai-split-task/index.ts` | Append to system prompt |
| `supabase/functions/ai-habit-loop-suggest/index.ts` | Append to system prompt |
| `supabase/functions/ai-ladder-suggest/index.ts` | Append to system prompt |

Each change is a one-line addition to existing prompt strings. No logic or schema changes needed.

