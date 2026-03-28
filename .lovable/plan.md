

## Plan: Add Calendar Module

### Overview
Add a new "Calendar" tab as a module where users can view a monthly calendar, add important events, and filter them. Events will be stored in the database.

### Database
Create a `calendar_events` table:
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL)
- `title` (text, NOT NULL)
- `date` (text, NOT NULL, format YYYY-MM-DD)
- `color` (text, default '#8B5CF6')
- `tag` (text, default '')
- `notes` (text, default '')
- `created_at` (timestamptz, default now())

RLS: standard owner-only policies for SELECT, INSERT, UPDATE, DELETE.

### Files to Create

**`src/components/calendar/CalendarView.tsx`**
- Full-month grid calendar (custom-built, not the shadcn DayPicker)
- Month navigation (prev/next)
- Days show colored dots for events
- Click a day to see/add events in a side panel or inline expandable
- Filter bar at top: text search + color/tag filter
- Minimalist aesthetic matching the app's glass-card style

**`src/hooks/useCalendarEvents.ts`**
- CRUD hook for `calendar_events` table
- Fetches events for visible month range
- Add, update, delete events

**`src/components/calendar/CalendarEventModal.tsx`**
- Small modal/sheet to add or edit an event
- Fields: title, date (pre-filled from clicked day), color picker (few preset colors), tag, notes

### Files to Modify

**`src/pages/Index.tsx`**
- Add `"calendar"` to the `Tab` type, `ALL_TAB_LABELS`, and `TAB_ORDER`
- Import and render `CalendarView` in tab content section

**`src/components/settings/ModulesTab.tsx`**
- Add calendar to `ALL_MODULES` array so it can be toggled on/off

### No edge functions needed
All operations are direct database CRUD.

