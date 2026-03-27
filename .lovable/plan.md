

## Plan: Breathing Module — "Vessel of Air"

### Concept
A gamified breathing exercise tab themed around an ancient vessel/urn that fills with luminous air-energy. Rune symbols glow around the vessel as you breathe. The vessel animates — expanding on inhale, contracting on exhale, holding steady on hold. Visual style mirrors the Oracle tab's polish (floating glow, framer-motion animations, glass-card UI).

### Breathing Patterns (built-in)

| Pattern | Inhale | Hold | Exhale | Hold |
|---------|--------|------|--------|------|
| Equal | 4s | 0s | 4s | 0s |
| Box | 4s | 4s | 4s | 4s |
| 4-7-8 | 4s | 7s | 8s | 0s |
| Relaxing | 4s | 2s | 6s | 0s |

### The Vessel
- Large centered SVG/CSS vessel shape (urn silhouette) with rune symbols orbiting it
- Inner "air level" fills up during inhale (liquid-like wave animation), holds still, drains on exhale
- Concentric glow pulses outward matching the breath phase
- Phase label below: "breathe in" / "hold" / "breathe out" / text changes with fade
- Elapsed timer above the vessel (MM:SS)
- Phase progress dots below the label (like the reference screenshots)

### Runes
- 6 Unicode rune characters (ᚱ ᚢ ᚾ ᛖ ᛊ ᚨ) positioned in a circle around the vessel
- They glow/pulse in sequence during breathing cycles, creating an enchanted feel
- Rune brightness intensifies as session progresses (more "energy" accumulated)

### Session Flow
1. **Pattern selection screen** — 4 cards in a 2×2 grid (like reference image-56), each with name, description, icon, and a "Start" button. Duration selector (1min, 2min, 5min, 10min).
2. **Active session** — vessel animation, timer, phase label, stop button. Countdown shows at start (3, 2, 1).
3. **Session complete** — brief celebration, total time logged, streak count.

### Session Tracking (DB)
New table `breathing_sessions`:
- `id`, `user_id`, `pattern` (text), `duration_seconds` (int), `completed_at` (timestamptz)
- RLS: user_id = auth.uid()

Stats computed client-side: total sessions, total minutes, current streak (consecutive days).

### Files

1. **Migration** — `breathing_sessions` table
2. **`src/lib/breathing-data.ts`** — pattern definitions, rune constants
3. **`src/hooks/useBreathingState.ts`** — session logging, stats computation
4. **`src/components/breathing/BreathingView.tsx`** — main view (pattern select vs active session)
5. **`src/components/breathing/BreathingVessel.tsx`** — the animated vessel with runes, air fill, glow
6. **`src/components/breathing/BreathingSession.tsx`** — active session logic (timer, phase cycling, countdown)
7. **`src/components/breathing/BreathingPatternCard.tsx`** — card for pattern selection grid
8. **`src/components/breathing/BreathingStats.tsx`** — simple stats strip (sessions, minutes, streak)
9. **`src/pages/Index.tsx`** — add `"breathing"` tab
10. **`src/hooks/useUserSettings.ts`** — add to `DEFAULT_MODULES`
11. **`src/components/settings/ModulesTab.tsx`** — add module toggle

### Vessel Animation Details
- Inhale: inner fill rises from ~20% to ~90% height with a wave surface wobble, vessel glow intensifies
- Hold: fill stays, subtle shimmer, runes pulse slowly
- Exhale: fill descends back to ~20%, glow dims
- All transitions use `framer-motion` with duration matching the breath phase timing
- Color palette: soft teal/cyan for air energy (similar to reference), with the project's theme-adaptive approach

