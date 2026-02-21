

# Guide Section Below Sign In

## What
Add a visually appealing, scrollable guide/explainer section below the "Sign In" auth gate on the landing page. It will only show for **unauthenticated users** and explain how MindsetForest works in a clear, engaging way.

## Content Structure
The guide will be organized into themed cards with icons, each explaining a core feature:

1. **Your Life, Your Categories** -- Split your goals into 8 improvement areas. Each day, tackle 3 daily tasks per category. Reset anytime. Add more or split tasks as needed.
2. **Built for the Restless Mind** -- Designed to boost dopamine for ADHD brains and reduce mental fatigue. No rigid routines -- if your mind rebels, the system adapts.
3. **Turn Life Into an Adventure** -- Earn XP, level up, maintain streaks. Every completed task is progress in your personal RPG.
4. **Stats: Track What Matters** -- Monitor objective metrics over time. See daily averages, weekly totals, and 12-month performance views.
5. **Ladder and Habit Loops: The Big Picture** -- Break your long-term vision into actionable steps. Build momentum through repeatable habit cycles.
6. **Oracle: Guilt-Free Rewards** -- Spend earned XP on real rewards. You worked for it -- enjoy it without guilt.

## Design
- Staggered fade-in animations using framer-motion
- Glass-morphism cards (bg-card/30, backdrop-blur, border-white/10) matching existing theme
- Emoji icons for each card
- Gradient accent lines/borders
- Responsive: 1 column on mobile, 2 columns on desktop
- Subtle purple glow effects consistent with the app

## Technical Details

### Files to modify
- `src/pages/Index.tsx` -- update `renderAuthGate` to include the guide section below the Sign In button

### Implementation
- Create the guide as part of `renderAuthGate` (or a separate `GuideSection` component rendered conditionally when `!user`)
- Use `motion.div` with staggered `transition.delay` for each card
- No new dependencies needed -- uses existing framer-motion and Tailwind classes
