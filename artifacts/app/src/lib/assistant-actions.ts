import { CATEGORIES } from "@/lib/dashboard-data";
import type { ScopeId } from "@/lib/assistant-context";

/**
 * Structured write actions the assistant can propose. These are never applied
 * automatically. The panel shows a confirm step first, and every action is
 * gated by the scope the user granted for the question (same permission model
 * as the read-only context).
 */
export type AssistantAction =
  | {
      type: "add_task";
      title: string;
      level?: "goal" | "phase" | "task" | "action";
      deadline?: string | null;
      notes?: string;
    }
  | {
      type: "add_mission";
      categoryId: string;
      title: string;
      description?: string;
      duration?: string;
      xp?: number;
    }
  | {
      type: "add_note";
      title: string;
      content: string;
      pillars?: string[];
      tags?: string[];
    }
  | {
      type: "add_mindmap_nodes";
      nodes: {
        title: string;
        level: "goal" | "phase" | "task" | "action";
        parentIndex?: number;
      }[];
    }
  | {
      type: "extend_mindmap";
      attachTo: string;
      nodes: {
        title: string;
        level: "goal" | "phase" | "task" | "action";
        parentIndex?: number;
      }[];
    };

export type ActionType = AssistantAction["type"];

export const ACTION_SCOPE: Record<ActionType, ScopeId> = {
  add_task: "planning",
  add_mission: "dashboard",
  add_note: "archive",
  add_mindmap_nodes: "planning",
  extend_mindmap: "planning",
};

export const ACTIONS_SENTINEL = "[[ACTIONS_ENABLED]]";

const VALID_LEVELS = new Set(["goal", "phase", "task", "action"]);
const VALID_CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

const PILLAR_NAMES: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.name]),
);
PILLAR_NAMES["uncategorized"] = "Uncategorized";
const VALID_PILLAR_IDS = new Set(Object.keys(PILLAR_NAMES));

const LEVEL_ICONS: Record<string, string> = {
  goal: "\u{1F3AF}", phase: "\u{1F6A9}", task: "\u2705", action: "\u26A1",
};

/** Parse flat nodes array (with parentIndex) into a formatted tree string. */
function nodesToTreePreview(nodes: { title: string; level: string; parentIndex?: number }[]): string {
  const lines: string[] = [];
  function walk(parentIdx: number | null, depth: number) {
    const children = nodes.filter((_, i) => {
      if (parentIdx === null) return n.parentIndex === undefined || n.parentIndex == null;
      return n.parentIndex === parentIdx;
    });
    for (const n of children) {
      const icon = LEVEL_ICONS[n.level] || "";
      lines.push("  ".repeat(depth) + icon + " " + n.title);
    }
  }
  walk(null, 0);
  return lines.join("\n");
}

function nodesLevelBreakdown(nodes: { level: string }[]): string {
  const counts: Record<string, number> = {};
  for (const n of nodes) counts[n.level] = (counts[n.level] || 0) + 1;
  return Object.entries(counts)
    .map(([lvl, n]) => `${LEVEL_ICONS[lvl] || ""} ${n} ${lvl}${n > 1 ? "s" : ""}`)
    .join(" · ");
}

export function buildActionInstructions(scopes: ScopeId[]): string {
  const specs: string[] = [];

  if (scopes.includes("planning")) {
    specs.push(
      "- add_task: create a standalone planning task. Fields: title (string, required), " +
        'level (one of "goal","phase","task","action"; default "task"), ' +
        'deadline (ISO date "YYYY-MM-DD" or omit), notes (string, optional).',
    );
    specs.push(
      "- add_mindmap_nodes: create a BRAND NEW mindmap tree from scratch. " +
        "Use when brainstorming a completely new topic. " +
        "Field: nodes (array, max 15). Each node: title, level, optional parentIndex (0-based index into this same array). " +
        "Root nodes = no parentIndex. " +
        'Example: "nodes":[{"title":"Launch","level":"goal"},{"title":"Research","level":"phase","parentIndex":0}].',
    );
    specs.push(
      "- extend_mindmap: ADD nodes into an EXISTING mindmap tree. " +
        'Use when the user says "add to my X plan" or references an existing node from the "Mindmap tree:" context. ' +
        "Fields: attachTo (string — approximate title of an existing node to attach under; partial case-insensitive match; if no match, nodes become new roots), " +
        "nodes (array, max 15 — same format as add_mindmap_nodes). " +
        "Look at the tree shown above to pick the right attachTo. " +
        'Example: {"attachTo":"Research","nodes":[{"title":"Hire designer","level":"task","parentIndex":0}]}.',
    );
  }

  if (scopes.includes("dashboard")) {
    const cats = CATEGORIES.map((c) => `"${c.id}" (${c.name})`).join(", ");
    specs.push(
      "- add_mission: add a custom mission to a dashboard category. Fields: " +
        `categoryId (one of ${cats}), title (string, required), ` +
        'description (string, optional), duration (e.g. "20 min", optional), ' +
        "xp (number, default 20).",
    );
  }

  if (scopes.includes("archive")) {
    const pillars = CATEGORIES.map((c) => `"${c.id}" (${c.name})`).join(", ") + ', "uncategorized"';
    specs.push(
      "- add_note: save a quick note to the user's archive. Fields: " +
        "title (string, required. A short descriptive title), " +
        "content (string, required. The note body; preserve the user's wording), " +
        `pillars (array of category ids; choose from ${pillars}; default ["uncategorized"]), ` +
        'tags (array of lowercase hashtag-style keywords WITHOUT the "#" prefix, e.g. ["idea","trading"]). ' +
        'The note is automatically tagged "ainote". Do NOT add that tag yourself. ' +
        "Use this whenever the user asks you to save/note/jot down/remember something.",
    );
  }

  if (specs.length === 0) return "";

  return [
    ACTIONS_SENTINEL,
    "",
    "=== ACTIONS YOU CAN PROPOSE ===",
    "You can also take actions on the user's behalf, but ONLY when the user clearly asks you to create or add something. Nothing is saved automatically. The user must confirm every action first.",
    "",
    "When (and only when) the user asks you to create/add something you support, first give a short normal reply, then append a single fenced block exactly like this:",
    "```action",
    '[{"type":"add_task","title":"Draft the pitch deck","level":"task"}]',
    "```",
    "Rules:",
    "- The block must contain a JSON array of one or more action objects.",
    "- Only use the action types listed below. Do not invent fields or types.",
    "- Never emit an action block unless the user explicitly asked you to add/create something. For questions or summaries, reply normally with no block.",
    "- Do not describe the raw JSON in your prose; just include the block once at the end.",
    "",
    "Available actions:",
    ...specs,
    "=== END ACTIONS ===",
  ].join("\n");
}

interface ParseResult {
  text: string;
  actions: AssistantAction[];
}

/** Shared node array coercion for both mindmap action types. */
function coerceNodes(raw: unknown): { title: string; level: "goal" | "phase" | "task" | "action"; parentIndex?: number }[] {
  const nodesRaw = Array.isArray(raw) ? raw : [];
  const nodes: { title: string; level: "goal" | "phase" | "task" | "action"; parentIndex?: number }[] = [];
  for (let i = 0; i < nodesRaw.length && nodes.length < 15; i++) {
    const n = nodesRaw[i];
    if (!n || typeof n !== "object") continue;
    const title = typeof (n as any).title === "string" ? (n as any).title.trim().slice(0, 200) : "";
    if (!title) continue;
    const level =
      typeof (n as any).level === "string" && VALID_LEVELS.has((n as any).level)
        ? (n as any).level as "goal" | "phase" | "task" | "action"
        : "task";
    const parentIndex = typeof (n as any).parentIndex === "number"
      && Number.isFinite((n as any).parentIndex)
      && (n as any).parentIndex >= 0
      && (n as any).parentIndex < nodesRaw.length
        ? Math.floor((n as any).parentIndex)
        : undefined;
    nodes.push({ title, level, parentIndex });
  }
  return nodes;
}

function coerceAction(raw: unknown): AssistantAction | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = o.type;

  if (type === "add_task") {
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) return null;
    const level =
      typeof o.level === "string" && VALID_LEVELS.has(o.level)
        ? (o.level as "goal" | "phase" | "task" | "action")
        : "task";
    const deadline =
      typeof o.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.deadline)
        ? o.deadline
        : null;
    const notes = typeof o.notes === "string" ? o.notes.slice(0, 2000) : "";
    return { type: "add_task", title: title.slice(0, 300), level, deadline, notes };
  }

  if (type === "add_mission") {
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const categoryId = typeof o.categoryId === "string" ? o.categoryId.trim() : "";
    if (!title || !VALID_CATEGORY_IDS.has(categoryId)) return null;
    const description = typeof o.description === "string" ? o.description.slice(0, 500) : "";
    const duration = typeof o.duration === "string" ? o.duration.slice(0, 40) : "";
    const xpNum = Number(o.xp);
    const xp = Number.isFinite(xpNum) && xpNum > 0 ? Math.min(500, Math.round(xpNum)) : 20;
    return { type: "add_mission", categoryId, title: title.slice(0, 200), description, duration, xp };
  }

  if (type === "add_note") {
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const content = typeof o.content === "string" ? o.content.trim() : "";
    if (!content && !title) return null;
    const pillarsRaw = Array.isArray(o.pillars) ? o.pillars : [];
    const pillars = Array.from(
      new Set(
        pillarsRaw
          .filter((p): p is string => typeof p === "string" && VALID_PILLAR_IDS.has(p.trim().toLowerCase()))
          .map((p) => p.trim().toLowerCase()),
      ),
    ).slice(0, 4);
    if (pillars.length === 0) pillars.push("uncategorized");
    const tagsRaw = Array.isArray(o.tags) ? o.tags : [];
    const tags = Array.from(
      new Set(
        tagsRaw
          .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
          .map((t) => t.trim().toLowerCase().replace(/^#/, "").slice(0, 30)),
      ),
    ).slice(0, 10);
    return { type: "add_note", title: title.slice(0, 200) || content.slice(0, 60), content: content || title, pillars, tags };
  }

  if (type === "add_mindmap_nodes") {
    const nodes = coerceNodes(o.nodes);
    return nodes.length > 0 ? { type: "add_mindmap_nodes", nodes } : null;
  }

  if (type === "extend_mindmap") {
    const attachTo = typeof o.attachTo === "string" ? o.attachTo.trim().slice(0, 200) : "";
    if (!attachTo) return null;
    const nodes = coerceNodes(o.nodes);
    return nodes.length > 0 ? { type: "extend_mindmap", attachTo, nodes } : null;
  }

  return null;
}

export function parseActions(text: string, allowedScopes: ScopeId[]): ParseResult {
  const match = text.match(/```action\s*([\s\S]*?)```/i);
  if (!match) return { text, actions: [] };
  const cleaned = (text.slice(0, match.index) + text.slice(match.index! + match[0].length)).trim();
  let parsed: unknown;
  try { parsed = JSON.parse(match[1].trim()); } catch { return { text: cleaned, actions: [] }; }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const allowed = new Set(allowedScopes);
  const actions: AssistantAction[] = [];
  for (const item of list) {
    const action = coerceAction(item);
    if (action && allowed.has(ACTION_SCOPE[action.type])) actions.push(action);
  }
  return { text: cleaned, actions };
}

/** Returns a multi-line tree preview string for mindmap actions, or null. */
export function mindmapPreview(action: AssistantAction): string | null {
  if (action.type === "add_mindmap_nodes") {
    return "New map\n" + nodesToTreePreview(action.nodes);
  }
  if (action.type === "extend_mindmap") {
    return `+ Attach to "${action.attachTo}"\n` + nodesToTreePreview(action.nodes);
  }
  return null;
}

/** Human-readable one-liner describing an action for the confirm card. */
export function describeAction(action: AssistantAction): string {
  if (action.type === "add_task") {
    const parts = [`Add task: "${action.title}"`];
    if (action.level && action.level !== "task") parts.push(`(${action.level})`);
    if (action.deadline) parts.push(`due ${action.deadline}`);
    return parts.join(" ");
  }
  if (action.type === "add_mission") {
    const cat = CATEGORIES.find((c) => c.id === action.categoryId)?.name || action.categoryId;
    return `Add mission to ${cat}: "${action.title}" (+${action.xp ?? 20} XP)`;
  }
  if (action.type === "add_mindmap_nodes") {
    const breakdown = nodesLevelBreakdown(action.nodes);
    const first = action.nodes[0];
    return `New mindmap "${first?.title || "..."}"  (${action.nodes.length} nodes — ${breakdown})`;
  }
  if (action.type === "extend_mindmap") {
    const breakdown = nodesLevelBreakdown(action.nodes);
    return `Extend "${action.attachTo}" +${action.nodes.length} nodes (${breakdown})`;
  }
  // add_note
  const pillar = PILLAR_NAMES[action.pillars?.[0] || ""] || "Uncategorized";
  const tagBits = action.tags && action.tags.length > 0 ? ` #${action.tags.join(" #")}` : "";
  return `Save note to ${pillar}: "${action.title}"${tagBits} #ainote`;
}