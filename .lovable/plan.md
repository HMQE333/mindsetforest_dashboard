

## Shareable Library Views

Generate a **public read-only link** for the Library that bakes in the current filters (search, status, rating, tag, format, pillar, view mode, books vs courses tab). Anyone with the link sees the same filtered grid — no login. Perfect for sharing a reading list or embedding in Notion via iframe.

### Concept

From the Library toolbar, click **🔗 Share** → opens a popover where you can:
1. Tweak which filters get baked in (toggles for status / pillar / tag / search / etc.)
2. Toggle **Public / Private**
3. Copy the share URL or the iframe embed snippet

URL format:
```
/share/library/{shareId}
```

Anyone visiting that URL gets a clean, read-only Library page (no nav, no auth) showing only books/courses matching the saved filters from the owner's library.

### Data Model

New table `library_shares`:
```
id          uuid pk             -- short, used in URL
user_id     uuid                -- owner
slug        text                -- short readable id (e.g. 'reading-list-2026')
name        text                -- friendly label
tab         text                -- 'books' | 'courses'
filters     jsonb               -- {status, rating, tag, format, pillar, search, viewMode}
is_public   boolean             -- master switch
view_count  int                 -- bumped on each view
created_at  timestamptz
updated_at  timestamptz
```

RLS:
- Owner: full CRUD on own rows
- Anonymous: SELECT allowed only when `is_public = true` (read-only public policy)

### Public Read Endpoint

To avoid exposing the full `user_books` table publicly, add a **SECURITY DEFINER** function:
```sql
get_shared_library(share_id uuid)
  → returns books/courses matching the share's filters, only if is_public
```

This way anonymous visitors call one RPC, get back the filtered list, and never touch the protected tables directly.

### UI Changes

**1. `LibraryView.tsx`**
- Add a **🔗 Share** button next to AI Suggest / Add Book in the toolbar
- Opens new `ShareLibraryModal`

**2. New `ShareLibraryModal.tsx`**
- Section: "What to share" — checkboxes per filter (search term, pillar, tag, status, rating, format, view mode, tab). Default: all current filters baked in.
- Section: "Visibility" — toggle Public ↔ Private (Private = link disabled, returns 404)
- Section: "Your link" — copy URL button + copy iframe snippet button
- Section: "Existing shares" — list of saved shares with rename / toggle public / delete actions
- Live preview chip row showing the active filters being saved

**3. New page `src/pages/SharedLibrary.tsx`**
- Route: `/share/library/:shareId` (no `<ProtectedRoute>`)
- Fetches via `get_shared_library(shareId)` RPC
- Renders a clean header: "📚 {ShareName}" + filter chips (read-only) + grid of `BookCard` / `CourseCard` (clicks disabled or just open a tiny detail popover, no edit)
- Compact footer: "Powered by Lovable" + small link to landing page
- Iframe-friendly: no app nav, no padding overflow, dark-aware
- 404 / "This share is private" view if not public

**4. New hook `useLibraryShares.ts`**
- `shares` list, `createShare`, `updateShare`, `deleteShare`, `togglePublic`

**5. `App.tsx`**
- Add public route `/share/library/:shareId` → `<SharedLibrary />` (no auth wrapper)

### Filter Application

When generating a share, the modal saves a `filters` JSONB blob. The public RPC re-applies the same filter logic server-side (status, pillar, tag, format, rating, search) so the returned list mirrors what the owner saw, and stays current as they add/remove books later.

### Embed Snippet

Provided in the modal as one-click copy:
```html
<iframe src="https://hmqe.org/share/library/abc123" 
        width="100%" height="600" frameborder="0"></iframe>
```

### Files to Create / Modify

- **NEW** migration: `library_shares` table + RLS + `get_shared_library` SECURITY DEFINER function
- **NEW** `src/hooks/useLibraryShares.ts`
- **NEW** `src/components/library/ShareLibraryModal.tsx`
- **NEW** `src/pages/SharedLibrary.tsx`
- **MODIFY** `src/components/library/LibraryView.tsx` — add 🔗 Share button + modal trigger, pass current filters
- **MODIFY** `src/App.tsx` — add public `/share/library/:shareId` route
- **MODIFY** `src/components/library/BookCard.tsx` & `CourseCard.tsx` — add a `readOnly` prop to disable click handlers in shared view (lightweight)

### Out of Scope

- Password-protected shares
- Editable / collaborative shares
- Sharing other modules (Archive, Cooking) — same pattern can be cloned later
- Custom branding / theming per share
- Analytics dashboard for view counts (raw counter only)

