
## What the user wants

When all missions in a category are completed (e.g. 3/3), show a satisfying temporary visual celebration — burst of particles/sparks, badge popup, confetti, etc. — directly on the category card (in the grid view) or on the MissionView when the last mission is ticked. Later they want a setting to pick the style. Plan: implement **3 distinct styles** and default to one, with a settings picker added to ModulesTab.

---

## How it triggers

In `DashboardView`, `handleComplete` is called when a mission is ticked. After `completeMission()` runs, we check: **did this category just become fully complete?** (completed count for that category === total missions). If yes, fire the celebration effect.

---

## The 3 celebration styles

| ID | Name | What it does |
|---|---|---|
| `burst` | ✨ Burst | 12 emoji/star particles explode outward from center, fade in 1.2s |
| `banner` | 🏆 Banner | A floating badge "ALL DONE! 🎉" slides in from top, hangs for 2s then fades |
| `fireworks` | 🎆 Fireworks | 3 colorful confetti clusters shoot up and fall, 2s total |

Default: `burst`.

---

## Implementation

### New file: `src/components/dashboard/CategoryCompleteEffect.tsx`

A single component that takes `style: "burst" | "banner" | "fireworks"` and `color: string` and `onDone: () => void`. Renders as a fixed overlay, auto-dismisses. No deps beyond framer-motion.

```
burst:     12 motion.divs with radial translate animations (random angles, 60-120px radius)
banner:    motion.div centered, gradient-purple pill with trophy + "All Done!" text, spring in, fade out
fireworks: 3 clusters × 8 particles each, staggered launch upward with gravity arc
```

### `DashboardView.tsx`

Add state:
```ts
const [categoryComplete, setCategoryComplete] = useState<{ categoryId: string; color: string; key: number } | null>(null);
```

In `handleComplete`, after `completeMission()`:
```ts
setTimeout(() => {
  const missions = getMissions(categoryId);
  const newCompleted = getCompletedCount(categoryId) + 1; // count after update
  if (newCompleted === missions.length) {
    const cat = categories.find(c => c.id === categoryId);
    setCategoryComplete({ categoryId, color: cat?.color || "#8B5CF6", key: Date.now() });
  }
}, 150);
```

Render:
```tsx
{categoryComplete && (
  <CategoryCompleteEffect
    key={categoryComplete.key}
    style={preferences.completionEffect || "burst"}
    color={categoryComplete.color}
    onDone={() => setCategoryComplete(null)}
  />
)}
```

### `useUserSettings.ts` — add type

```ts
export type CompletionEffect = "burst" | "banner" | "fireworks" | "none";
```

Add `completionEffect?: CompletionEffect` to `UserPreferences`.

### `ModulesTab.tsx` — add picker section

Below the existing "Focus Reminder Effect" section, add a **"🎉 Mission Complete Effect"** row — same pill-button pattern as the pulse style picker, 4 options: Burst / Banner / Fireworks / None.

Pass `completionEffect` + `onSaveCompletionEffect` as props from `SettingsModal.tsx` → `ModulesTab`.

### `SettingsModal.tsx`

Wire new props to `ModulesTab`:
```tsx
completionEffect={settings.preferences.completionEffect || "burst"}
onSaveCompletionEffect={(effect) => {
  settings.savePreferences({ ...settings.preferences, completionEffect: effect });
}}
```

---

## Files to change

1. **`src/components/dashboard/CategoryCompleteEffect.tsx`** — new file, 3 animation styles
2. **`src/components/dashboard/DashboardView.tsx`** — trigger logic + render
3. **`src/hooks/useUserSettings.ts`** — add `CompletionEffect` type + field to `UserPreferences`
4. **`src/components/settings/ModulesTab.tsx`** — picker UI
5. **`src/components/settings/SettingsModal.tsx`** — wire new props

No DB changes. No edge functions. No migrations.
