

## Plan: Add New Breathing Patterns

### What fits the current system
The existing engine cycles through inhale → hold → exhale → hold with fixed durations. These patterns map cleanly:

| Pattern | In | Hold | Out | Hold | Icon | Description |
|---|---|---|---|---|---|---|
| **Alternate Nostril** (Nadi Shodhana) | 4 | 2 | 4 | 2 | 🫁 | Yogic balance — alternate nostrils each cycle |
| **Coherent Breathing** | 5 | 0 | 5 | 0 | 💓 | 6 breaths/min for heart rate variability |
| **Wim Hof Power Round** | 2 | 0 | 2 | 0 | 🧊 | Rapid deep cycles — energizing & alkalizing |
| **Physiological Sigh** | 2 | 1 | 8 | 0 | 😮‍💨 | Double-inhale + long exhale for instant calm |

> Kapalabhati and Holotropic are too rapid/unstructured for a timed vessel model — skipping those.

### Changes

**File: `src/lib/breathing-data.ts`** — Add 4 new entries to `BREATHING_PATTERNS` array.

**File: `src/components/breathing/BreathingView.tsx`** — The grid already maps over the array, so no changes needed. The `sm:grid-cols-2` layout will accommodate 8 cards naturally.

### No DB or migration changes needed
Pattern IDs are stored as strings in `breathing_sessions.pattern` — new IDs just work.

