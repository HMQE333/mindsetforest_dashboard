// Builds a self-contained preview of the app for static hosting under any
// path (hash routing, relative asset URLs) into artifacts/app/dist-preview.
// Needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the environment
// (or artifacts/app/.env) like a normal build.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const appDir = fileURLToPath(new URL("..", import.meta.url));

// A truncated key builds fine and fails only at runtime with "Invalid API key",
// so refuse obviously broken values here. Supabase publishable keys are
// "sb_publishable_" + 31 characters (46 total); legacy anon keys are ~200-char JWTs.
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const url = process.env.VITE_SUPABASE_URL || "";
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url.replace(/\/$/, ""))) {
  console.error(`preview-build: VITE_SUPABASE_URL is missing or malformed (${JSON.stringify(url)})`);
  process.exit(1);
}
if (key.length < 40 || !/^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+)$/.test(key)) {
  console.error(`preview-build: VITE_SUPABASE_PUBLISHABLE_KEY looks truncated or malformed (${key.length} chars, starts with ${JSON.stringify(key.slice(0, 15))}). ` +
    "Copy the full 'default publishable' key from Supabase -> Project Settings -> API Keys.");
  process.exit(1);
}
const env = { ...process.env, VITE_HASH_ROUTER: "1", BASE_PATH: "./" };
const result = spawnSync("pnpm", ["exec", "vite", "build", "--config", "vite.config.ts", "--outDir", join(appDir, "dist-preview")], {
  cwd: appDir,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
