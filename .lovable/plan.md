

## Plan: Monthly Focus / Notifications Banner

Add a dismissable "Monthly Focus" banner that appears at the top of the Dashboard when the app opens. Users can set themes/reminders for the current month, and the banner shows them on every visit until dismissed for that session. The feature is toggleable via the Modules settings.

### How It Works

1. **New DB table `user_notifications`** stores the user's monthly focus items:
   - `id`, `user_id`, `title`, `content`, `month` (e.g. "2026-03"), `is_active`, `created_at`
   - RLS: users can only CRUD their own rows

2. **Monthly Focus Banner** (`src/components/dashboard/MonthlyFocusBanner.tsx`):
   - Queries active notifications for the current month
   - Renders a collapsible/dismissable banner at the top of DashboardView
   - Dismiss is session-only (useState), so it reappears next visit
   - Includes an inline "Edit Focus" button to add/edit/delete focus items
   - Small modal/popover for managing focus items (add text, toggle active, delete)

3. **Module Toggle**:
   - Add `{ id: "monthly-focus", label: "Monthly Focus", icon: "🎯", description: "Monthly theme reminders on dashboard" }` to `ModulesTab.tsx`
   - DashboardView conditionally renders the banner based on enabled modules

4. **Settings Integration**:
   - Add a new "Focus" tab to SettingsModal OR keep management inline in the banner itself (simpler)
   - Going with inline management in the banner to keep it lightweight

### Files Changed

| File | Change |
|------|--------|
| **Migration** | Create `user_notifications` table with RLS |
| `src/components/dashboard/MonthlyFocusBanner.tsx` | New component: banner + inline edit |
| `src/components/dashboard/DashboardView.tsx` | Import and render banner at top |
| `src/components/settings/ModulesTab.tsx` | Add monthly-focus module entry |
| `src/hooks/useUserSettings.ts` | Add "monthly-focus" to DEFAULT_MODULES |

### DB Schema

```sql
CREATE TABLE public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  month text NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
-- Standard per-user CRUD policies
```

### UI Sketch

```text
┌─────────────────────────────────────────┐
│ 🎯 Monthly Focus — March 2026      [×] │
│                                         │
│  • "Deep work on project X"             │
│  • "Read 2 books this month"            │
│  • "No social media before noon"        │
│                                    [✏️] │
└─────────────────────────────────────────┘
```

The banner uses glass-card styling, appears above the DashboardHero, and can be dismissed per session. The edit mode allows adding/removing focus items inline.

