---
name: Health Module
description: ❤️ Health top-level tab — vitals, bloodwork, AI lab extraction, compact tree widget, gamified health score
type: feature
---
The 'Health' module (❤️ Health) is a top-level tab tracking vitals (Weight, BMI, BP, HR) and blood biomarkers (Glucose, HbA1c, Lipids, Hemoglobin, Creatinine, eGFR) with AHA/ADA/WHO reference ranges centralized in `src/lib/health-data.ts`.

Core UI (`HealthView.tsx`):
- Grid of 9 core metric cards via `HealthMetricCard` (status pill Optimal/Borderline/Out, trend arrow, 6-point sparkline, "Why it matters" tooltip).
- Compact `HealthTreeWidget` SVG (lush → withered tiers driven by aggregate score: 80+/55+/30+/<30) — sidebar accent, NOT hero.
- Insights panel (3-4 evidence-based bullets + "Not medical advice" disclaimer).
- History table with edit/delete actions; clicking a row opens edit modal.

Logging (`LogHealthCheckModal`): 4 sections — Date+Self-Rating (1-10), Body Metrics, Blood Biomarkers, Upload+Notes.
- `LabExtractDropzone` uploads PDF/image to private `health-labs` bucket, calls `ai-health-extract` edge fn (Gemini 2.5 Flash vision) to pre-fill fields with amber highlight.
- Backdating allowed (date picker disables future dates only).

Aggregate score: `computeAggregateScore` = 70% metric statuses avg + 30% self-rating, rendered 0-100 next to tree.

Wired in `src/pages/Index.tsx` as Tab "health"; included in DEFAULT_MODULES in `useUserSettings.ts` (enabled by default); toggleable via `ModulesTab.tsx`.
