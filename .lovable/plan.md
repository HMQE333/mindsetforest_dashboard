

# Archive: Knowledge Base with AI Powers

## Overview
Build a full-featured "Archive" tab that serves as a personal knowledge base -- styled consistently with the existing dark gamified dashboard. Users can capture notes (blocks), organize them by pillar/direction tags, search and filter, and use AI to expand ideas or process multiple selected notes.

## What Gets Built

### 1. Database Table: `archive_blocks`
A new table to store knowledge blocks with:
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL)
- `title` (text)
- `content` (text)
- `pillars` (text array) -- category tags matching dashboard categories (Body, Mind, Creation, etc.)
- `directions` (text array) -- purpose tags (Direction, Goals, Wisdom, Freedom, etc.)
- `tags` (text array) -- custom user tags
- `source_url` (text, nullable) -- auto-detected URLs
- `created_at`, `updated_at` (timestamps)

RLS policies: users can only CRUD their own blocks.

### 2. Three Sub-Views (Sidebar Navigation)

**Inbox** (default)
- Large textarea to paste/type content
- "Paste" button, "AI Organize" button (AI auto-tags the content), "Process" button
- Separates items by `---` delimiter, counts items
- Processing creates blocks and moves them to Library

**Library**
- Blocks grouped by pillar/direction tags (collapsible sections)
- Each block card shows: title (truncated), content preview, tags, date
- Search bar + sidebar filter by Pillars and Directions
- Click to open "Edit Block" modal

**Map** (placeholder for now)
- "Coming soon" placeholder matching dashboard style

### 3. Block Cards & Edit Modal
Each block card has action buttons:
- **Expand Idea** -- AI takes the note and generates an expanded version with deeper insights
- **Shorten** -- AI condenses the content
- **Organize** -- AI suggests better tags/pillars
- **Summarize** -- AI creates a summary

Edit modal (matching screenshot style):
- Title input
- Content textarea with AI action buttons (Shorten, Organize, Summarize)
- Pillar tag selector (toggleable chips matching dashboard categories)
- Direction tag selector (toggleable chips)
- Custom tags input
- Delete, Cancel, Save buttons

### 4. Multi-Select + AI Prompt
- Checkbox on each block card for multi-select
- When 2+ blocks selected, a floating action bar appears at the bottom
- "Run AI Prompt" button opens a modal where user types what they want to do with selected notes
- AI processes all selected notes together (e.g., "find common themes", "create action plan", "merge into one")
- Result displayed in a modal with option to save as new block

### 5. AI Edge Functions

**`ai-archive-process`** -- Processes raw inbox text:
- Auto-generates title from content
- Suggests pillar and direction tags
- Detects URLs

**`ai-archive-expand`** -- Expands/shortens/summarizes a single note:
- Takes content + action type (expand/shorten/summarize/organize)
- Returns transformed content or tag suggestions

**`ai-archive-multi`** -- Processes multiple selected notes:
- Takes array of note contents + user prompt
- Returns AI response as new content

### 6. Connection to Dashboard
- The pillar tags in Archive match the 8 dashboard categories (Mind, Body, Creation, etc.)
- Archive block count shown in the tab label or header
- Direction tags provide a second dimension of organization (Goals, Wisdom, Freedom, Protection, Creation, Expression, Community)

---

## Technical Details

### Files to Create

| File | Purpose |
|------|---------|
| `src/components/archive/ArchiveView.tsx` | Main archive component with sidebar + sub-views |
| `src/components/archive/ArchiveInbox.tsx` | Inbox paste/process view |
| `src/components/archive/ArchiveLibrary.tsx` | Library view with grouped blocks |
| `src/components/archive/ArchiveBlockCard.tsx` | Individual block card with action buttons |
| `src/components/archive/ArchiveEditModal.tsx` | Edit block modal |
| `src/components/archive/ArchiveAIPromptModal.tsx` | Multi-select AI prompt modal |
| `src/hooks/useArchiveState.ts` | Hook for CRUD operations on archive_blocks |
| `src/lib/archive-data.ts` | Constants for pillars, directions, default tags |
| `supabase/functions/ai-archive-process/index.ts` | AI inbox processing |
| `supabase/functions/ai-archive-expand/index.ts` | AI expand/shorten/summarize |
| `supabase/functions/ai-archive-multi/index.ts` | AI multi-note processing |

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/Index.tsx` | Replace "Archive coming soon" placeholder with `<ArchiveView />` |

### Database Migration
```sql
CREATE TABLE public.archive_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  pillars text[] NOT NULL DEFAULT '{}',
  directions text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.archive_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blocks" ON public.archive_blocks
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own blocks" ON public.archive_blocks
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own blocks" ON public.archive_blocks
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own blocks" ON public.archive_blocks
  FOR DELETE USING (auth.uid() = user_id);
```

### UI Style
- Same glass-card, gradient-purple, glow effects as existing dashboard
- Sidebar with Inbox/Library/Map navigation (green accent for active item matching screenshots)
- Block cards use `glass-card` with `border-white/10`
- AI buttons use the same gradient-purple styling
- Tag chips colored to match their respective category colors from `CATEGORIES`
- Framer Motion animations consistent with existing views

### Data Flow
```text
User pastes text in Inbox
  --> clicks "Process" or "AI Organize"
  --> Edge function auto-tags and splits
  --> Blocks saved to archive_blocks table
  --> Appear in Library grouped by pillar

User clicks block card
  --> Edit modal opens
  --> Can use AI actions (expand, shorten, etc.)
  --> Save updates the block

User selects multiple blocks
  --> Floating bar appears
  --> "AI Prompt" opens modal
  --> User types instruction
  --> AI processes all selected notes
  --> Result shown, can save as new block
```

