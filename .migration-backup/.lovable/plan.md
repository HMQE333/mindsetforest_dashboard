## Goal
Wire the Stats Tracker into the main XP economy: every logged entry and every unlocked achievement awards XP to the dashboard, with a polished Settings tab where the user fully controls the rewards.

## What you'll see in the Tracker

1. **XP gain on every log** — submitting a value through `TrackerInputModal` awards XP based on a per‑metric formula. The existing floating "+N ✓" animation becomes a true "+XP" burst tied to dashboard XP.
2. **Milestone XP** — when an achievement unlocks (Week Warrior, 100 Club, Bookworm, etc.), a celebratory modal pops with the badge, milestone name, and XP awarded. One‑time grant per achievement, persisted so refreshes don't double‑pay.
3. **XP overview chip** in the Tracker header showing total XP earned from stats and current level — keeps the user oriented without leaving the page.
4. **Badge cards** in the Achievements panel show their XP value (e.g. "+150 XP") and a "Claimed ✓" mark once granted.

## What you'll see in Settings

A new **"Stats XP"** tab in the settings modal, structured like the existing Rewards tab for consistency:

- **Per‑Metric Rewards** section — list of every tracker metric (Push‑ups, Pages Read, Study Hours…) with two controls each:
  - `XP per unit` (e.g. 0.5 XP per push‑up, 5 XP per hour)
  - `XP per log` flat bonus (e.g. +2 XP just for logging)
  - Live preview: "Logging 20 push‑ups → +12 XP"
- **Milestone Rewards** section — every achievement listed with an editable XP field (default values pre‑filled by tier: Tiny 25 / Small 50 / Medium 150 / Big 400 / Legendary 1000).
- **Global toggles**: master "Enable stats XP", "Cap daily stats XP at N" (anti‑grind), "Award milestone XP retroactively for already‑unlocked achievements".
- **Reset to defaults** button (mirrors RewardsTab pattern).
- Dirty‑state save banner identical to other settings tabs.

## Technical Details

**Data model**
- New JSONB column `tracker_xp_config` on `user_metrics`‑style settings (extend `useUserSettings`) holding `{ enabled, dailyCap, perMetric: { [metricId]: { perUnit, perLog } }, milestones: { [achievementId]: xp }, retroactive }`.
- New table `tracker_xp_grants(user_id, source, ref_id, xp, granted_at)` to record both per‑log grants (for daily cap accounting) and milestone grants (for idempotency, keyed by `ref_id = achievementId`). RLS: owner‑only; standard public‑schema GRANTs.

**Code**
- `src/lib/tracker-xp.ts` — pure helpers: `computeEntryXp(metric, value, cfg)`, `defaultMilestoneXp(achievementId)`, `DEFAULT_TRACKER_XP_CONFIG`.
- `src/hooks/useTrackerXp.ts` — loads config + grants, exposes `awardEntryXp(metricId, value)` and `awardMilestoneXp(achievementId)`; both call `useDashboardState`'s XP setter and insert a grants row. Enforces daily cap and idempotency.
- `useTrackerEntries.addEntry` → after insert, call `awardEntryXp` and return XP delta so `Tracker.tsx` can animate the real number.
- `TrackerAchievements.tsx` → effect compares unlocked set vs `tracker_xp_grants` rows; for any newly unlocked one calls `awardMilestoneXp` and triggers a milestone modal (`TrackerMilestoneModal.tsx`, new, reuses LevelUpModal styling).
- `src/components/settings/StatsXpTab.tsx` — new tab, registered in `SettingsModal.tsx` alongside Rewards.
- Header XP chip: small component reading `dashboardState.currentXP` and grants from today.

**Migration order** (single migration): create table → GRANTs → enable RLS → policies → add JSONB column.

## Out of scope
- No changes to dashboard mission XP math.
- No changes to Oracle/sacrifice flow.
- No new tracker metrics or UI restructuring outside the additions above.
