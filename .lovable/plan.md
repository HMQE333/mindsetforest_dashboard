

## Current State

The Digest feature filters archive blocks by **spaced repetition intervals** (1, 3, 7, 14, 30, 60, 90 days from creation, ±1 day tolerance). Matching blocks are shuffled and shown as flashcards — tap to reveal content, prev/next to navigate. No state is persisted; no review tracking.

**Weaknesses:**
- No tracking of what you've reviewed — refreshing resets progress
- Creation-date-only intervals mean most blocks rarely surface (only if you happen to check on the right day)
- No interaction beyond "reveal" — no way to rate, skip, or act on a block
- Cards feel static — just title → content, no richness

---

## Improvement Plan

### 1. Review Tracking with Database
Add a `block_reviews` table to persist when a block was last reviewed and a simple quality rating (1-3: forgot / vague / remembered). Use this to drive smarter resurfacing instead of creation-date-only intervals.

**DB migration:**
- Create `block_reviews` table: `id`, `user_id`, `block_id`, `rating` (int), `reviewed_at` (timestamptz), with RLS policies
- The spaced repetition algorithm shifts to: next review = last_review + interval based on rating (forgot=1d, vague=3d, remembered=interval×2)

### 2. Swipe-Style Rating UX
Replace prev/next with a **3-action card interaction**:
- **"Forgot" (left)** — reschedule soon (red tint flash)
- **"Vague" (down)** — reschedule medium (yellow)  
- **"Got it" (right)** — push further out (green flash)

Each action auto-advances to next card with a satisfying animation. Progress bar fills as you complete reviews.

### 3. Session Summary
When all due cards are reviewed, show a **completion screen**:
- Total reviewed count
- Streak indicator (consecutive days with reviews)
- "You reviewed 8 blocks — 5 remembered, 2 vague, 1 forgot"
- Motivational message

### 4. Richer Card Display
- Show block **type icon** (📝 note, 🔗 link, 🖼️ image) and **source URL** if it's a link
- Add a subtle **interval badge** ("Review #3 · 14d interval") so users understand the system
- Keyboard nav: `1/2/3` keys for rating, `Space` to reveal

### Files

| File | Action |
|------|--------|
| `block_reviews` table | Create via migration |
| `src/hooks/useDigestState.ts` | Create — fetch reviews, compute due blocks, save ratings |
| `src/components/archive/ArchiveDigestView.tsx` | Rewrite — swipe rating UI, session summary, richer cards |
| `src/components/archive/ArchiveView.tsx` | Edit — pass new hook data to Digest |

