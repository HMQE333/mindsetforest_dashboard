// Builds a self-contained preview of the app for static hosting under any
// path (hash routing, relative asset URLs) into artifacts/app/dist-preview.
// Needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the environment
// (or artifacts/app/.env) like a normal build.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const env = { ...process.env, VITE_HASH_ROUTER: "1", BASE_PATH: "./" };
const result = spawnSync("pnpm", ["exec", "vite", "build", "--config", "vite.config.ts", "--outDir", join(appDir, "dist-preview")], {
  cwd: appDir,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
