

## Plan: Add "Eye" vessel shape

Add a 5th vessel option — a mystical eye shape (👁️ "All-Seeing Eye") to the breathing module.

### Changes

**`src/lib/breathing-data.ts`**
- Add `"eye"` to `VesselShape` type union
- Add `{ id: "eye", name: "All-Seeing Eye", icon: "👁️" }` to `VESSEL_SHAPES`

**`src/components/breathing/BreathingVessel.tsx`**
- Add an eye-shaped SVG path to `VESSEL_PATHS` — a horizontal almond/eye outline with pointed corners left and right, wide in the middle (~140px tall, centered in the 200×280 viewBox)
- Add a circular "iris" detail drawn inside the eye as an extra SVG element (only for the eye shape) — a circle in the center that subtly pulses with the breath phase
- Add rune engravings positioned along the upper and lower eyelid curves in `VESSEL_ENGRAVINGS`
- The air fill animation works the same way (rising from bottom), creating the effect of the eye "opening" as it fills with energy

No other files need changes — the shape selector in `BreathingView` already iterates `VESSEL_SHAPES` dynamically.

