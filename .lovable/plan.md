

## Fix Share Link URLs

The share modal currently builds links from `window.location.origin`, which on the preview gives a `lovable.app` URL that requires a Lovable login. We'll make share links always point to the user's real published domain.

### Why this happens

- Preview URL (`id-preview--*.lovable.app`) is gated behind Lovable's preview auth — anyone visiting it must sign in to Lovable, even for a public route.
- Published URL (`hmqe.org`) is the actual public site where `/share/library/:shareId` works for anyone.
- Right now `window.location.origin` returns whichever environment the owner is currently in, so generated links inherit that environment's auth wall.

### Solution

**1. Add a canonical public domain constant**

In a new tiny file `src/lib/share-config.ts`:
```ts
export const PUBLIC_SHARE_ORIGIN = "https://hmqe.org";
```

This is the single source of truth for share links. If the domain ever changes, one edit fixes everything.

**2. Update `ShareLibraryModal.tsx`**

Replace both `window.location.origin` usages in `copyUrl` and `copyEmbed` with `PUBLIC_SHARE_ORIGIN`. So the user always copies:
```
https://hmqe.org/share/library/{shareId}
```
…regardless of whether they're in preview or production.

**3. Add a small explainer line in the modal**

Below the "Create share link" button, a subtle note:
> 🔗 Links use your public domain `hmqe.org` so anyone can view without logging in.

**4. Fix the React `forwardRef` warning** (visible in console)

The `ExistingShareRow` and `ShareLibraryModal` components are being passed refs by `framer-motion`'s `AnimatePresence` but aren't wrapped in `forwardRef`. Quick fix: wrap `ExistingShareRow` (and the modal's inner motion children if needed) so the warning goes away. Doesn't change behavior, just removes log noise.

### Files to Modify

- **NEW:** `src/lib/share-config.ts` — exports `PUBLIC_SHARE_ORIGIN`
- **MODIFY:** `src/components/library/ShareLibraryModal.tsx` — use `PUBLIC_SHARE_ORIGIN`, add helper text, wrap `ExistingShareRow` in `forwardRef`

### Out of Scope

- Auto-detecting the domain via Supabase config (overkill for one project)
- A user-facing "set my custom domain" setting (would only matter if multiple users had their own domains; here it's a single-tenant app)
- Removing the preview auth wall (controlled by Lovable infra, not app code)

