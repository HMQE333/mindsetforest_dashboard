

# Smarter Archive Inbox: Discord Cleanup + AI Split + Custom Prompt

## Problem
Right now "AI Organize" expects items already separated by `---`. But when pasting messy Discord logs (with usernames, timestamps, embed previews, image placeholders), the raw text is one big blob. The AI needs to clean it first, then split it intelligently.

## What Changes

### 1. New "AI Organize" behavior (clean + split, no save yet)
Instead of immediately saving blocks, AI Organize will:
- Take the **raw pasted text** (not pre-split by `---`)
- Clean Discord artifacts: remove usernames like "HMQE -- 13/02/2026 01:49", strip embed preview text, remove empty image placeholders
- Intelligently detect where one note/topic ends and another begins
- Classify content types: links, YouTube videos, text notes, code snippets, credentials/sensitive data
- Return the **cleaned and separated text** back into the textarea with `---` delimiters between items
- User can then review the split, edit if needed, and hit "Quick Save" or the full "AI Organize + Tag" button

### 2. New button: "AI Organize + Tag" (the old behavior, enhanced)
This button appears after items are split (when `---` delimiters exist). It:
- Takes the already-split items
- Auto-generates titles, pillar/direction tags, detects URLs
- Saves all blocks to the library
- Same as the current `ai-archive-process` function but with an improved prompt that also handles content type detection

### 3. New button: "AI by Prompt"
- Opens a small input field/modal where user types custom instructions
- Example: "Group by topic", "Remove all links", "Translate to English", "Extract only actionable items"
- Sends raw text + user prompt to AI
- Returns processed text back into the textarea (not saved automatically)

### 3. New edge function: `ai-archive-clean`
Dedicated function for the cleaning/splitting step with a smart prompt that:
- Strips Discord message headers (username + date patterns like `USERNAME -- DD/MM/YYYY HH:MM`)
- Removes link embed previews (the auto-generated title/description Discord adds below URLs)
- Keeps the actual URLs but removes embed metadata
- Removes empty lines from image-only messages
- Groups related consecutive messages into single items
- Separates genuinely different topics/notes with `---`
- Identifies content types and adds a small prefix tag like `[link]`, `[video]`, `[note]`, `[code]`

### 4. Updated Inbox UI flow
Three buttons in the toolbar:

| Button | What it does |
|--------|-------------|
| **Quick Save** | Saves items as-is (split by `---`), no AI |
| **AI Clean + Split** | Sends raw text to AI, returns cleaned text with `---` separators back into textarea |
| **AI Organize + Save** | Takes split items, AI adds titles/tags, saves to library |

Plus a smaller "AI by Prompt" button that lets user type custom processing instructions.

The preview section below updates live as `---` delimiters change.

---

## Technical Details

### New Edge Function: `supabase/functions/ai-archive-clean/index.ts`

Accepts `{ rawText: string, customPrompt?: string }` and returns `{ cleanedText: string }`.

The system prompt will instruct the AI to:
```
You clean and organize raw pasted notes, especially from Discord chat logs.

Rules:
1. Remove Discord message headers (patterns like "USERNAME -- DD/MM/YYYY HH:MM")
2. Remove link embed previews (auto-generated title + description that Discord shows below URLs) but KEEP the actual URLs
3. Remove empty messages that were just images (no text content)
4. Group related consecutive short messages into one note
5. Separate genuinely different topics with ---
6. For each separated item, add a content type tag at the start: [note], [link], [video], [code], [quote]
7. Clean up excessive whitespace and empty lines
8. Preserve the actual meaningful content -- don't summarize or change wording
9. If a message is just a URL, keep it as a [link] item
10. YouTube/video URLs get tagged as [video]
```

If `customPrompt` is provided, it replaces the default instructions (for the "AI by Prompt" feature).

### Modified: `src/components/archive/ArchiveInbox.tsx`

- Add `handleAIClean` function that calls `ai-archive-clean`, puts result back in textarea
- Add `handleAIByPrompt` with a small inline input for custom instructions
- Rename button labels for clarity
- Show item count badge that updates as text changes
- The "AI Organize + Save" button only appears when items are already split

### Modified: `supabase/functions/ai-archive-process/index.ts`

- Enhance the system prompt to better handle pre-cleaned content with type tags
- Add content_type field to the tool schema (link, video, note, code, quote)

### Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/ai-archive-clean/index.ts` | New edge function for cleaning/splitting raw text |

### Files to Modify

| File | Change |
|------|--------|
| `src/components/archive/ArchiveInbox.tsx` | Add new buttons, AI clean flow, custom prompt input |
| `supabase/functions/ai-archive-process/index.ts` | Enhanced prompt for better content type handling |
| `supabase/config.toml` | Register new `ai-archive-clean` function |

### Updated Button Layout
```text
[  AI Clean + Split  ]  [  AI by Prompt...  ]  [  Quick Save  ]  [  AI Organize + Save  ]
```

The "AI Organize + Save" button is highlighted/enabled only when items are properly split with `---`.

