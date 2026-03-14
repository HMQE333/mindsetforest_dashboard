

## Plan: Custom PNG Icons for Pillars

### Approach

Replace the current emoji-only icon input (the small text box on the left of each pillar row) with a dual-mode icon selector: users can either type an emoji **or** upload a PNG image. The uploaded image replaces the emoji and is displayed everywhere the pillar icon appears.

### UX Design

**In each pillar row** (CategoriesTab), the current 40×40 emoji input becomes a clickable icon area:
- If no custom image: shows the emoji (still editable by clicking and typing)
- A small camera/upload overlay icon in the corner — clicking it opens a file picker (PNG only)
- On upload: validates file (PNG, ≤256KB, ideally square), resizes client-side to 64×64, stores to a storage bucket, saves the URL
- Once an image is set: the area shows the image with a tiny ✕ button to remove it (reverts to emoji)
- Tooltip or helper text below the icon area: "PNG, max 256KB, square recommended"

**No separate upload modal** — keeps it inline and lightweight.

### Storage

- Create a `pillar-icons` public storage bucket via SQL migration
- RLS: authenticated users can upload/delete within their own `user_id/` folder, public read
- Files stored as `{user_id}/{pillar_id}.png`

### Data Model

Add `iconUrl?: string` to `CustomCategory` interface. When `iconUrl` is set, it takes priority over the `icon` emoji string. No DB migration needed — this is stored in the existing JSON preferences column.

### Client-Side Validation & Resize

Before uploading:
1. Check file type is `image/png` — reject others with toast "Only PNG files accepted"
2. Check file size ≤ 256KB — reject with toast "Icon must be under 256KB"
3. Load into a canvas, resize to 64×64, export as PNG blob — this ensures consistent rendering everywhere
4. Upload the resized blob to storage

### Rendering Changes

Everywhere pillar icons render (dashboard category grid, mission cards, archive pillar chips, etc.), check: if `iconUrl` exists, render an `<img>` with `object-fit: contain` and rounded corners; otherwise render the emoji text as before. The key rendering spots:
- `CategoryGrid.tsx` — main dashboard cards
- `CategoriesTab.tsx` — settings preview
- `ArchiveBlockCard.tsx` / pillar chips across archive
- `TrackerDetailedStats.tsx` — if pillars shown there

Create a small shared `PillarIcon` component that handles the emoji-vs-image logic in one place.

### Files to Change

- **SQL migration** — create `pillar-icons` storage bucket + RLS policies
- `src/hooks/useUserSettings.ts` — add `iconUrl` to `CustomCategory`
- `src/components/settings/CategoriesTab.tsx` — replace emoji input with dual-mode icon selector + upload logic
- `src/components/shared/PillarIcon.tsx` — new tiny component (emoji or img)
- `src/components/dashboard/CategoryGrid.tsx` — use `PillarIcon`
- Any other components rendering `cat.icon` — swap to `PillarIcon`

