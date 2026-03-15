

# Improve Glassmorphic Card Style

## Current State
The glassmorphic style has a decent foundation — 24px blur, saturate, gradient background, shimmer border via `::before` mask trick, and a purple-tinted hover. But it feels flat and the shimmer is subtle to the point of being invisible.

## Improvements

### 1. Richer glass depth
- Increase blur to 28px and add brightness adjustment for a more convincing frosted-glass look
- Add a subtle top highlight (specular reflection) via a second `::after` pseudo-element — a soft white-to-transparent gradient at the top edge simulating light hitting glass

### 2. More visible iridescent shimmer border
- Expand the `::before` gradient to use a wider color sweep (purple → cyan → pink) with slightly higher opacity so the rainbow edge is actually perceptible
- Add a slow 8s animation that shifts the gradient angle, creating a living iridescent edge

### 3. Better hover state
- On hover, intensify the shimmer opacity and add a soft outer glow that picks up the accent color
- Add a subtle `scale(1.005)` and refined shadow stack for depth

### 4. Inner light refraction
- Add a faint diagonal highlight band across the card background gradient to simulate light refracting through glass

### 5. Light theme adaptation
- Ensure all effects remain visible on light themes by using appropriate opacity values and darker border fallbacks

## Files to Change
- **`src/index.css`** — Replace lines 334-393 with improved glassmorphic CSS (shimmer animation keyframes, enhanced blur/gradient/shadow, `::after` specular highlight, animated `::before` border)

## Technical Notes
- The `::before` is used for shimmer border, `::after` for specular highlight — both need `pointer-events: none`
- The overflow override block for electric/plasma/bark frames will be preserved
- Animation will use `@keyframes glassmorphic-shimmer` rotating the gradient angle

