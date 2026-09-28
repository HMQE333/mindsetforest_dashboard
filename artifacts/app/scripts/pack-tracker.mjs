// Packs the desktop tracker (repo tracker/) into public/downloads/ so the Stats
// page can offer it for download. Runs before every build (see package.json
// "prebuild") and on demand with `pnpm pack:tracker`. Uses fflate, which the
// app already depends on, so no extra tooling is needed on the build host.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const here = fileURLToPath(new URL(".", import.meta.url));
const trackerDir = join(here, "..", "..", "..", "tracker");
const outDir = join(here, "..", "public", "downloads");
const outFile = join(outDir, "mindsetforest-tracker.zip");

const SKIP_DIRS = new Set([".venv", "dist", "build", "__pycache__", ".pytest_cache", ".mypy_cache"]);
const SKIP_FILES = new Set(["config.json", "session.bin", "tracker.db", "tracker.log", "icon.ico"]);

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, files);
    } else if (!SKIP_FILES.has(name) && !name.endsWith(".pyc") && !name.endsWith(".spec")) {
      files.push(full);
    }
  }
  return files;
}

const files = walk(trackerDir).sort();
if (files.length === 0) {
  console.error(`pack-tracker: nothing found under ${trackerDir}`);
  process.exit(1);
}

const entries = {};
for (const file of files) {
  const rel = "mindsetforest-tracker/" + relative(trackerDir, file).split(sep).join("/");
  entries[rel] = readFileSync(file);
}

// Deterministic archive: fixed timestamps so a rebuild with no source change
// produces an identical file (keeps git diffs quiet).
const zipped = zipSync(entries, { level: 9, mtime: new Date("2026-01-01T00:00:00Z") });
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, zipped);
console.log(`pack-tracker: ${files.length} files -> ${relative(process.cwd(), outFile)} (${(zipped.length / 1024).toFixed(0)} KB)`);
