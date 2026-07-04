---
name: Mobile (Expo) React duplication vs web app's React 18 pin
description: Why artifacts/app-mobile needs a Metro resolver that forces a single React copy.
---

# Expo mobile app must force a single React copy in Metro

`artifacts/app-mobile` (Expo, React 19) shares a pnpm workspace with `artifacts/app`,
which intentionally pins React 18. Because react@18.3.1 physically exists in the
workspace, pnpm resolved some of the mobile app's deps against the react@18 **peer
variant** while the renderer (react-native-web / react-dom) used react@19. Two React
instances → "Invalid hook call" / "Cannot read properties of null (reading 'useState')".
It surfaced first at `useFonts` (from `@expo-google-fonts/inter`, which resolved react
18); `@supabase/supabase-js` and `react-native-url-polyfill` also resolved react 18.

**Why:** The default scaffold `metro.config.js` is bare `getDefaultConfig(__dirname)`,
which does not dedupe React across pnpm peer variants. pnpm symlinks look deduped when
you `readlink .pnpm/<pkg>/node_modules/react`, but the app's own node_modules symlink
for a package can point at that package's react@18 peer-variant dir. Verify with
`require.resolve("react/package.json", { paths: [<pkgDir>] })` from each dep, not by
inspecting a single `.pnpm` dir.

**How to apply:** Keep the custom `metro.config.js` in `artifacts/app-mobile` that adds
a `resolver.resolveRequest` override redirecting every `react` / `react-dom` (and their
subpaths like `react/jsx-runtime`, `react-dom/client`) to this app's own copy via
`require.resolve(moduleName, { paths: [projectRoot] })`. Do NOT revert it to the bare
default. Restart the Expo workflow after any metro.config.js or dependency change — HMR
does not pick up config/dependency changes.
