

## Add "Fireflies" Background Pattern

Add a new animated canvas-based background option — warm, softly glowing fireflies that drift lazily across the screen with pulsing light.

### Changes

**1. `src/hooks/useUserSettings.ts`**
- Add `"fireflies"` to the `BackgroundPattern` union type

**2. `src/components/settings/ThemeTab.tsx`**
- Add fireflies entry to the `BACKGROUNDS` array: `{ id: "fireflies", label: "Fireflies", icon: "✨", description: "Warm drifting firefly glow" }`

**3. `src/components/BackgroundPattern.tsx`**
- Add a new canvas-based animation block for `pattern === "fireflies"`, similar to starry but with firefly behavior:
  - ~40-60 particles (fewer than stars, more organic)
  - Warm golden/amber colors (`rgba(255, 200, 50, ...)` with some green-gold variation)
  - Each firefly: random position, slow wandering motion using sine/cosine curves (not linear drift)
  - Pulsing glow cycle — each firefly fades in/out independently with varying speeds (some fast blink, some slow breathe)
  - Soft radial glow halo around each firefly (larger blur radius than starry stars)
  - Occasional pause — some fireflies dim to near-zero then re-emerge, mimicking real firefly behavior

