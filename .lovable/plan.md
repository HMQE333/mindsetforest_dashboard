

## Polish Breathing Module & Per-Pattern Visual Identity

### Concept

Each breathing pattern gets a unique **color accent** and **recommended default effects** so they feel distinct during a session, while keeping the user's manual effect toggles respected.

### Changes

**1. Pattern-specific color themes** (`src/lib/breathing-data.ts`)

Add a `hue` and `mood` to each pattern:

| Pattern | Hue | Mood color |
|---------|-----|-----------|
| Equal Breath | 185 (teal) | Calm balance |
| Box Breathing | 220 (steel blue) | Disciplined |
| 4-7-8 | 260 (violet) | Sleepy/deep |
| Relaxing Flow | 160 (mint) | Soft/natural |
| Alternate Nostril | 35 (amber) | Warm/yogic |
| Coherent | 330 (rose) | Heart-centered |
| Wim Hof | 200 (ice blue) | Energizing/cold |
| Physiological Sigh | 280 (lavender) | Instant relief |

Each pattern also gets a `suggestedEffects` array (e.g., Wim Hof → particles + sparks; 4-7-8 → sigil; Box → rotating-runes).

**2. Pass pattern hue into BreathingVessel** (`BreathingSession.tsx` → `BreathingVessel.tsx`)

- Add a `hue` prop to `BreathingVessel`
- Replace all hardcoded `hsl(185, ...)` colors with the dynamic hue so the glow, fill gradient, rune highlights, wave surface, and sparks all shift per pattern
- Adjust gradient stops for the air fill to use the pattern's hue

**3. Pattern-specific ambient behavior** (`BreathingVessel.tsx`)

- **Wim Hof**: Faster wave oscillation (rapid breathing), more particles, slight vessel shake
- **4-7-8 / Relaxing**: Slower, gentler wave, deeper glow bloom during long exhale
- **Physiological Sigh**: Double-pulse on inhale (two quick fills then slow drain)
- **Box Breathing**: Crisp phase transitions with a brief flash at each corner
- **Coherent**: Smooth sinusoidal fill, subtle heartbeat pulse on the vessel outline

Implemented via a `patternBehavior` config object derived from `pattern.id` inside `BreathingVessel`, controlling:
- Wave `rx` animation speed
- Glow intensity multiplier
- Optional vessel scale pulse
- Fill easing curve

**4. Visual polish pass** (`BreathingVessel.tsx` + `BreathingSession.tsx`)

- Add a subtle radial gradient background behind the vessel that uses the pattern hue (soft vignette)
- Smooth the phase label transition (crossfade instead of slide)
- Add a gentle pulse animation to the active phase dot
- Make the progress bar gradient match the pattern hue
- Add a faint "breath sound" visual indicator — a small animated ring that expands on inhale and contracts on exhale around the vessel

**5. Pattern card polish** (`BreathingView.tsx`)

- Add a subtle left-border accent on each pattern card using its hue color
- On hover, show a faint glow matching the pattern's hue
- Add the pattern's suggested effects as tiny dot indicators on the card

### Files Modified

| File | Changes |
|------|---------|
| `src/lib/breathing-data.ts` | Add `hue`, `suggestedEffects` to `BreathingPattern` |
| `src/components/breathing/BreathingVessel.tsx` | Dynamic hue prop, pattern-specific behaviors, visual polish |
| `src/components/breathing/BreathingSession.tsx` | Pass hue, polish phase labels/dots/progress bar, breath ring |
| `src/components/breathing/BreathingView.tsx` | Pattern card accent colors, hover glows |

No backend or database changes needed.

