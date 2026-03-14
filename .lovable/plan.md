

## Plan: Keyboard Shortcuts System for Dashboard

### Concept

A global keyboard shortcut system that is **context-aware** — shortcuts do different things depending on where you are (category grid, mission view, projects list). A small ⌨️ settings icon in the dashboard hero area opens a shortcuts reference/customization panel.

### Shortcut Map

**Grid view (default):**
- `M` → open Mind, `B` → open Body, `C` → open Creation, `X` → open Exploration, `N` → open Networking, `T` → open Trading, `S` → open Spirit, `O` → open Order
- `P` → open Projects folder
- `R` → Reset Day

**Projects list view:**
- `Escape` → back to grid
- `1-9` → select project by index

**Mission view (inside a category/project):**
- `1-9` → complete mission by index
- `E` → edit tasks
- `A` → AI suggestions
- `D` → reset defaults
- `Escape` → back

**Global:**
- `?` or `K` → open shortcuts reference panel

### Implementation

**1. New hook: `src/hooks/useKeyboardShortcuts.ts`**
- Takes current context (grid / projects / mission:categoryId) and action callbacks
- Registers `keydown` listener with `useEffect`, cleans up on unmount
- Ignores shortcuts when focus is inside an input/textarea/modal
- Returns nothing — pure side-effect hook

**2. `DashboardView.tsx`**
- Call `useKeyboardShortcuts` with current navigation state and all action handlers (setSelectedCategory, handleComplete, setEditingCategory, setAICategory, resetDay)
- Add state for showing shortcuts panel
- Derive context from `selectedCategory` value (null = grid, `__projects__` = projects, other = mission)

**3. New component: `src/components/dashboard/ShortcutsPanel.tsx`**
- A small modal/drawer showing all available shortcuts for the current context
- Grouped by context with key badges (like `kbd` elements)
- Triggered by a small ⌨️ icon button placed next to "Reset Day" in DashboardHero

**4. `DashboardHero.tsx`**
- Add a small ⌨️ button that opens the shortcuts panel

### File Summary

| File | Change |
|------|--------|
| `src/hooks/useKeyboardShortcuts.ts` | **New** — context-aware keyboard listener hook |
| `src/components/dashboard/ShortcutsPanel.tsx` | **New** — shortcuts reference overlay |
| `src/components/dashboard/DashboardView.tsx` | Wire up hook + shortcuts panel state |
| `src/components/dashboard/DashboardHero.tsx` | Add ⌨️ button |

No database changes. No custom keybinding persistence for now — fixed defaults only. Customization can be added later if desired.

