

## Plan: Add Prism Frame Style (Dual Glow Effect)

Add a new frame style "Prism" that combines both accent-colored glow AND card-color glow for a layered dual-glow hover effect.

### Implementation

1. **useUserSettings.ts** - Add "prism" to FrameStyle type
2. **ThemeTab.tsx** - Add PRISM entry to FRAMES array with icon/description
3. **index.css** - Add `.frame-prism` rule with dual box-shadow (accent + card color)

### CSS Effect
```css
.frame-prism .glass-card-hover:hover {
  transform: none;
  border-color: hsl(var(--glow-purple) / 0.6);
  box-shadow: 
    0 0 20px hsl(var(--glow-purple) / 0.4),    /* Accent glow */
    0 0 40px hsl(var(--card) / 0.3);            /* Card color glow */
}
```

No database changes needed - stores in existing preferences JSON.

