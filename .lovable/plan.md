

# Achievements Tab for Stats Tracker

## What We're Building

A new collapsible "Achievements" section at the bottom of the Stats page (after the Recent Log), displaying unlockable badges computed from the user's real tracker entries and dashboard state. Badges progress from locked → in-progress → unlocked with satisfying animations. No new database tables needed — all achievements are computed client-side from existing data.

## Achievement Definitions

Achievements will be grouped into tiers across these themes:

**Consistency (streak-based)**
- 🔥 First Spark — Log anything for 1 day
- 🔥 Week Warrior — 7-day streak
- 🔥 Monthly Machine — 30-day streak
- 🔥 Century Club — 100-day streak

**Volume (total entries)**
- 📝 First Log — Record 1 entry
- 📝 Getting Started — 10 total entries
- 📝 Dedicated — 100 total entries
- 📝 Data Monster — 500 total entries

**Category Coverage**
- 🌈 Explorer — Log in 3 different categories
- 🌈 Polymath — Log in all 6 categories
- 🌈 Category King — 50+ entries in one category

**Specific Milestones**
- 💪 100 Club — 100 total push-ups
- 📖 Bookworm — 500 pages read
- ⏱️ Time Lord — 100 total hours logged (any hour metric)
- 🎯 Sharpshooter — 50 good trade setups

**Meta / Fun**
- ⭐ Early Bird — Log before 8 AM (based on createdAt)
- 🦉 Night Owl — Log after 11 PM
- 🏆 Perfectionist — Habit score of 100% on any metric

## UI Design

- Same collapsible pattern as "Detailed Stats" and "Calendar" (glass-card, chevron toggle)
- Header: "🏆 Achievements" with count "X / Y unlocked"
- Grid of badge cards (3 columns on desktop, 2 on mobile)
- Each badge card shows:
  - Emoji icon (greyed out if locked, full color if unlocked)
  - Badge name
  - Description
  - Progress bar (e.g., "42 / 100 push-ups")
  - Unlocked state: subtle glow + checkmark
- Unlocked badges float to the top, in-progress next, locked last

## Technical Plan

### New file: `src/components/TrackerAchievements.tsx`
- Receives `entries: TrackerEntry[]` as prop
- Defines achievement definitions array with `id`, `icon`, `title`, `description`, `check` function, `progress` function
- Each `check(entries)` returns boolean (unlocked or not)
- Each `progress(entries)` returns `{ current: number, target: number }`
- Renders collapsible card with badge grid
- Uses framer-motion for staggered entrance animations
- Uses existing `glass-card`, `bg-secondary/40`, and category color classes

### Modified file: `src/pages/Tracker.tsx`
- Import and render `<TrackerAchievements entries={entries} />` after `<TrackerRecentLog>`

### No database changes
All computed from existing `tracker_entries` data passed as props.

