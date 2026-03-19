
## Plan: Persistent checkmark badge on completed category cards

### What the user wants
A visual checkmark (✅) that **stays on the category card** after all missions are done — not a temporary animation, but a persistent indicator visible in the grid. Plus a toggle in Settings to enable/disable it.

### How it works
- `CategoryGrid` already receives `getMissions` and `getCompletedCount` per card
- When `completed === missions.length && missions.length > 0` → show the badge
- The badge is a small animated checkmark circle in the top-right corner of the card, styled with the category color
- A new preference `showCompletionBadge: boolean` (default `true`) controls visibility

### Badge design
Small pill/circle in the top-right corner of the card:
- Animated `framer-motion` spring-in on first render when completed
- Green checkmark `✓` with a subtle glow matching the category color
- Sits above the gradient overlay, doesn't block hover interactions

### Files to change

**1. `src/hooks/useUserSettings.ts`**
- Add `showCompletionBadge?: boolean` to `UserPreferences` interface

**2. `src/components/dashboard/CategoryGrid.tsx`**
- Accept new prop `showCompletionBadge?: boolean`
- Inside each card: when `completed === missions.length && missions.length > 0`, render a `motion.div` badge (top-right corner, spring-in, checkmark icon + color glow)

**3. `src/components/dashboard/DashboardView.tsx`**
- Pass `showCompletionBadge={preferences.showCompletionBadge !== false}` to `<CategoryGrid>`

**4. `src/components/settings/ModulesTab.tsx`**
- Add `showCompletionBadge?: boolean` + `onSaveCompletionBadge?: (v: boolean) => void` props
- Add a small toggle row below the "Mission Complete Effect" section: **"✅ Show completion badge on cards"** — same toggle pill pattern as module switches

**5. `src/components/settings/SettingsModal.tsx`**
- Wire `showCompletionBadge` and `onSaveCompletionBadge` props into `<ModulesTab>`

### Badge visual
```text
┌──────────────────────┐
│  🧠              ✅  │  ← small spring-in circle, top-right
│  Mind                │
│  Learning & Memory   │
│  3/3 completed       │
└──────────────────────┘
```
The badge is a `w-7 h-7` circle with `bg-emerald-500/20 border border-emerald-500/50`, a `✓` character in the category color, and a subtle `drop-shadow` glow. It springs in with `scale: 0 → 1` when completion is reached.

No DB migrations needed — `showCompletionBadge` is stored in the existing `preferences` JSON column.
