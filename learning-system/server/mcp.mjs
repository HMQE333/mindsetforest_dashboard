#!/usr/bin/env node
/**
 * Learning system: one MCP server (stdio) + a teaching board (http://localhost).
 * No dependencies: Node 18+ only. Everything it reads and writes lives in this folder:
 *   vault/   Obsidian vault (Me/, Styles/, Tools/, Subjects/, Knowledge/, system.json)
 *   data/    log.jsonl (one learning event per line), board.json (what the board shows)
 *
 * The rules that must not slip (folders, required fields) live here, in the tool
 * schemas and their checks, not in the AI's memory: a wrong call is refused with
 * a message that says what to fix.
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VAULT = path.join(ROOT, "vault");
const DATA = path.join(ROOT, "data");
const LOG = path.join(DATA, "log.jsonl");
const BOARD_STATE = path.join(DATA, "board.json");
const RESULTS = path.join(DATA, "results.jsonl");
const PORT0 = Number(process.env.LEARNING_PORT || 4319);
const RESULT_KINDS = ["solved", "hinted", "failed", "explained", "unsure", "understood", "confused"];

fs.mkdirSync(DATA, { recursive: true });

// ---------------------------------------------------------------- files

/** A path inside the vault, or an error (no escaping the folder). */
function inVault(rel) {
  const p = path.resolve(VAULT, rel);
  if (p !== VAULT && !p.startsWith(VAULT + path.sep)) throw new Error(`Path must stay inside the vault: ${rel}`);
  return p;
}
const read = (rel) => fs.readFileSync(inVault(rel), "utf8");
const exists = (rel) => fs.existsSync(inVault(rel));
function write(rel, text) {
  const p = inVault(rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(VAULT, p).split(path.sep).join("/");
const slug = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** "---\nkey: value\n---\nbody" -> { meta, body } (flat keys; [a, b] lists). */
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const v = kv[2].trim();
    meta[kv[1]] = /^\[.*\]$/.test(v) ? v.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean) : v;
  }
  return { meta, body: m[2] };
}

function readLog() {
  if (!fs.existsSync(LOG)) return [];
  return fs.readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const appendJsonl = (file, obj) => fs.appendFileSync(file, JSON.stringify(obj) + "\n");

// ---------------------------------------------------------------- search

/** Plain word search over the vault's .md files, ranked by how often and how rarely the words appear. */
function search(query, limit = 8) {
  const words = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const q = [...new Set(words(query))];
  if (!q.length) return [];
  const docs = walk(VAULT).filter((p) => p.endsWith(".md")).map((p) => {
    const text = fs.readFileSync(p, "utf8");
    return { path: rel(p), text, tokens: words(text + " " + rel(p)) };
  });
  const df = Object.fromEntries(q.map((w) => [w, docs.filter((d) => d.tokens.includes(w)).length]));
  return docs
    .map((d) => {
      let score = 0;
      for (const w of q) {
        const tf = d.tokens.filter((t) => t === w || t.startsWith(w)).length;
        if (tf) score += (1 + Math.log(tf)) * Math.log(1 + docs.length / (1 + df[w]));
      }
      if (!score) return null;
      const lower = d.text.toLowerCase();
      const at = Math.max(0, ...q.map((w) => lower.indexOf(w)).filter((i) => i >= 0).slice(0, 1));
      return { path: d.path, score: Math.round(score * 100) / 100, excerpt: d.text.slice(Math.max(0, at - 160), at + 240).replace(/\s+/g, " ").trim() };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ---------------------------------------------------------------- styles & tools

function styles() {
  if (!exists("Styles")) return [];
  return fs.readdirSync(inVault("Styles")).filter((f) => f.endsWith(".md")).map((f) => {
    const { meta } = frontmatter(read(`Styles/${f}`));
    const stat = fs.statSync(inVault(`Styles/${f}`));
    return { id: f.replace(/\.md$/, ""), name: meta.name || f, when: meta.when || "", tools: meta.tools || [], version: stat.mtime.toISOString().slice(0, 10) };
  });
}
const styleIds = () => styles().map((s) => s.id);
const toolIds = () => (exists("Tools") ? fs.readdirSync(inVault("Tools")).filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, "")) : []);

// ---------------------------------------------------------------- board (http)

let boardUrl = null;
let browserOpened = false;
const clients = new Set();

function boardState() {
  try { return JSON.parse(fs.readFileSync(BOARD_STATE, "utf8")); } catch { return null; }
}
function setBoard(state) {
  fs.writeFileSync(BOARD_STATE, JSON.stringify(state));
  for (const res of clients) res.write(`data: ${JSON.stringify({ id: state.id })}\n\n`);
}

function startBoard(port = PORT0, tries = 10) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(ROOT, "board", "index.html")));
    }
    if (url.pathname === "/api/board") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(boardState()));
    }
    if (url.pathname === "/api/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write(": hi\n\n");
      clients.add(res);
      return req.on("close", () => clients.delete(res));
    }
    if (url.pathname === "/api/result" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => { body += c; if (body.length > 100_000) req.destroy(); });
      return req.on("end", () => {
        try {
          const r = JSON.parse(body);
          const b = boardState();
          appendJsonl(RESULTS, { at: new Date().toISOString(), board: b?.id ?? null, tool: b?.tool ?? null, seen: false, result: r });
          res.writeHead(204).end();
        } catch { res.writeHead(400).end(); }
      });
    }
    res.writeHead(404).end();
  });
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE" && tries > 0) startBoard(port + 1, tries - 1);
    else boardUrl = null;
  });
  server.listen(port, "127.0.0.1", () => { boardUrl = `http://localhost:${port}/`; });
}

function openBrowser(url) {
  if (browserOpened || process.env.LEARNING_NO_BROWSER) return;
  browserOpened = true;
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try { spawn(cmd[0], cmd[1], { detached: true, stdio: "ignore" }).unref(); } catch { /* the url is in the reply */ }
}

// ---------------------------------------------------------------- tools

const S = (props, required = Object.keys(props)) => ({ type: "object", properties: props, required, additionalProperties: false });
const str = (description) => ({ type: "string", description });
const num = (description) => ({ type: "number", description });

const TOOLS = [
  {
    name: "me",
    description: "START EVERY SESSION HERE. Returns system.json (folders, rules, session start/end steps), the teacher rules (Me/Teacher.md), the learner's profile, what they already know (anchors) and their philosophy.",
    inputSchema: S({}),
    run: () => {
      const f = (p) => (exists(p) ? read(p) : "(missing)");
      return [
        "## system.json", f("system.json"),
        "## Me/Teacher.md", f("Me/Teacher.md"),
        "## Me/Profile.md", f("Me/Profile.md"),
        "## Me/Known.md (anchors: explain new things through these)", f("Me/Known.md"),
        "## Me/Philosophy.md", f("Me/Philosophy.md"),
        "## Styles", JSON.stringify(styles(), null, 1),
        "## Tools on the board", toolIds().join(", ") || "(none)",
      ].join("\n\n");
    },
  },
  {
    name: "search",
    description: "Search the vault (notes, subjects, Me/) by words. Use before explaining, to find anchors and what the learner already has.",
    inputSchema: S({ query: str("words to look for"), limit: num("max results, default 8") }, ["query"]),
    run: ({ query, limit }) => JSON.stringify(search(query, Math.min(30, limit || 8)), null, 1),
  },
  {
    name: "read",
    description: "Read one file from the vault by its path (as search returns it), e.g. Subjects/mechatronics/map.md.",
    inputSchema: S({ path: str("path inside the vault") }),
    run: ({ path: p }) => (exists(p) ? read(p) : `Not found: ${p}`),
  },
  {
    name: "styles",
    description: "List the learning styles (Styles/*.md): id, name, when to use it, tools it uses. Suggest one; the learner decides.",
    inputSchema: S({}),
    run: () => JSON.stringify(styles(), null, 1),
  },
  {
    name: "style",
    description: "Load one learning style's full prompt. Follow it for this part of the session.",
    inputSchema: S({ id: str("style id from styles()") }),
    run: ({ id }) => {
      if (!styleIds().includes(id)) throw new Error(`No style "${id}". Known: ${styleIds().join(", ")}`);
      return read(`Styles/${id}.md`);
    },
  },
  {
    name: "map",
    description: "Read or write a subject's map (Subjects/<subject>/map.md): why the field exists, 5-10 core ideas with an analogy and 'needs: ...', where the model breaks. Order of learning: what is needed first, then what unlocks most.",
    inputSchema: S({ subject: str("subject name"), content: str("full markdown to save; omit to read") }, ["subject"]),
    run: ({ subject, content }) => {
      const p = `Subjects/${slug(subject)}/map.md`;
      if (content === undefined) return exists(p) ? read(p) : `No map yet at ${p}. Write one with map({subject, content}).`;
      write(p, content);
      return `Saved ${p}`;
    },
  },
  {
    name: "show",
    description: "Put something on the teaching board (opens in the learner's browser). Either a saved tool from Tools/ with data (tool + data), or your own HTML (html) when no tool fits. The page can report a result with window.boardResult({...}); read it with results().",
    inputSchema: S({ title: str("what this is"), tool: str("id of a tool in Tools/"), data: { type: "object", description: "data for the tool (see the tool's DATA comment)" }, html: str("your own full HTML when no saved tool fits") }, ["title"]),
    run: ({ title, tool, data, html }) => {
      let page;
      if (tool) {
        if (!toolIds().includes(tool)) throw new Error(`No tool "${tool}". Known: ${toolIds().join(", ")}. Or pass html.`);
        page = read(`Tools/${tool}.html`);
      } else if (html) page = html;
      else throw new Error("Pass tool (+ data) or html.");
      const state = { id: Date.now().toString(36), title, tool: tool || null, data: data ?? null, html: page };
      setBoard(state);
      if (!boardUrl) return "The board server is not running (port busy?). Set LEARNING_PORT and restart.";
      openBrowser(boardUrl);
      return `On the board: ${boardUrl} (${title}). Results arrive through results().`;
    },
  },
  {
    name: "results",
    description: "Results the board sent since you last asked (answers, scores). Then log() them.",
    inputSchema: S({}),
    run: () => {
      if (!fs.existsSync(RESULTS)) return "[]";
      const rows = fs.readFileSync(RESULTS, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const fresh = rows.filter((r) => !r.seen);
      fs.writeFileSync(RESULTS, rows.map((r) => JSON.stringify({ ...r, seen: true })).join("\n") + (rows.length ? "\n" : ""));
      return JSON.stringify(fresh.map(({ seen, ...r }) => r), null, 1);
    },
  },
  {
    name: "log",
    description: `Record one learning event. Required after every exercise or explanation. result is one of: ${RESULT_KINDS.join(", ")}.`,
    inputSchema: S({
      subject: str("subject"), idea: str("the idea/concept from the map"), style: str("style id used"), tool: str("board tool id, or 'none'"),
      result: { type: "string", enum: RESULT_KINDS }, minutes: num("about how long"), note: str("what happened, in a sentence: mistakes, what clicked"),
    }, ["subject", "idea", "style", "result", "minutes", "note"]),
    run: (a) => {
      if (!styleIds().includes(a.style)) throw new Error(`style must be one of: ${styleIds().join(", ")}`);
      const st = styles().find((s) => s.id === a.style);
      const e = { at: new Date().toISOString(), subject: a.subject, idea: a.idea, style: a.style, style_version: st.version, tool: a.tool || "none", result: a.result, minutes: a.minutes, note: a.note };
      appendJsonl(LOG, e);
      return `Logged: ${e.subject} / ${e.idea} (${e.result})`;
    },
  },
  {
    name: "history",
    description: "The learning log, filtered. Use it to judge what the learner knows (evidence, with dates) and what is due for a check after 3/7/30 days.",
    inputSchema: S({ subject: str("only this subject"), idea: str("only this idea"), limit: num("newest N, default 50") }, []),
    run: ({ subject, idea, limit }) => {
      let rows = readLog();
      if (subject) rows = rows.filter((r) => r.subject.toLowerCase().includes(subject.toLowerCase()));
      if (idea) rows = rows.filter((r) => r.idea.toLowerCase().includes(idea.toLowerCase()));
      const now = Date.now();
      const due = [...new Map(rows.map((r) => [`${r.subject}|${r.idea}`, r])).values()]
        .map((r) => ({ subject: r.subject, idea: r.idea, last: r.at.slice(0, 10), days: Math.floor((now - Date.parse(r.at)) / 864e5) }))
        .filter((r) => [3, 7, 30].some((d) => r.days >= d && r.days < d + 2));
      return JSON.stringify({ events: rows.slice(-(limit || 50)), due_for_check: due }, null, 1);
    },
  },
  {
    name: "add_known",
    description: "Add an understanding to Me/Known.md. ONLY after the learner confirmed it in their own words; pass their words.",
    inputSchema: S({ idea: str("the idea"), my_words: str("the learner's own explanation"), anchors: { type: "array", items: { type: "string" }, description: "what it connects to" }, confirmed_by_learner: { type: "boolean" } }),
    run: ({ idea, my_words, anchors, confirmed_by_learner }) => {
      if (!confirmed_by_learner) throw new Error("Ask the learner to confirm it in their own words first.");
      const p = "Me/Known.md";
      const head = exists(p) ? read(p).trimEnd() + "\n\n" : "# What I know\n\n";
      write(p, `${head}## ${idea}\n${my_words.trim()}\n${anchors.length ? `\nConnects to: ${anchors.map((a) => `[[${a}]]`).join(", ")}\n` : ""}_added ${new Date().toISOString().slice(0, 10)}_\n`);
      return `Added "${idea}" to ${p}`;
    },
  },
  {
    name: "save_note",
    description: "Save a note in Knowledge/ (Markdown). Keep notes atomic: one idea per note.",
    inputSchema: S({ title: str("note title"), content: str("markdown"), subject: str("subject, optional") }, ["title", "content"]),
    run: ({ title, content, subject }) => {
      const p = `Knowledge/${subject ? slug(subject) + "/" : ""}${slug(title)}.md`;
      write(p, `# ${title}\n\n${content.trim()}\n`);
      return `Saved ${p}`;
    },
  },
  {
    name: "save_tool",
    description: "Save a board tool you made so it can be reused (Tools/<id>.html). Start the file with a comment <!-- DATA: ... --> describing the data it takes; call window.boardResult({...}) to report results.",
    inputSchema: S({ id: str("short id, e.g. timeline-sort"), html: str("full HTML") }),
    run: ({ id, html }) => { write(`Tools/${slug(id)}.html`, html); return `Saved Tools/${slug(id)}.html`; },
  },
  {
    name: "save_style",
    description: "Save a learning style (Styles/<id>.md), e.g. when the learner says 'save how you taught me now as a style'.",
    inputSchema: S({ id: str("short id"), name: str("display name"), when: str("when to use it"), tools: { type: "array", items: { type: "string" } }, prompt: str("the instructions") }, ["id", "name", "when", "prompt"]),
    run: ({ id, name, when, tools, prompt }) => {
      write(`Styles/${slug(id)}.md`, `---\nname: ${name}\nwhen: ${when}\ntools: [${(tools || []).join(", ")}]\n---\n${prompt.trim()}\n`);
      return `Saved Styles/${slug(id)}.md`;
    },
  },
  {
    name: "end_session",
    description: "CLOSE EVERY SESSION. A short summary appended to data/sessions.md; proposals for Known and for the style go there for the learner to accept.",
    inputSchema: S({ summary: str("what was learned, in 2-3 sentences"), next: str("what to do next time"), known_proposals: { type: "array", items: { type: "string" } }, style_note: str("what worked or not about the style") }, ["summary", "next"]),
    run: ({ summary, next, known_proposals, style_note }) => {
      const d = new Date().toISOString().slice(0, 16).replace("T", " ");
      const lines = [`## ${d}`, summary.trim(), `**Next:** ${next.trim()}`];
      if (known_proposals?.length) lines.push(`**Maybe known now:** ${known_proposals.join("; ")}`);
      if (style_note) lines.push(`**Style:** ${style_note}`);
      fs.appendFileSync(path.join(VAULT, "Sessions.md"), lines.join("\n") + "\n\n");
      return "Session closed (vault/Sessions.md).";
    },
  },
];

// ---------------------------------------------------------------- MCP over stdio (JSON-RPC 2.0, one message per line)

function reply(id, result, error) {
  process.stdout.write(JSON.stringify(error ? { jsonrpc: "2.0", id, error } : { jsonrpc: "2.0", id, result }) + "\n");
}

function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return reply(id, {
      protocolVersion: params?.protocolVersion || "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "learning-system", version: "0.1.0" },
      instructions: "A personal learning system. Call me() first in every session and end_session() at the end. Explain new things through the learner's anchors (Me/Known.md). Log every exercise with log().",
    });
  }
  if (method === "tools/list") return reply(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
  if (method === "tools/call") {
    const t = TOOLS.find((x) => x.name === params?.name);
    if (!t) return reply(id, { content: [{ type: "text", text: `Unknown tool ${params?.name}` }], isError: true });
    try {
      const args = params.arguments || {};
      for (const k of t.inputSchema.required || []) if (args[k] === undefined || args[k] === "") throw new Error(`Missing required field: ${k}`);
      return reply(id, { content: [{ type: "text", text: String(t.run(args)) }] });
    } catch (e) {
      return reply(id, { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });
    }
  }
  if (method === "ping") return reply(id, {});
  if (id !== undefined && !method?.startsWith("notifications/")) reply(id, null, { code: -32601, message: `Method not found: ${method}` });
}

// ---------------------------------------------------------------- start

if (process.argv.includes("--check")) {
  console.log(`Learning system OK\n  folder: ${ROOT}\n  styles: ${styleIds().join(", ")}\n  tools:  ${toolIds().join(", ")}\n  log:    ${readLog().length} events`);
  process.exit(0);
}

startBoard();
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try { handle(JSON.parse(line)); } catch (e) { process.stderr.write(`bad message: ${e.message}\n`); }
  }
});
process.stdin.on("end", () => process.exit(0));
