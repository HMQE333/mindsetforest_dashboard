

## Improve Bark Frame Style

The current Bark frame is minimal — just a brown border, a faint warm glow, and a single thin `repeating-linear-gradient` grain line. It doesn't feel organic or textured enough. Here's the plan to make it feel like actual rough bark.

### CSS Changes (`src/index.css`)

Replace the `.frame-bark` block with a richer treatment:

- **Multi-layer grain**: 3 overlapping `repeating-linear-gradient` at slightly different angles (88°, 94°, 91°) with varying widths and opacities to create irregular wood-grain lines
- **Rough border**: Use a thicker, uneven-looking border via `border-width: 1.5px` with a warm brown that's slightly brighter
- **Layered warm glow**: Add a subtle amber outer glow + a deeper brown inner shadow for depth, giving the impression of rough texture catching light
- **Subtle texture noise**: Add a radial-gradient "knot" spot or two for organic imperfection
- **No transform** on hover (keep consistent with nature frames)

### Preview Update (`src/components/settings/ThemeTab.tsx`)

Update the `case "bark"` preview to show richer brown tones and a hint of grain pattern in the small preview card.

### Files Changed
- `src/index.css` — rewrite `.frame-bark` block
- `src/components/settings/ThemeTab.tsx` — update bark preview styling

