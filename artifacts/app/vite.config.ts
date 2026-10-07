import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const rawPort = process.env.PORT ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

/**
 * Publishes downloads/tracker-config.json with this deployment's Supabase URL
 * and publishable key. The Windows installer fetches it from the site, so the
 * values reach the exe without being committed to the repo; both are public
 * anyway (they are in the JS bundle). Without them nothing is emitted and the
 * installer falls back to asking for them in its advanced section.
 */
function trackerConfig(): Plugin {
  let env: Record<string, string> = {};
  return {
    name: "tracker-config",
    apply: "build",
    configResolved(config) {
      env = loadEnv(config.mode, config.envDir, "VITE_");
    },
    generateBundle() {
      const url = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) {
        this.warn(
          "VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not set: downloads/tracker-config.json is not emitted, " +
            "so the Windows installer cannot fetch them from this site.",
        );
        return;
      }
      this.emitFile({
        type: "asset",
        fileName: "downloads/tracker-config.json",
        source: JSON.stringify({ supabase_url: url, supabase_anon_key: key }, null, 2) + "\n",
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [react(), trackerConfig()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
