## Goal
Expand the "How It Works" section on the unauthenticated landing page (`src/components/landing/GuideSection.tsx`) so it advertises the modules added since the original 6 cards were written. Right now it only mentions Categories, ADHD-friendly design, XP/RPG, Stats, Ladder/Loops and Oracle — none of the newer pillars are visible to first-time visitors.

## Scope
**Single file edit:** `src/components/landing/GuideSection.tsx`

No other files, no DB, no routing, no logic. Pure marketing copy + card data array additions. Zero risk.

## What to add
Append 6 new cards to the `GUIDE_CARDS` array (kept in current order so the original "core" pitch reads first). The grid is already `md:grid-cols-2` so 12 total cards = 6 rows on desktop, fully responsive on mobile.

Proposed new cards (copy below — concise, on-brand, follows existing "punchy + flexibility-positive" tone):

1. **🧠 Planning Mindboard**
   *"Map your goals from vision to next-action. A nested mind-map (Goal → Phase → Task → Action) connects everything to your Ladder and Habit Loops. Think big, then zoom in."*
   `glow: "from-cat-mind/20"`

2. **📦 Archive: Your Second Brain**
   *"Capture ideas, links and images from anywhere. Smart semantic search finds what you meant — not just what you typed. Tag by pillar, revisit via spaced repetition."*
   `glow: "from-cat-exploration/20"`

3. **🌳 Forest: Knowledge, Shared**
   *"Plant your best ideas as seeds. Friends and the public can water and save them. A quiet social layer for growth — no doomscrolling, just signal."*
   `glow: "from-emerald-500/20"`

4. **🍳 Cooking Studio**
   *"AI cleans messy recipes into clear steps and gram-accurate ingredients. Plan meals, build shopping prompts, and turn cooking into a calm ritual."*
   `glow: "from-cat-body/20"`

5. **💰 Finance, Without the Anxiety**
   *"Track cash flow, subscriptions and loans with a 6-month savings curve. Numbers you can face — designed to inform, not to shame."*
   `glow: "from-cat-creation/20"`

6. **📚 Library, 📅 Calendar & 🌬️ Breathe**
   *"A reading list that respects your pace. A minimalist calendar for what truly matters. And a breathing vessel for when the mind needs air."*
   `glow: "from-cat-spirit/20"`

## Visual / layout notes
- Reuse the existing card structure exactly — same animation stagger (`delay: 0.4 + i * 0.1`), same glassmorphic style, same gradient lines.
- Glow tokens used (`cat-mind`, `cat-exploration`, `cat-body`, `cat-creation`, `cat-spirit`, plus `emerald-500` for Forest) are all defined in the existing Tailwind config / index.css and already used elsewhere.
- With 12 cards the stagger total reaches ~1.5s — acceptable. If it feels long during QA we can switch to `Math.min(i, 5) * 0.08` to cap it. Will mention in the implementation step.
- Section subtitle stays "Your life. Your rules. Your adventure." (still accurate).

## Out of scope
- No changes to `src/pages/Index.tsx` or auth gate logic.
- No new images, icons, or memory files.
- No copy changes to the original 6 cards (user only asked to *add*).

## Risk
Effectively zero — display-only addition to a static array on an unauthenticated marketing surface.
