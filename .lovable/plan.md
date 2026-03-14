

## Plan: Use Real CSS Effects in Card/Frame Style Previews

### Problem
The `FrameStylePreview` and `CardStylePreview` components in ThemeTab use hardcoded inline styles that approximate the real effects. The actual effects are defined via CSS classes in `index.css` (e.g., `.frame-glow .glass-card-hover:hover`, `.card-wood .glass-card`). The previews look different from reality because they're manual recreations, not the actual CSS.

### Approach
Replace the inline-style preview components with real DOM elements that use the actual CSS classes. This way the previews are always truthful.

**FrameStylePreview** — wrap the preview card in a container with the real `frame-{id}` class, and give the inner element `glass-card-hover` class. Force the `:hover` state visually by adding the hover styles permanently (since these are previews that should always show the effect). We'll do this by adding a `.frame-preview-active` modifier class that applies the hover styles without needing actual hover.

**CardStylePreview** — wrap in `card-{id}` class container, give inner element `glass-card` class. The real CSS kicks in automatically.

### CSS additions in `index.css`
Add "always-on" preview variants that mirror the `:hover` state for each frame, so the preview card always shows the effect:

```css
/* For each frame, duplicate the hover rule with a .preview-active selector */
.frame-glow .glass-card-hover.preview-active { /* same as :hover */ }
.frame-aura .glass-card-hover.preview-active { /* same as :hover */ }
/* ... etc for all 11 frames */
```

This is a small CSS addition (~60 lines) that keeps previews permanently showing the hover effect.

### Component changes in `ThemeTab.tsx`

**FrameStylePreview** — simplify to:
```tsx
function FrameStylePreview({ frameId }: { frameId: FrameStyle }) {
  const cls = frameId === "default" ? "" : `frame-${frameId}`;
  return (
    <div className={cls}>
      <div className="glass-card-hover preview-active" style={{ height: 44, borderRadius: 8 }}>
        {/* inner placeholder content */}
      </div>
    </div>
  );
}
```

**CardStylePreview** — simplify to:
```tsx
function CardStylePreview({ styleId }: { styleId: CardStyle }) {
  const cls = styleId === "default" ? "" : `card-${styleId}`;
  return (
    <div className={cls}>
      <div className="glass-card" style={{ height: 40 }}>
        {/* inner placeholder content */}
      </div>
    </div>
  );
}
```

The `DashboardCardPreview` (under Hero Layout section) already shows combined card+frame — update it similarly to use real CSS classes instead of inline approximations.

### Files to change
- **`src/index.css`** — add `.preview-active` selectors for each frame style (~60 lines)
- **`src/components/settings/ThemeTab.tsx`** — rewrite `FrameStylePreview` (~30 lines), `CardStylePreview` (~30 lines), and `DashboardCardPreview` (~40 lines) to use real CSS classes

### Result
Previews will always be pixel-accurate to the real card effects since they use the same CSS. Any future changes to frame/card styles automatically update the previews too.

