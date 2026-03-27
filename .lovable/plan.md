

## Plan: Breathing Vessel Visual Effects — Toggle Options

### Concept
Add 5 optional visual effects as individual toggles on the Breathing tab's pre-session screen. Each can be turned on/off independently. Defaults: all off (clean by default). State stored in `localStorage` for simplicity — no DB changes needed.

### Effects (each a toggle)
1. **Rotating Runes** — wraps rune ring in a slow 20s spinning container
2. **Energy Particles** — 10 tiny orbiting glowing dots at varying speeds/radii
3. **Energy Bursts** — random flash every 6-10s shooting from a rune to vessel center
4. **Rune Sigil Lines** — faint SVG hexagon connecting adjacent runes, pulses when active
5. **Ambient Sparks** — 4 tiny particles drifting upward from fill surface when fillLevel > 0.3

### UI placement
Below the vessel shape selector in `BreathingView.tsx`, add a small collapsible "✨ Effects" button that reveals a row of compact pill toggles (e.g. "Runes ↻", "Particles", "Bursts", "Sigil", "Sparks"). Keeps the main UI clean — effects hidden until user opens them.

### Files changed

| File | Change |
|---|---|
| `src/lib/breathing-data.ts` | Add `VesselEffect` type, `VESSEL_EFFECTS` array with id/name/icon |
| `src/components/breathing/BreathingView.tsx` | Add collapsible effects toggle row, pass `activeEffects` to `BreathingSession` |
| `src/components/breathing/BreathingSession.tsx` | Pass `activeEffects` to `BreathingVessel` |
| `src/components/breathing/BreathingVessel.tsx` | Conditionally render each effect based on `activeEffects` set — rotating wrapper, particle layer, burst system, sigil lines, spark emitter |

### Technical notes
- Effects state: `useState<Set<string>>` initialized from `localStorage` key `breathing_effects`
- Rotating runes: wrap existing rune map in `motion.div` with `rotate: [0, 360]`, `duration: 20`, `repeat: Infinity`, `ease: "linear"`
- Particles: array of 10, each with random radius (120-160), speed (15-30s), initial angle — rendered as `motion.div` with continuous rotation
- Bursts: `useEffect` with `setInterval(6000-10000)` picking random rune index, spawning a `motion.div` that animates position from rune coords → center with 0.8s fade
- Sigil: SVG `<line>` elements between consecutive rune positions, opacity tied to rune active state
- Sparks: 4 elements with `y` starting at fill surface, animating upward 40-80px while fading, recycling with random x offset

