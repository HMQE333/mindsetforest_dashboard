

## Plan: Fix Inconsistent Card Frame Behaviors

### Issues Found

After reviewing all frame and card style CSS, I identified these inconsistencies:

**1. Aura frame uses wrong CSS variable**
The Aura frame references `--card` (the card background color — a dark/neutral value) instead of `--card-color` (the per-card category color). This makes Aura's glow nearly invisible, looking identical to having no frame at all. Both the `:hover` and `.preview-active` rules have this bug.

**2. Glassmorphic card clips Electric, Plasma, and Bark effects**
The Glassmorphic card style sets `overflow: hidden` on `.glass-card-hover`. Electric and Plasma use `::after` pseudo-elements with `inset: -2px` (extending 2px outside the card), and Bark uses `::before` similarly. When these frames are combined with Glassmorphic cards, the pseudo-element effects are completely clipped and invisible.

**3. Missing light-theme `.preview-active` for Bark**
There is a `.light-theme .frame-bark .glass-card-hover:hover` override, but no matching `.light-theme .frame-bark .glass-card-hover.preview-active` rule — so the Bark preview looks wrong on light themes (Frost, Sandstone, Light).

### Changes

**`src/index.css`**

1. **Aura fix** (~4 lines): Replace `hsl(var(--card) / ...)` with `var(--card-color, hsl(var(--glow-purple) / ...))` in both the `:hover` rule (line 228-232) and the `.preview-active` rule (line 701-705). This makes Aura glow with the category color like Prism and Plasma do.

2. **Glassmorphic overflow fix** (~6 lines): Add override rules so that when a pseudo-element frame is combined with Glassmorphic, overflow remains visible:
```css
.frame-electric .glass-card-hover,
.frame-plasma .glass-card-hover,
.frame-bark .glass-card-hover {
  overflow: visible;
}
```

3. **Light-theme Bark preview-active** (~8 lines): Duplicate the light-theme Bark `:hover` rule for `.preview-active`:
```css
.light-theme .frame-bark .glass-card-hover.preview-active { /* same as :hover */ }
```

### Files
- **`src/index.css`** — ~18 lines changed/added across 4 locations

