

## Infinite Customization via 4 Sliders

The current system already has ~350,000 discrete combos (10×8×11×5×6×10×8). But they're all presets — users can only pick from what we defined. Adding just **4 sliders** to existing collapsible sections turns discrete choices into continuous ranges, making combos effectively infinite while adding almost zero UI surface.

### What to add

**1. Custom Accent Hue Slider** (in Accent Color section)
- A single 0–360 hue slider below the 8 preset chips
- Selecting a preset snaps the slider; dragging the slider deselects presets
- Stores as `customAccentHue: number | null` in preferences
- CSS: sets `--primary` and related tokens to `customAccentHue, 70%, 58%` instead of preset values
- Goes from 8 options → 360 options

**2. Card Opacity Slider** (in Card Style section)  
- Range 0.05–1.0, default varies by card style (~0.6 for glass, 1.0 for solid)
- Controls `--glass-opacity` CSS variable used by `.glass-card` background alpha
- Lets users make any card style more transparent or more opaque
- Small label: "Opacity" with percentage readout

**3. Background Intensity Slider** (in Background section, only visible when pattern ≠ "none")
- Range 0.1–1.0, controls canvas `globalAlpha` for animated backgrounds and CSS `opacity` for static ones
- Lets users dial fireflies from barely-there to prominent, snow from light flurry to blizzard
- Small label: "Intensity" with percentage readout

**4. Border Radius Slider** (in Card Frame section)
- Range 0–24px, default 12px (current `--radius: 0.75rem`)
- Sets `--radius` CSS variable globally
- From sharp rectangles to pill shapes with one drag

### UI placement

Each slider goes inside its **existing collapsible section** as a single row beneath the current grid of options. No new sections, no new tabs. Each is a `<Slider>` component (already in the project) with a small label and value readout — roughly 40px of vertical space each.

### Data model

Add 4 optional fields to `UserPreferences`:

```text
customAccentHue?: number | null    (0-360)
cardOpacity?: number               (0.05-1.0)
backgroundIntensity?: number       (0.1-1.0)  
borderRadius?: number              (0-24)
```

Stored in the existing `preferences` JSON column — no migration needed.

### Implementation touch points

- `src/hooks/useUserSettings.ts` — add fields to `UserPreferences`, pass through `saveTheme`/`savePreferences`
- `src/components/settings/ThemeTab.tsx` — add 4 `<Slider>` rows in their respective collapsible sections
- `src/index.css` / `applyThemePreview()` — consume the new CSS variables (`--radius`, `--glass-opacity`, `--bg-intensity`, custom hue)
- `src/components/BackgroundPattern.tsx` — read `--bg-intensity` or accept an intensity prop for canvas alpha

### Files changed
- `src/hooks/useUserSettings.ts`
- `src/components/settings/ThemeTab.tsx`
- `src/index.css`
- `src/components/BackgroundPattern.tsx`

