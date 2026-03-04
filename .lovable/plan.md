

## Plan: Polish Projects + Integrate with Dashboard AI Suggest

### Current State
Projects exist as a separate scope in Ladder and Habit Loop views via `CategoryProjectSelector`. They work for ladder/habit loop AI generation. But:

1. **Dashboard doesn't know about projects** — the CategoryGrid only shows the 8 hardcoded categories. No way to see project missions, generate AI missions for a project, or complete project missions for XP.
2. **Project selector UX is basic** — native `<select>` dropdown looks out of place in the glassmorphic UI.
3. **AI Suggest modal on Dashboard is category-locked** — `AISuggestionsModal` takes a `categoryId` and always looks up `CATEGORIES.find(c => c.id === categoryId)`. It can't handle project keys.

### What to Change

**1. Dashboard: Show projects as cards in CategoryGrid**
- After the 8 category cards, render user project cards using the project emoji, name, and the same mission/completion counters.
- Clicking a project card opens `MissionView` the same way categories do, with project name/emoji as the header.
- `getMissions` already supports arbitrary string keys via `customMissions` — project keys (`project-{uuid}`) just work.

Files: `CategoryGrid.tsx`, `MissionView.tsx`, `DashboardView.tsx`

**2. AI Suggest modal: Support projects**
- When `categoryId` starts with `project-`, look up the project name from `useUserProjects` instead of `CATEGORIES`.
- Pass `projectName` to `ai-mission-suggest` edge function.
- Update edge function to use project name when provided, skipping category tagline.

Files: `AISuggestionsModal.tsx`, `ai-mission-suggest/index.ts`

**3. Upgrade CategoryProjectSelector visually**
- Replace native `<select>` with a custom styled dropdown using the same glassmorphic design as the rest of the app. Category pills / project pills instead of a raw select element.

File: `CategoryProjectSelector.tsx`

### Summary of File Changes

| File | Change |
|------|-------|
| `CategoryGrid.tsx` | Add project cards after category cards, accept projects prop |
| `MissionView.tsx` | Handle project keys — show project name/emoji instead of category lookup |
| `DashboardView.tsx` | Pass projects to CategoryGrid, pass project context to AISuggestionsModal |
| `AISuggestionsModal.tsx` | Accept optional projectName, use it for display and AI call |
| `ai-mission-suggest/index.ts` | Accept projectName param, use it in prompt when provided |
| `CategoryProjectSelector.tsx` | Replace native select with styled custom dropdown |

No database changes needed — `customMissions` in `dashboard_state` already stores by arbitrary key, and project missions will use `project-{uuid}` keys naturally.

