

## Add Snow/Frost Themed Customizations

Bundle of winter-themed additions across multiple customization tiers.

### 1. New Theme Mode: "Frost" 
**`useUserSettings.ts`** — Add `"frost"` to `ThemeMode` union.

**`ThemeTab.tsx`** — Add to `THEMES` array:
- Icon: ❄️, label: "Frost", description: "Icy blues, crisp whites"
- Preview colors: cool blue-white bg (`#e8f0f8`), card (`#f0f6fc`), text (`#1a2a3a`)
- Light theme variant with icy blue tones

**`applyThemePreview`** — Add `case "frost"` using `setLightVars` with cool blue-white palette.

### 2. New Background Pattern: "Snow"
**`useUserSettings.ts`** — Add `"snow"` to `BackgroundPattern` union.

**`ThemeTab.tsx`** — Add to `BACKGROUNDS`: `{ id: "snow", label: "Snowfall", icon: "❄️", description: "Gently falling snowflakes" }`

**`BackgroundPattern.tsx`** — New canvas animation:
- ~80-120 snowflake particles of varying sizes (1-4px radius)
- White/ice-blue color, low opacity (0.3-0.7)
- Gentle downward drift with slight horizontal sine-wave wobble
- Varying fall speeds for parallax depth effect
- Subtle rotation wouldn't apply (circles), but size variation creates depth

### 3. New Frame Style: "Icicle"
**`useUserSettings.ts`** — Add `"icicle"` to `FrameStyle` union.

**`ThemeTab.tsx`** — Add to `FRAMES`: `{ id: "icicle", label: "Icicle", icon: "🧊", description: "Frosted ice border glow" }`
- Preview: frosted white-blue border with cold glow

**`index.css`** — New `.frame-icicle` styles:
- On hover: icy blue-white border (`hsl(200, 80%, 85%)`)
- Cold blue glow (`box-shadow` with ice-blue tones)
- Frosted backdrop blur effect

**`applyThemePreview`** — Add `"frame-icicle"` to frameClasses array.

### 4. New Card Style: "Frosted"
**`useUserSettings.ts`** — Add `"frosted"` to `CardStyle` union.

**`ThemeTab.tsx`** — Add to `CARD_STYLES`: `{ id: "frosted", label: "Frosted", icon: "🧊", description: "Icy translucent glass" }`

**`index.css`** — New `.card-frosted` styles:
- Heavy blur (28px), very light white bg tint
- Subtle ice-blue border
- Faint blue inner glow

**`applyThemePreview`** — Add `"card-frosted"` to cardClasses array.

### Files Changed
- `src/hooks/useUserSettings.ts` — type unions
- `src/components/settings/ThemeTab.tsx` — arrays, preview, apply function
- `src/components/BackgroundPattern.tsx` — snow canvas animation
- `src/index.css` — icicle frame + frosted card CSS

