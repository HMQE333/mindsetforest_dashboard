

## Archive: MVP to Final — Improvement Plan

### Current State Summary
The Archive has solid bones: Inbox with AI clean/split, Library with filters/sort, Links with 4 view modes, Images with gallery/lightbox, multi-select with bulk actions, AI preview modal, and context menus. But several areas feel unfinished.

### Gaps to Address

**1. Search is weak — no full-text search, no cross-tab search**
- Library search only filters visible blocks by title/content substring match
- Links tab has separate search, Images tab has none
- No global search across all sub-views

**2. No pagination or virtual scrolling**
- All blocks render at once. 100+ blocks will lag
- Images gallery loads every image simultaneously

**3. No "Select All" / "Deselect All" in Library**
- Multi-select requires clicking each block individually
- No way to quickly select filtered results

**4. Inbox has no drafts — paste is lost on navigation**
- If you switch tabs mid-paste, text is gone
- No auto-save or draft persistence

**5. Block ordering / pinning**
- No way to pin important blocks to top
- No manual reordering

**6. No export**
- Can't export blocks as markdown, JSON, or text file
- No backup mechanism

**7. Empty states are basic**
- Just emoji + one line of text, no guidance

**8. AI result from multi-note prompt can't be edited before saving**
- Single-block preview modal has "Edit then Accept" but multi-note AI prompt modal shows raw text with no editing

**9. No tag management**
- Can't see all tags at a glance, rename, or merge tags
- Custom tags are freeform with no autocomplete

**10. Mobile UX**
- Floating bar may overlap content on small screens
- Block cards don't have swipe actions

---

### Prioritized Plan (highest impact first)

#### Phase 1 — Core polish

| Change | Files |
|--------|-------|
| **Global search bar** at top of Archive that searches across all blocks (title, content, tags), with results showing which sub-view the block belongs to | `ArchiveView.tsx`, new `ArchiveSearchResults.tsx` |
| **Select All / Deselect All** button in Library filter bar when in multi-select mode | `ArchiveLibrary.tsx` |
| **Editable AI result in prompt modal** — make the result textarea editable before saving, like the single-block preview | `ArchiveAIPromptModal.tsx` |
| **Inbox draft auto-save** — persist textarea content to localStorage so it survives tab switches | `ArchiveInbox.tsx` |
| **Pin blocks** — add `is_pinned` boolean column, pinned blocks sort to top regardless of sort mode | DB migration, `useArchiveState.ts`, `ArchiveLibrary.tsx`, `ArchiveBlockCard.tsx` |

#### Phase 2 — Scale & export

| Change | Files |
|--------|-------|
| **Lazy loading / pagination** — load blocks in batches of 50 with "Load more" or infinite scroll | `useArchiveState.ts`, `ArchiveLibrary.tsx` |
| **Export** — "Export All" and "Export Selected" buttons that download as `.md` or `.json` | `ArchiveView.tsx` or new `ArchiveExport.tsx` |
| **Tag autocomplete** — when editing tags in EditModal, show existing tags as suggestions | `ArchiveEditModal.tsx` |

#### Phase 3 — Refinement

| Change | Files |
|--------|-------|
| **Better empty states** with contextual guidance (e.g., "Paste Discord logs in Inbox to get started") | All sub-view components |
| **Mobile floating bar** — reposition to bottom sheet on small screens, add swipe-to-select on block cards | `ArchiveView.tsx`, `ArchiveBlockCard.tsx` |
| **Keyboard shortcuts** — `Ctrl+A` select all, `Escape` clear selection, `Ctrl+K` open search | `ArchiveView.tsx` |

---

### Database Change
One migration needed for pinning:
```sql
ALTER TABLE archive_blocks ADD COLUMN is_pinned boolean NOT NULL DEFAULT false;
```

No RLS changes needed — existing policies already cover all CRUD by `user_id`.

### Recommendation
Start with **Phase 1** — it's 5 changes that make the archive feel complete and usable daily. Phase 2 is for when block count grows. Phase 3 is polish.

