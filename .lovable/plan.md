

## Plan: More Themes + Card Frame Styles

### 1. New Theme Modes

Add 4 new themes alongside the existing 4 (Dark, OLED, Midnight, Light):

| Theme | Description | Vibe |
|-------|-------------|------|
| **Forest** | Deep greens, earthy tones | 🌲 Nature RPG |
| **Crimson** | Dark reds, warm blacks | 🩸 Dark fantasy |
| **Cyber** | Neon-tinted dark with high contrast | 🔮 Cyberpunk |
| **Sandstone** | Warm beige/tan light theme | 🏜️ Desert parchment |

Each theme sets all CSS variables (background, card, foreground, muted, border, glass) like the existing ones.

**Files:** `ThemeTab.tsx` (add THEMES entries + switch cases in `applyThemePreview`), `useUserSettings.ts` (extend `ThemeMode` type).

### 2. Card Frame Styles (Block Hover Effects)

Add a new **"Frame Style"** selector in the Theme tab that changes how `glass-card` and `glass-card-hover` behave on hover. Options:

| Frame | Hover Effect |
|-------|-------------|
| **Default** | Current lift + shadow |
| **Glow** | Accent-colored glow border, no lift |
| **Neon** | Bright neon outline + subtle inner glow |
| **Frost** | Increased blur + frosted white border |
| **Sharp** | No rounded corners, hard shadow, slight scale |

Implementation approach:
- Add a CSS class to `<body>` like `frame-glow`, `frame-neon`, etc.
- Override `.glass-card-hover:hover` styles per frame class in `index.css`
- Store the frame preference in `UserPreferences` alongside theme/accent
- Apply on load via `applyThemePreview`

**Files changed:**
- `src/hooks/useUserSettings.ts` — add `FrameStyle` type, store in preferences
- `src/components/settings/ThemeTab.tsx` — add Frame Style picker UI + apply logic
- `src/index.css` — add frame-specific hover overrides
- `src/components/settings/SettingsModal.tsx` — pass new prop through

### Summary of Changes

```text
ThemeTab.tsx        → 4 new themes + frame style picker UI + applyThemePreview cases
useUserSettings.ts  → ThemeMode extended, new FrameStyle type in preferences
index.css           → 5 frame style CSS rule sets
```

No database migration needed — frame style stores in existing `preferences` JSON column.

