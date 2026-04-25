---
name: Forest Module
description: Shared knowledge space inside Archive — plant/water/save seeds across visibility tiers; Daily, Discover, Collections, My seeds tabs.
type: feature
---
The "🌳 Forest" lives as a sub-tab of Archive and turns private blocks into shareable "seeds".

Sub-tabs:
- 🍃 Daily — curated 5/day swipeable card stack, 60% friends + 40% trending public, "seen" persisted in localStorage by UTC day; reset/re-shuffle button.
- 🔭 Discover — sortable feed (Trending, Newest, Watered, Saved, Friends), smart semantic search via ai-embed-block (action: search-forest), pillar/direction/tag filters, hide-saved toggle.
- 📚 Collections — curated bundles (5/day creation cap). Discover (public) + My collections tabs. Owner can add own seeds, toggle public/private, delete.
- 🌱 My seeds — author dashboard with Trophy stats (seeds, waters, saves, views), 4 achievements (First Seed / Grove Tender / Generous / Beloved), most-appreciated card, BlockedAuthorsList with unblock action.

Visibility per seed: public / friends (default) / custom audience picker.
Engagement: water (toggle), save (copies into Archive with from-forest tag + from_seed_id back-reference), report (with Block author shortcut).
Re-sync: when an author edits a seed, saved blocks show a pulsing Update badge that pulls the latest content.
Notifications: ForestInboxBell (top-right of Forest header) shows real-time friend_planted / seed_watered / seed_saved events with unread count.
Trending formula: water_count / (ageHours + 2)^1.5.
