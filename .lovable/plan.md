
## Plan: Add Planning Mind-Board Module

### Overview
Add a new "Planning" tab that provides a full project planning system with 4 sub-views (Portfolio, Stack, Actions, Map), inspired by the Life Compass project but using MindsetForest's pillars, Supabase persistence, glass-card styling, and AI features.

### Database
Create a `planning_tasks` table for the hierarchical task tree:
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL)
- `project_id` (uuid, references user_projects)
- `parent_id` (uuid, nullable, self-reference)
- `level` (text: 'goal' | 'phase' | 'task' | 'action' | 'link')
- `title` (text)
- `done` (boolean, default false)
- `deadline` (text, nullable)
- `leverage` (text, nullable: 'low'|'medium'|'high')
- `energy` (text, nullable)
- `time_minutes` (integer, nullable)
- `url` (text, nullable — for link nodes)
- `icon` (text, nullable)
- `notes` (text, default '')
- `sort_order` (integer, default 0)
- `created_at` (timestamptz)

RLS: owner-only policies for all operations.

### New Files

**`src/hooks/usePlanningState.ts`**
- CRUD hook for `planning_tasks`
- Fetches all tasks for a project, add/update/delete/toggle

**`src/components/planning/PlanningView.tsx`**
- Main container with 4 sub-views: Portfolio, Stack, Actions, Map
- Top toolbar with sub-view switcher
- Uses existing `user_projects` for project management

**`src/components/planning/PlanningPortfolio.tsx`**
- Projects grouped by parent pillar/category
- Progress bars, "New Project" dialog
- Click project → opens Stack view

**`src/components/planning/PlanningStack.tsx`**
- Hierarchical collapsible list (Goal → Phase → Task → Action)
- Inline add, toggle done, delete
- AI decompose button (uses existing AI edge function pattern)

**`src/components/planning/PlanningActions.tsx`**
- Flat list of all action-level tasks across projects
- Sort by pillar, project, leverage
- Batch select + mark done
- Hide completed toggle

**`src/components/planning/PlanningMap.tsx`**
- ReactFlow-based node map (requires `@xyflow/react`)
- Project root node → task tree with colored edges
- Add child popover, inline edit, context menu
- Node detail sheet panel

**`src/components/planning/PlanningNodeDetail.tsx`**
- Side sheet for editing task details (notes, deadline, leverage, energy, icon)

### Files to Modify

**`src/pages/Index.tsx`** — Add "planning" to Tab type, labels, order, render

**`src/components/settings/ModulesTab.tsx`** — Add planning to ALL_MODULES

### Dependencies
- `@xyflow/react` — for the Map view

### Notes
- Reuses existing `user_projects` table (already has parent_category linking to pillars)
- AI features will use existing Lovable AI edge function patterns
- Map view will have the same node types (ProjectNode, TaskNode, LinkNode) adapted to MindsetForest's design tokens
