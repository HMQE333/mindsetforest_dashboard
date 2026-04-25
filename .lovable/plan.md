# 🌳 Forest — Shared Second-Brain inside Archive

A new sub-tab in **Archive** where users can publish private blocks as "seeds" into a shared knowledge ecosystem. Notes can be shared with **🌍 Everyone**, **🤝 All friends**, or **🎯 Specific people**, and stay fully reversible. Other users can browse, sort by trending/contribution, save seeds back into their own Archive, and "💧 water" (appreciate) seeds.

This is structured into **5 phases** so we ship value incrementally and keep risk low.

---

## 🎯 Core Principles

1. **Privacy-first** — nothing public by default. Each Forest entry is a *derived copy* of a private `archive_blocks` row; the source stays untouched.
2. **Reversible** — unpublish instantly removes the seed from public view. (Copies others have already saved into their own Archive remain theirs — that's the expected "knowledge spread" behavior.)
3. **Reliable & secure** — strict RLS using the existing `public.are_friends()` SECURITY DEFINER (no recursive policies). We never expose emails — only `username`, `display_name`, `avatar_emoji` from `user_profiles`.
4. **Aligned with existing data model** — reuses the 8 pillars + 8 directions + tags taxonomy and the `friendships` table.
5. **Smart connections** — wires into friends inbox, semantic embeddings, saved tags, achievements, and the Digest tab.

---

## 🗂 Data Model (new tables)

### `forest_seeds`
Public/semi-public publications derived from a private `archive_blocks` row.
```
id              uuid PK
author_id       uuid (auth user)
source_block_id uuid (nullable — for re-sync; nullable so deleting source doesn't kill seed)
title           text
content         text
pillars         text[]
directions      text[]
tags            text[]
source_url      text
visibility      text CHECK IN ('public','friends','custom')
language        text default 'en'
is_active       boolean default true   -- soft unpublish
water_count     int default 0          -- denormalized
save_count      int default 0          -- denormalized
view_count      int default 0
embedding       vector(1536) nullable  -- pgvector for semantic search
published_at    timestamptz default now()
updated_at      timestamptz default now()
```

### `forest_seed_audience`
Per-user allowlist when `visibility='custom'`.
```
seed_id uuid (→ forest_seeds.id, on delete cascade)
user_id uuid
PRIMARY KEY (seed_id, user_id)
```

### `forest_waters`
Upvote/appreciation. One per (seed, user).
```
id uuid PK
seed_id uuid (→ forest_seeds.id, on delete cascade)
user_id uuid
created_at timestamptz default now()
UNIQUE (seed_id, user_id)
```

### `forest_saves`
Tracks when a viewer copies a seed into their own Archive (a new private `archive_blocks` row tagged `from-forest`).
```
id uuid PK
seed_id uuid (→ forest_seeds.id, on delete cascade)
user_id uuid
saved_block_id uuid
created_at timestamptz default now()
UNIQUE (seed_id, user_id)
```

### `forest_reports`
Moderation flags. (Phase 5.)
```
id uuid PK
seed_id uuid (→ forest_seeds.id, on delete cascade)
reporter_id uuid
reason text
created_at timestamptz default now()
UNIQUE (seed_id, reporter_id)
```

### Triggers
- `updated_at` auto-bump on `forest_seeds`.
- Denorm counters: triggers on `forest_waters` / `forest_saves` (insert ➕1, delete ➖1).
- `view_count` bumped only via SECURITY DEFINER RPC `forest_view_seed(seed_id)` — never client-writable.
- A `BEFORE UPDATE` trigger on `forest_seeds` resets `water_count`/`save_count`/`view_count` to OLD values unless changed by the trigger system path (defense in depth).

---

## 🔒 RLS & Security

### `forest_seeds`
- **SELECT** (single policy):
  ```
  is_active = true
  AND (
       visibility = 'public'
    OR (visibility = 'friends' AND public.are_friends(auth.uid(), author_id))
    OR (visibility = 'custom'  AND EXISTS (SELECT 1 FROM forest_seed_audience
                                            WHERE seed_id = id AND user_id = auth.uid()))
    OR author_id = auth.uid()
  )
  ```
- **INSERT/UPDATE/DELETE**: only `author_id = auth.uid()`.

### `forest_seed_audience`
- All ops: only the seed owner (verified via subquery to `forest_seeds`). Viewers never need to read this row directly.

### `forest_waters` / `forest_saves`
- **SELECT**: any authenticated user (so we can later show "💧 12 friends watered this").
- **INSERT/DELETE**: only `user_id = auth.uid()`.
- INSERT additionally requires the target seed to be visible to the actor — enforced by a small SECURITY DEFINER helper `public.can_view_seed(seed_id)` used inside a `CHECK`/trigger.

### `forest_reports`
- **INSERT**: any authenticated user with `reporter_id = auth.uid()`.
- **SELECT**: only the reporter (admin role added later, separately).

### Recursion-safety
All cross-table policies go through the existing `public.are_friends()` SECURITY DEFINER and the new `public.can_view_seed()` helper — no recursive policy lookups.

### Rate limits
- `BEFORE INSERT` trigger on `forest_seeds`: cap **20 publishes/day per user**.
- `BEFORE INSERT` trigger on `forest_reports`: cap **30 reports/day per user**.

---

## 🌿 PHASE 1 — Foundation: Plant & Browse (MVP)

**Goal**: publish a seed from Archive → friends/public can browse it → save back to their Archive.

### Backend
- One migration creating all 5 tables + RLS + triggers + denorm counters + `can_view_seed()` helper + `forest_view_seed()` RPC.
- Edge function `forest-publish-seed` — `{ blockId, visibility, audienceUserIds, edits? }`. Validates ownership, copies content into `forest_seeds`, writes audience rows, fires embedding (reuse `ai-embed-block` pattern).
- Edge function `forest-save-seed` — `{ seedId }`. Verifies visibility via `can_view_seed`, creates a private `archive_blocks` row in caller's account tagged `from-forest` with a back-reference, inserts a `forest_saves` row.

### Frontend
- New nav item in `ArchiveView.tsx`: `🌳 Forest` (after Digest). Clears selection on switch.
- New `src/components/archive/ArchiveForestView.tsx` with two inner tabs: **Discover** (default) and **My Seeds**.
- **Plant a Seed** entry points:
  1. `ArchiveBlockCard` — `🌱 Plant` button alongside the existing AI action row.
  2. Bulk floating bar in `ArchiveView.tsx` — `🌱 Plant N seeds`.
- New `PlantSeedModal`:
  - Edit title/content/pillars/directions/tags one last time.
  - Pick **Visibility**: 🌍 Everyone / 🤝 All friends / 🎯 Specific friends (multi-select chips of `useFriends().accepted`).
- New `useForestState` hook (mirrors `useArchiveState`): `mySeeds`, `discoverSeeds`, `plantSeed`, `unpublishSeed`, `updateSeed`, `saveSeed`, `waterSeed`/`unwaterSeed`, `reportSeed`, `recordView`.
- Discover feed: card grid (variant of `ArchiveBlockCard`) showing avatar + @username, pillars, directions, tags, water count, save count. Card actions: `📥 Save`, `💧 Water`, `🚩 Report`, `👁 Read`.
- My Seeds: same cards with `✏️ Edit`, `🔓 Change visibility`, `🌑 Unpublish`, plus per-seed view/water/save stats.

### Smart connections in Phase 1
- **Friends Inbox** — when a friend plants a seed visible to you, surface it in the existing Friends Sheet's Inbox tab (new `source: "forest"` value in `friend_suggestions`). Accepting routes through the existing pillar/project picker we just built.
- **Achievements** — 3 new badges computed client-side: `🌱 First Seed` (1 published), `🌳 Grove Tender` (10 published), `💧 Generous` (50 waters given).

---

## 🌿 PHASE 2 — Discovery & Sorting

- **Sort modes** in Discover:
  - 🔥 Trending — `water_count / pow(hours_since_publish + 2, 1.5)`
  - 🆕 Newest
  - 💧 Most watered (all-time)
  - 📥 Most saved (all-time)
  - 🤝 From friends — filter by `author_id IN (my friend ids)`
- **Filters** (pill row mirroring Library): pillar chips, direction chips, tag search, language, "hide already-saved".
- **Smart Search** toggle reusing `ai-embed-block` extended with `action: "search-forest"` querying `forest_seeds.embedding` scoped by visibility.
- **Author peek**: clicking an avatar opens a lightweight popover with username, avatar, total seeds, total waters received.
- Tasteful empty state with "Plant your first seed" CTA.

---

## 🌿 PHASE 3 — Curation & Personal Forest

- **My Forest dashboard** at the top of My Seeds:
  - Totals (seeds / waters received / times saved) + "your most appreciated seed" highlight.
  - Contribution heatmap reusing `TrackerActivityPulse` renderer (seeds-per-day, last 12 months).
- **Collections** — small `forest_collections` table; one seed can belong to multiple collections; each collection has its own visibility so you can publish curated bundles.
- **Re-sync** — when source `archive_blocks.updated_at > seed.updated_at`, show a `↻ Sync from source` hint on the seed card for one-click update.

---

## 🌿 PHASE 4 — Engagement Loops & Notifications

- Reuse `user_notifications` (add a `source` column) instead of a new table.
- Triggers on `forest_waters` and `forest_saves` insert → coalesced notification to the seed author ("3 friends watered *Atomic Habits notes* today").
- Friends button bell badge already exists via `f.badgeCount` — extend with unread Forest notifications.
- New `🌳 From the Forest` section inside `ArchiveDigestView` surfacing 3-5 friend seeds matching your pillars/directions, ranked by semantic similarity to your recent reading.

---

## 🌿 PHASE 5 — Trust & Safety

- **Report flow** UI: 🚩 opens modal with reasons (Spam, Hate/Abuse, Adult, Off-topic, Other + free text).
- **Auto-throttle**: ≥5 distinct reports in 24h → trigger flips `is_active = false` automatically. Author sees "🔒 Hidden pending review" with an Appeal action.
- **Mute author** — small `forest_mutes` table; viewer-side only, doesn't affect friendships.
- **Content limits** in `forest-publish-seed`: title ≤ 200, content ≤ 8000, max 12 tags, strip raw HTML as defense-in-depth (we render plain text, but stripping at the edge is cheap insurance).
- **Right to delete** — unpublishing cascades `forest_waters` / `forest_saves` join rows; saved-into-archive copies stay with their owners (this is the documented expected behavior).

---

## 🔌 Integration Map

| Existing system | How Forest connects |
|---|---|
| `archive_blocks` | Source of seeds — private rows untouched. |
| `usePillars` + `DIRECTIONS` | Same taxonomy → seamless cross-tab filtering. |
| `friendships` + `are_friends()` | Visibility scope `friends` + "From friends" sort. |
| `friend_suggestions` (Inbox) | New `source: "forest"` value surfaces freshly-planted friend seeds. |
| `user_profiles` | Author cards (username + avatar only — never email). |
| `ai-embed-block` edge function | Extended with `action: "search-forest"` for semantic Forest discovery. |
| `user_saved_tags` | Tag picker in `PlantSeedModal` reuses the cross-module Tag Library popover. |
| `TrackerActivityPulse` | Reused for the My Forest contribution heatmap. |
| `ArchiveDigestView` | New "🌳 From the Forest" section in Phase 4. |
| `user_notifications` | Reused (with `source` column) for Forest engagement notifications. |
| Achievements (`TrackerAchievements`) | New badges: First Seed / Grove Tender / Generous / Beloved. |

---

## 📋 Suggested Build Order

1. **Phase 1** — DB migration + edge functions + Forest tab + Plant flow + Discover/MySeeds basics. (Biggest single chunk, ships a usable MVP.)
2. **Phase 2** — Sort + filter + semantic Forest search + author peek.
3. **Phase 3** — My Forest dashboard + collections + re-sync.
4. **Phase 4** — Notifications + Digest integration.
5. **Phase 5** — Reports + mute + auto-throttle + content hardening.

After Phase 1, every later phase is independently shippable.

---

## ❓ Decisions to confirm before I start coding Phase 1

I'll ask these via a short multiple-choice step right after you approve, so we lock in the right defaults before the migration:

1. **Default visibility** when planting — `🤝 All friends` (safer) vs `🌍 Everyone` (faster network growth). Recommended: **friends**.
2. **Edit-after-publish** — allow free edits with an "edited" badge, vs freeze content after publish (only unpublish + re-publish). Recommended: **allow free edits**.
3. **Anonymous seeds** — publish without showing your username. Recommended: **not in MVP**, revisit in Phase 5.
4. **Save linkage** — store back-reference from the saved Archive block to the original seed (enables future "↻ Update available" hints) vs no link (clean copy). Recommended: **store back-reference, never auto-overwrite**.