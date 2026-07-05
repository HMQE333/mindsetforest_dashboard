import { CATEGORIES } from "@/lib/dashboard-data";
import type { ScopeId } from "@/lib/assistant-context";

/**
 * Structured write actions the assistant can propose. These are never applied
 * automatically — the panel shows a confirm step first, and every action is
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
    };

export type ActionType = AssistantAction["type"];

/** Which read/write scope each action requires. */
export const ACTION_SCOPE: Record<ActionType, ScopeId> = {
  add_task: "planning",
  add_mission: "dashboard",
};

/** Sentinel so the (reference) edge function can tell the client already
 * injected action instructions and avoid duplicating them. */
export const ACTIONS_SENTINEL = "[[ACTIONS_ENABLED]]";

const VALID_LEVELS = new Set(["goal", "phase", "task", "action"]);
const VALID_CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

/**
 * Build the instruction block describing the write actions available for the
 * scopes the user granted. Returns "" when no write-capable scope is on, so the
 * assistant stays read-only unless the user explicitly opened a writable area.
 */
export function buildActionInstructions(scopes: ScopeId[]): string {
  const specs: string[] = [];

  if (scopes.includes("planning")) {
    specs.push(
      `- add_task: create a standalone planning task. Fields: title (string, required), ` +
        `level (one of "goal","phase","task","action"; default "task"), ` +
        `deadline (ISO date "YYYY-MM-DD" or omit), notes (string, optional).`,
    );
  }

  if (scopes.includes("dashboard")) {
    const cats = CATEGORIES.map((c) => `"${c.id}" (${c.name})`).join(", ");
    specs.push(
      `- add_mission: add a custom mission to a dashboard category. Fields: ` +
        `categoryId (one of ${cats}), title (string, required), ` +
        `description (string, optional), duration (e.g. "20 min", optional), ` +
        `xp (number, default 20).`,
    );
  }

  if (specs.length === 0) return "";

  return [
    ACTIONS_SENTINEL,
    "",
    "=== ACTIONS YOU CAN PROPOSE ===",
    "You can also take actions on the user's behalf, but ONLY when the user clearly asks you to create or add something. Nothing is saved automatically — the user must confirm every action first.",
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
  /** The assistant text with the action block removed, for display. */
  text: string;
  /** Validated, scope-checked actions (may be empty). */
  actions: AssistantAction[];
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
    return {
      type: "add_mission",
      categoryId,
      title: title.slice(0, 200),
      description,
      duration,
      xp,
    };
  }

  return null;
}

/**
 * Extract a fenced ```action JSON block from an assistant reply, validate the
 * actions, and drop any whose required scope wasn't granted. Returns the reply
 * text with the block stripped out plus the parsed actions.
 */
export function parseActions(text: string, allowedScopes: ScopeId[]): ParseResult {
  const match = text.match(/```action\s*([\s\S]*?)```/i);
  if (!match) return { text, actions: [] };

  const cleaned = (text.slice(0, match.index) + text.slice(match.index! + match[0].length)).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    return { text: cleaned, actions: [] };
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  const allowed = new Set(allowedScopes);
  const actions: AssistantAction[] = [];
  for (const item of list) {
    const action = coerceAction(item);
    if (action && allowed.has(ACTION_SCOPE[action.type])) actions.push(action);
  }

  return { text: cleaned, actions };
}

/** Human-readable one-liner describing an action for the confirm card. */
export function describeAction(action: AssistantAction): string {
  if (action.type === "add_task") {
    const parts = [`Add planning task: "${action.title}"`];
    if (action.level && action.level !== "task") parts.push(`(${action.level})`);
    if (action.deadline) parts.push(`due ${action.deadline}`);
    return parts.join(" ");
  }
  const cat = CATEGORIES.find((c) => c.id === action.categoryId)?.name || action.categoryId;
  return `Add mission to ${cat}: "${action.title}" (+${action.xp ?? 20} XP)`;
}
