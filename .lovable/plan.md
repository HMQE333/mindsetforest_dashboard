

# Onboarding: Customize Daily Tasks Per Category

## What Changes
Add a new step to the onboarding flow (after category customization or as part of "Use defaults") where users can review and customize the 3 daily tasks inside each category. They can:

- **Edit** task titles, descriptions, durations, and XP values
- **Enable/disable** individual tasks with toggle switches
- **Add new tasks** or **remove** existing ones
- Keep defaults with one click if they're happy

## Flow

1. **Step 1 (existing)**: "Use defaults" or "Customize my own" (categories)
2. **Step 2 (existing, if custom)**: Edit category names, icons, taglines
3. **Step 3 (NEW)**: Review and customize daily tasks per category
   - Collapsible/accordion per category showing its 3 default tasks
   - Each task has a toggle (enabled/disabled) and inline edit fields
   - "Add task" button per category
   - "Looks good, let's go!" button to finish

## Design
- Accordion-style layout: each category is a collapsible section with its icon and name
- Tasks inside each section shown as cards with toggle switches and editable fields
- Glass-morphism styling matching existing onboarding theme
- Staggered animations with framer-motion
- Mobile-friendly single-column layout

## Technical Details

### Files to modify

| File | Change |
|------|--------|
| `src/components/onboarding/OnboardingView.tsx` | Add step 3 for task customization |
| `src/hooks/useOnboarding.ts` | Pass custom missions to `completeOnboarding`, save to `dashboard_state.custom_missions` |
| `src/hooks/useDashboardState.ts` | On first load, check if onboarding set custom missions and use them |

### Data flow
- When user finishes step 3, the customized missions (with disabled tasks filtered out) are saved as `custom_missions` in the `dashboard_state` table (which already supports this field as JSONB)
- The `completeOnboarding` function will accept an optional `customMissions` parameter alongside categories
- `useDashboardState` already reads `custom_missions` and uses them over defaults via `getMissions()`, so no dashboard changes needed

### Step 3 UI structure
- Each category rendered as a collapsible section (using Radix Accordion)
- Inside: list of task cards with:
  - Toggle switch (enabled/disabled)
  - Title input (editable inline)
  - Description textarea
  - Duration + XP inputs (small inline fields)
  - Delete button
- "Add task" button at the bottom of each category
- Footer with "Start My Journey" button

