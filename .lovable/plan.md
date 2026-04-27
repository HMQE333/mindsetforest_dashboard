## ❤️ +Health Module — Implementation Plan

A new top-level module that feels like a natural extension of MindsetForest: calm, trustworthy, gamified. Self-tracking of vitals + bloodwork with AI-assisted lab report extraction, trend visualizations, evidence-based insights, and a small "health tree" widget that visually mirrors your overall state.

---

### 1. Navigation & Module Registration

- Add `"health"` as a new `Tab` in **`src/pages/Index.tsx`**
  - Label: `❤️ Health`, icon `❤️`, short label `Health`
  - Insert into `DEFAULT_TAB_ORDER` and `ALL_TAB_LABELS`
  - Mount `<HealthView />` when active
- Register module in **`src/components/settings/ModulesTab.tsx`** so it's toggleable in Settings → Modules:
  - `{ id: "health", label: "Health", icon: "❤️", description: "Vitals, bloodwork & AI lab extraction" }`
- Add `"health"` to `DEFAULT_MODULES` in `useUserSettings.ts` so it's enabled by default

---

### 2. Database (Supabase migration)

**Table `health_entries`** (one row per check-in):
- `id` uuid PK · `user_id` uuid · `entry_date` text (YYYY-MM-DD, supports back-dating)
- `self_rating` int (1–10)
- Body metrics (all nullable numeric): `weight_kg`, `height_cm`, `bp_systolic`, `bp_diastolic`, `resting_hr`
- Blood biomarkers (all nullable numeric): `fasting_glucose_mgdl`, `hba1c_pct`, `ldl_mgdl`, `hdl_mgdl`, `total_chol_mgdl`, `triglycerides_mgdl`, `hemoglobin_gdl`, `creatinine_mgdl`, `egfr`
- `notes` text default `''`
- `lab_report_url` text nullable (storage path)
- `created_at`, `updated_at`

RLS: standard 4 policies (`auth.uid() = user_id` for SELECT/INSERT/UPDATE/DELETE).

**Storage bucket `health-labs`** (private):
- RLS: users can read/write only files under `auth.uid()/...` prefix.

---

### 3. New Files

```
src/lib/health-data.ts             — reference ranges, status logic, BMI calc, "Why it matters" copy
src/hooks/useHealthEntries.ts      — fetch/insert/update/delete entries, derived stats & trends
src/components/health/
  HealthView.tsx                   — main view (cards grid + log button + trends + history + insights + tree)
  HealthMetricCard.tsx             — single metric card (value, range, status pill, trend arrow, sparkline)
  HealthTreeWidget.tsx             — compact CSS/SVG tree, leaves & color tied to aggregate score
  LogHealthCheckModal.tsx          — 4-section modal (Date+Rating, Body, Blood, Upload+Notes)
  HealthRatingSelector.tsx         — segmented 1–10 with helper labels
  HealthTrendChart.tsx             — line chart with tabs (All/Metabolic/Cardiovascular/Blood) using recharts
  HealthHistoryTable.tsx           — past entries table (date, rating, summary, edit/delete)
  HealthInsightsPanel.tsx          — 3–4 evidence-based bullets + disclaimer
  LabExtractDropzone.tsx           — drag-and-drop + "Extract with AI" trigger

supabase/functions/ai-health-extract/index.ts   — Lovable AI (Gemini vision) lab parser
```

---

### 4. Reference Ranges (`health-data.ts`)

Standard adult guidelines (AHA / ADA / WHO). Each metric carries `{ id, label, unit, optimal: [min,max], borderline: [min,max], why: string }`. Examples:

- **BMI**: 18.5–24.9 optimal · 25–29.9 borderline · auto-computed from weight + height
- **BP**: <120/<80 optimal · 120–129/<80 borderline · ≥130 or ≥80 out
- **Fasting glucose**: 70–99 optimal · 100–125 borderline · ≥126 out (mg/dL)
- **HbA1c**: <5.7 optimal · 5.7–6.4 borderline · ≥6.5 out (%)
- **LDL**: <100 optimal · 100–129 borderline · ≥130 out (mg/dL)
- **HDL**: ≥60 optimal · 40–59 borderline · <40 out
- **Triglycerides**: <150 optimal · 150–199 borderline · ≥200 out
- **Hemoglobin**: 13.5–17.5 (M) / 12–15.5 (F) optimal
- **eGFR**: ≥90 optimal · 60–89 borderline · <60 out
- **Creatinine**: 0.74–1.35 (M) / 0.59–1.04 (F)

`getStatus(value, ranges)` returns `"optimal" | "borderline" | "out" | "unknown"` → drives pill color (green / amber / red / muted).

---

### 5. Metric Cards Grid

`<HealthMetricCard>` reuses the existing **`glass-card-hover`** style (same as CategoryGrid) so it visually matches Mind/Body/Creation tiles. Each card shows:

- Icon + metric label
- **Current value + unit** (large, mono font like stat-value)
- **Reference range** (small muted text)
- **Status pill** — Optimal (green) / Borderline (amber) / Out of Range (red), uses category color tokens (`cat-mind` style)
- **Trend arrow** + % delta vs previous entry (↑ green/red depending on metric direction)
- **Mini sparkline** of last 4–6 entries (reuse `TrackerMiniChart` pattern with metric color)
- Tooltip on hover: "Why it matters" copy

Special **Lipid card**: shows LDL prominently with HDL/Total/Trig as a small expandable strip beneath.

Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` matching existing modules.

---

### 6. "Log New Health Check" Flow

Big CTA button styled like other primary CTAs (`gradient-purple text-primary-foreground glow-md`).

`<LogHealthCheckModal>` — single modal with four labeled sections:

1. **Date & Self-Rating**
   - Shadcn date picker (defaults today; back-dating allowed)
   - `<HealthRatingSelector>` — 10 segmented pills, color gradient from red→amber→green; labels under 1/5/10 ("Very Poor", "Average", "Peak")
   - Helper text: *"Your honest overall feeling of physical & mental health today."*
2. **Body Metrics** — Weight (kg), Height (cm, optional & remembered), BP (systolic/diastolic side-by-side), Resting HR
3. **Blood Biomarkers** — collapsible groups: *Glucose panel* (Fasting + HbA1c) · *Lipid panel* (LDL/HDL/Total/Trig) · *Other* (Hemoglobin, Creatinine, eGFR)
4. **Upload & Notes**
   - `<LabExtractDropzone>` — drag-and-drop PDF/JPG/PNG (max 10 MB) → uploads to `health-labs/<uid>/<entry-id>.<ext>`
   - **"✨ Extract with AI"** button — calls `ai-health-extract` edge function, parses response, pre-fills fields above (with a yellow highlight on auto-filled values so the user can review)
   - Free-text Notes textarea

Save → insert into `health_entries`, close modal, optimistic update.

---

### 7. AI Lab Extraction Edge Function

**`supabase/functions/ai-health-extract/index.ts`** — uses Lovable AI gateway (already wired in this project, no API key needed):
- Accepts `{ fileUrl, fileType }` (signed storage URL + mime)
- Calls `google/gemini-2.5-flash` with vision input + a tool-call schema for structured extraction (matches the `health_entries` numeric columns)
- Returns `{ extracted: {...numeric fields}, confidence: {...}, raw_text: string }`
- Handles 429 / 402 with friendly toasts on the client (per AI gateway guidelines)
- Plain-text only output for `raw_text` (per project AI formatting standard)

---

### 8. Trends & History

- **`<HealthTrendChart>`** — recharts `LineChart` with tabs:
  - *All* (self-rating overlay), *Metabolic* (glucose, HbA1c, weight, BMI), *Cardiovascular* (BP sys/dia, HR, LDL), *Blood* (Hb, creatinine, eGFR)
  - Reuses teal `--stat-value` and category color tokens; smooth animation on mount
- **`<HealthHistoryTable>`** — sortable table (date desc by default): Date · Self-Rating · key value summary chip-row · ✏️ Edit / 🗑 Delete actions
  - Click row → opens `LogHealthCheckModal` in edit mode

---

### 9. Insights Panel

`<HealthInsightsPanel>` — right column on desktop (`lg:col-span-1`), bottom on mobile. Reuses `glass-card`. Computed client-side from latest entry + 6-month trend:

- 3–4 short bullets, e.g.:
  - *"LDL now in optimal range (AHA guideline <100 mg/dL)."*
  - *"Self-rating of 8 aligns with strong metabolic markers."*
  - *"Weight stable for 6 months — excellent consistency."*
- One **gentle flag** if anything is trending out of range (amber tone, never alarmist)
- Small italic disclaimer at bottom: *"For personal tracking only. Not medical advice."*

---

### 10. Compact Health Tree Widget 🌳

`<HealthTreeWidget>` — small SVG/CSS tree (~160×160) tucked **inside the Insights panel** at the top. Its appearance is driven by an aggregate score (0–100) computed from the latest entry:

- **80–100** — full lush canopy, vibrant green leaves, gentle sway animation, golden glow ring
- **55–79** — healthy green, fewer animated particles
- **30–54** — autumn tones (amber/orange leaves), sparse foliage
- **0–29** — withered: brown branches, no leaves, muted gray-brown palette
- Smooth color/leaf transition (~600 ms) when a new entry is logged → satisfying gamified feedback
- Implementation: layered SVG (trunk + 3 leaf-cluster groups) with CSS variables for leaf color/opacity driven by the score — keeps it lightweight and matches the project's "Forest" identity

Score formula: weighted average of in-range status across logged metrics (each metric contributes its status: optimal=1.0, borderline=0.5, out=0.0) × 0.7 + (self_rating/10) × 0.3.

---

### 11. Seed Data on First Load

When `useHealthEntries` returns 0 entries for a user, show a soft "Plant your first entry" empty state **and** offer a one-click *"Try with sample data"* button that inserts 3–4 realistic historical entries (spaced over 6 months, mild upward trend) so the dashboard immediately shows trends. User can clear them anytime from Settings or by deleting individually.

---

### 12. Memory Update

Save **`mem://features/health-module`** documenting:
- Top-level tab with vitals + blood biomarkers grouped into Metabolic/Cardiovascular/Blood
- Standard adult ranges (AHA/ADA/WHO) drive Optimal/Borderline/Out pills
- AI lab extraction via Lovable AI Gemini vision (`ai-health-extract` edge function), pre-fills modal with highlighted values
- Compact "Health Tree" widget in Insights panel, leaves & color tied to weighted aggregate score
- Disclaimer: not medical advice. Back-dating supported. Sample data seedable on first load.

Update `mem://index.md` with one-line reference to the new memory.

---

### Files Touched Summary

**New (15)**: 1 migration, 1 storage bucket setup, 1 edge function, 9 components, 1 hook, 1 data lib, 1 memory file
**Modified (4)**: `src/pages/Index.tsx`, `src/components/settings/ModulesTab.tsx`, `src/hooks/useUserSettings.ts` (defaults), `mem://index.md`