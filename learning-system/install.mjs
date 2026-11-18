#!/usr/bin/env node
/**
 * One-time setup on a computer: adds this folder's MCP server to Claude Desktop
 * (keeps the rest of its config, writes a backup) and prints the line for
 * Claude Code. Run: node install.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const server = path.join(ROOT, "server", "mcp.mjs");
const entry = { command: "node", args: [server] };

const dir =
  process.platform === "win32" ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Claude")
  : process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support", "Claude")
  : path.join(os.homedir(), ".config", "Claude");
const file = path.join(dir, "claude_desktop_config.json");

let config = {};
if (fs.existsSync(file)) {
  try { config = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { console.error(`Could not read ${file} (not valid JSON). Fix or delete it, then run again.`); process.exit(1); }
  fs.copyFileSync(file, file + ".backup");
}
config.mcpServers = { ...(config.mcpServers || {}), learning: entry };
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(file, JSON.stringify(config, null, 2));

console.log(`✓ Claude Desktop: added "learning" to ${file}`);
console.log(`  Restart Claude Desktop (quit it fully, then open).`);
console.log(`\nClaude Code (optional), run once:`);
console.log(`  claude mcp add learning --scope user -- node "${server}"`);
console.log(`\nObsidian: open the folder ${path.join(ROOT, "vault")} as a vault.`);
console.log(`Check: node "${server}" --check`);
