

## Use Wood Texture Image for Wood Card Style

Replace the current CSS-only gradient grain with the uploaded wood texture image for a more realistic look.

### Changes

**Copy asset**: Copy `user-uploads://image-45.png` to `public/images/wood-texture.png` (using public/ since it's referenced in CSS `background-image: url(...)`)

**`src/index.css`** — Update `.card-wood` styles:
- Replace the layered `repeating-linear-gradient` grain with `background-image: url('/images/wood-texture.png')`
- Use `background-size: cover` for full coverage
- Keep the warm brown border, inset shadows, and hover behavior
- Add a semi-transparent overlay via `background-blend-mode` to keep text readable and blend with the card's base color

### Files Changed
- `public/images/wood-texture.png` (new asset)
- `src/index.css` — swap gradient grain for texture image

