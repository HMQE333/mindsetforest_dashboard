import { CATEGORIES } from "@/lib/dashboard-data";
import type { ScopeId } from "@/lib/assistant-context";
import { replaceDashesDeep } from "@/lib/text-style";

/** Sections of the app the assistant can open with `navigate`. */
export const APP_MODULES = [
  "dashboard", "tracker", "paths", "oracle", "archive", "library", "cooking",
  "finance", "breathing", "calendar", "planning", "health", "settings",
] as const;
export type AppModule = (typeof APP_MODULES)[number];
export const MODULE_LABELS: Record<AppModule, string> = {
  dashboard: "Home", tracker: "Stats", paths: "Paths", oracle: "Oracle", archive: "Archive",
  library: "Library", cooking: "Cooking", finance: "Finance", breathing: "Breathing",
  calendar: "Calendar", planning: "Planning", health: "Health", settings: "Settings",
};
const VALID_MODULES = new Set<string>(APP_MODULES);

export const SETTINGS_TABS = [
  "profile", "context", "modules", "theme", "keybinds", "categories", "projects", "metrics", "stats-xp", "rewards",
] as const;
export type SettingsTabId = (typeof SETTINGS_TABS)[number];
const SETTINGS_TAB_LABELS: Record<SettingsTabId, string> = {
  profile: "Profile", context: "AI Context", modules: "Modules", theme: "Theme", keybinds: "Keybinds",
  categories: "Pillars", projects: "Projects", metrics: "Metrics", "stats-xp": "Stats XP", rewards: "Rewards",
};
const VALID_TABS = new Set<string>(SETTINGS_TABS);
const THEMES = ["dark", "light", "oled", "midnight", "forest", "crimson", "cyber", "sandstone", "frost", "timber"];
const ACCENTS = ["purple", "blue", "green", "orange", "pink", "red", "cyan", "gold"];
/** Modules that can be switched on/off (Home is always on). */
const TOGGLEABLE_MODULES = [
  "tracker", "paths", "oracle", "archive", "projects", "library", "cooking", "finance", "breathing",
  "calendar", "planning", "health", "monthly-focus",
];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
      /**
       * Load one of the user's saved mission presets onto Home. Replaces every
       * mission list, so it is confirmed like the others and never invented:
       * the name must match a preset listed in the dashboard context.
       */
      type: "apply_preset";
      presetName: string;
    }
  | {
      /** Open a section of the app. Harmless and instant, so it needs no confirm step. */
      type: "navigate";
      module: AppModule;
    }
  | { /** Open the settings on a tab. Instant, no confirm. */ type: "open_settings"; tab: SettingsTabId }
  | { /** Switch the colour theme and/or accent. Instant and reversible, no confirm. */ type: "set_theme"; theme?: string; accent?: string }
  | { type: "toggle_module"; module: string; enabled: boolean }
  | { type: "uncomplete_mission"; title: string; categoryId?: string }
  | {
      type: "edit_mission";
      title: string;
      categoryId?: string;
      newTitle?: string;
      description?: string;
      duration?: string;
      xp?: number;
    }
  | { type: "remove_mission"; title: string; categoryId?: string }
  | { type: "save_preset"; name: string; emoji?: string }
  | {
      /** A NEW set of missions saved as a preset, optionally loaded onto Home right away. */
      type: "create_preset";
      name: string;
      emoji?: string;
      description?: string;
      missions: Record<string, { title: string; description?: string; duration?: string; xp: number }[]>;
      apply: boolean;
    }
  | { type: "log_metric"; metric: string; value: number }
  | { type: "log_path_step"; pathName: string }
  | {
      type: "create_path";
      name: string;
      diagnosis?: string;
      steps: { title: string; stage?: string | null; days?: number; xp?: number }[];
    }
  | { type: "complete_task"; title: string }
  | { type: "add_event"; title: string; date: string; time?: string; notes?: string }
  | { type: "add_transaction"; kind: "expense" | "income"; amount: number; title: string; category?: string; date?: string }
  | {
      /** Tick one of today's missions on Home. Matched by title against the list in the context. */
      type: "complete_mission";
      title: string;
      categoryId?: string;
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
      /**
       * Rewrite a path's plan. The one action here that EDITS rather than
       * appends - which is the difference between an assistant that talks
       * about your plan and one that changes it while you argue.
       */
      type: "revise_path";
      pathName: string;
      /** Why it changed. Shown in the history and kept as the reason forever. */
      reason: string;
      steps: { title: string; stage?: string | null; days?: number; xp?: number }[];
      /** Optionally rewrite the binding constraint in the same move. */
      diagnosis?: string;
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

/** Which granted scope an action needs; null means always allowed (navigation). */
export const ACTION_SCOPE: Record<ActionType, ScopeId | null> = {
  navigate: null,
  open_settings: null,
  set_theme: null,
  toggle_module: null,
  uncomplete_mission: "dashboard",
  edit_mission: "dashboard",
  remove_mission: "dashboard",
  save_preset: "dashboard",
  create_preset: "dashboard",
  log_metric: "tracker",
  log_path_step: "paths",
  create_path: "paths",
  complete_task: "planning",
  add_event: "calendar",
  add_transaction: "finance",
  complete_mission: "dashboard",
  add_task: "planning",
  add_mission: "dashboard",
  apply_preset: "dashboard",
  add_note: "archive",
  add_mindmap_nodes: "planning",
  extend_mindmap: "planning",
  revise_path: "paths",
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
    const children = nodes.filter((n) => {
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

  specs.push(
    "- navigate: open a section of the app for the user. Field: module (one of " +
      APP_MODULES.map((m) => `"${m}" (${MODULE_LABELS[m]})`).join(", ") +
      '). Use it whenever the user asks to open / go to / show a section ("pokaż statystyki", "open finance"). ' +
      "It runs immediately without confirmation, so pair it with a one-line reply.",
  );
  specs.push(
    "- open_settings: open the settings window on a tab. Field: tab (one of " +
      SETTINGS_TABS.map((t) => `"${t}" (${SETTINGS_TAB_LABELS[t]})`).join(", ") +
      "). Runs immediately.",
  );
  specs.push(
    `- set_theme: change the look. Fields: theme (optional, one of ${THEMES.map((t) => `"${t}"`).join(", ")}), ` +
      `accent (optional, one of ${ACCENTS.map((a) => `"${a}"`).join(", ")}). Runs immediately; use when the user asks for a darker/lighter look or a colour.`,
  );
  specs.push(
    `- toggle_module: show or hide a module in the navigation. Fields: module (one of ${TOGGLEABLE_MODULES.map((m) => `"${m}"`).join(", ")}), enabled (boolean).`,
  );

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

  if (scopes.includes("paths")) {
    specs.push(
      "- revise_path: write or rewrite the steps of an existing path. Use it when the user asks you to draft, plan, rework or fix a path's steps, " +
        '(also for an empty path) and whenever they push back on a plan ("too aggressive", "wrong order", "I can\'t do daily"). ' +
        "Do NOT reply with a plan in prose - emit this action; your prose is one or two lines on the idea behind the plan. " +
        "Fields: pathName (string, must match one of the active paths listed in the context), " +
        "reason (string, required - one short line saying what the user objected to, in their words where possible), " +
        "steps (array, max 20, IN ORDER - the complete new list, not a diff. Each: title (short handle, not an instruction), " +
        "optional stage, optional days (number of separate days to repeat it; omit or 1 for a one-off), optional xp), " +
        "diagnosis (string, optional - the one binding constraint, in one line; include it when the path has none yet, " +
        "or when the conversation established that the named obstacle was the wrong one). " +
        "Steps the user has already worked on are preserved automatically, and the whole revision is one click to undo, " +
        "so prefer proposing the honest plan over a timid edit.",
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
    specs.push(
      "- apply_preset: load one of the user's SAVED mission presets onto Home (replaces every mission list there). " +
        'Use when the user asks to switch to / turn on / load a preset by name ("włącz monk mode", "load lock in"). ' +
        "Field: presetName (string - must be one of the names under \"Saved mission presets\" in the context; " +
        "never invent a preset and never use this to add single missions - that is add_mission).",
    );
    specs.push(
      "- complete_mission: tick one of today's missions on Home as done (awards its XP). Fields: " +
        "title (string - copy the exact title from the \"Today's missions\" list in the context), " +
        "categoryId (optional - the id in parentheses after the pillar name). " +
        'Use when the user says they did / finished / completed a mission ("zrobiłem pompki", "I read my 20 pages"). ' +
        "Never tick a mission that is already [x]; say it is done instead.",
    );
    specs.push(
      "- uncomplete_mission: untick a mission marked [x] today (takes its XP back). Fields: title (exact title from the list), categoryId (optional).",
    );
    specs.push(
      "- edit_mission: change an existing mission. Fields: title (current exact title), categoryId (optional), " +
        "newTitle, description, duration, xp (all optional; only what changes).",
    );
    specs.push(
      "- remove_mission: delete a mission from its list. Fields: title (exact title), categoryId (optional).",
    );
    specs.push(
      "- save_preset: save the CURRENT Home missions, unchanged, as a named preset (overwrites a preset with the same name). Fields: name, emoji (optional).",
    );
    specs.push(
      "- create_preset: build a NEW set of missions (\"a balanced day\", \"monk mode\", \"przygotuj zestaw\") and save it as a preset in ONE action. " +
        `Fields: name, emoji (optional), description (optional, one line), missions (object: category id -> array of {title, xp, duration (optional), description (optional)}; ids: ${CATEGORIES.map((c) => `"${c.id}"`).join(", ")}; 1-3 missions per category), ` +
        "apply (boolean: true to also load it onto Home now, replacing the current missions; use true only when the user asked to switch/use it now). " +
        "To rebuild or replace missions NEVER emit a series of remove_mission/add_mission; use create_preset.",
    );
  }

  if (scopes.includes("tracker")) {
    specs.push(
      "- log_metric: log a number for one of the user's Stats metrics today (awards Stats XP). Fields: metric (the metric id or its exact label from the \"Metrics you can log\" list), " +
        'value (number in the metric\'s unit). Use when the user reports a measurable amount ("przeczytałem 30 stron", "3 hours of deep work").',
    );
  }

  if (scopes.includes("paths")) {
    specs.push(
      "- log_path_step: log today's day/rep of the ACTIVE step (marked >) of a path, like the button on Home (awards its XP). Field: pathName (exact name).",
    );
    specs.push(
      "- create_path: create a new path. Fields: name, diagnosis (optional: the one binding constraint), steps (array, max 20, in order: " +
        "title, optional stage, optional days = separate days to repeat, optional xp). Prefer 4-10 concrete steps.",
    );
  }

  if (scopes.includes("planning")) {
    specs.push("- complete_task: mark an open planning task as done. Field: title (exact or unambiguous part of the title).");
  }

  if (scopes.includes("calendar")) {
    specs.push(
      '- add_event: add a calendar event. Fields: title, date ("YYYY-MM-DD"; resolve "jutro"/"tomorrow" from today\'s date in the data), time (optional "HH:MM"), notes (optional).',
    );
  }

  if (scopes.includes("finance")) {
    specs.push(
      '- add_transaction: record money in or out. Fields: kind ("expense" or "income"), amount (positive number), title, ' +
        'category (optional, prefer one of the user\'s categories listed in the data), date (optional "YYYY-MM-DD", default today).',
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
  // House style applies to what gets written, not only to what gets shown.
  const o = replaceDashesDeep(raw as Record<string, unknown>);
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

  if (type === "navigate") {
    const module = typeof o.module === "string" ? o.module.trim().toLowerCase() : "";
    if (!VALID_MODULES.has(module)) return null;
    return { type: "navigate", module: module as AppModule };
  }

  if (type === "open_settings") {
    const tab = typeof o.tab === "string" ? o.tab.trim().toLowerCase() : "";
    return VALID_TABS.has(tab) ? { type: "open_settings", tab: tab as SettingsTabId } : null;
  }

  if (type === "set_theme") {
    const theme = typeof o.theme === "string" && THEMES.includes(o.theme.toLowerCase()) ? o.theme.toLowerCase() : undefined;
    const accent = typeof o.accent === "string" && ACCENTS.includes(o.accent.toLowerCase()) ? o.accent.toLowerCase() : undefined;
    return theme || accent ? { type: "set_theme", theme, accent } : null;
  }

  if (type === "toggle_module") {
    const module = typeof o.module === "string" ? o.module.trim().toLowerCase() : "";
    if (!TOGGLEABLE_MODULES.includes(module) || typeof o.enabled !== "boolean") return null;
    return { type: "toggle_module", module, enabled: o.enabled };
  }

  if (type === "uncomplete_mission" || type === "remove_mission") {
    const title = typeof o.title === "string" ? o.title.trim().slice(0, 200) : "";
    if (!title) return null;
    const categoryId = typeof o.categoryId === "string" && o.categoryId.trim() ? o.categoryId.trim().slice(0, 80) : undefined;
    return { type, title, categoryId };
  }

  if (type === "edit_mission") {
    const title = typeof o.title === "string" ? o.title.trim().slice(0, 200) : "";
    if (!title) return null;
    const categoryId = typeof o.categoryId === "string" && o.categoryId.trim() ? o.categoryId.trim().slice(0, 80) : undefined;
    const newTitle = typeof o.newTitle === "string" && o.newTitle.trim() ? o.newTitle.trim().slice(0, 200) : undefined;
    const description = typeof o.description === "string" ? o.description.slice(0, 500) : undefined;
    const duration = typeof o.duration === "string" ? o.duration.slice(0, 40) : undefined;
    const xpNum = Number(o.xp);
    const xp = o.xp !== undefined && Number.isFinite(xpNum) && xpNum > 0 ? Math.min(500, Math.round(xpNum)) : undefined;
    if (newTitle === undefined && description === undefined && duration === undefined && xp === undefined) return null;
    return { type: "edit_mission", title, categoryId, newTitle, description, duration, xp };
  }

  if (type === "save_preset") {
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 40) : "";
    if (!name) return null;
    const emoji = typeof o.emoji === "string" && o.emoji.trim() ? o.emoji.trim().slice(0, 8) : undefined;
    return { type: "save_preset", name, emoji };
  }

  if (type === "create_preset") {
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 40) : "";
    const raw = o.missions && typeof o.missions === "object" && !Array.isArray(o.missions) ? (o.missions as Record<string, unknown>) : {};
    const missions: Record<string, { title: string; description?: string; duration?: string; xp: number }[]> = {};
    for (const [key, list] of Object.entries(raw)) {
      const id = key.trim().toLowerCase();
      if (!VALID_CATEGORY_IDS.has(id) || !Array.isArray(list)) continue;
      const items = list
        .slice(0, 6)
        .map((m) => {
          if (!m || typeof m !== "object") return null;
          const x = m as Record<string, unknown>;
          const title = typeof x.title === "string" ? x.title.trim().slice(0, 200) : "";
          if (!title) return null;
          const xpNum = Number(x.xp);
          return {
            title,
            description: typeof x.description === "string" ? x.description.slice(0, 500) : "",
            duration: typeof x.duration === "string" ? x.duration.slice(0, 40) : "",
            xp: Number.isFinite(xpNum) && xpNum > 0 ? Math.min(500, Math.round(xpNum)) : 20,
          };
        })
        .filter(Boolean) as { title: string; description?: string; duration?: string; xp: number }[];
      if (items.length > 0) missions[id] = items;
    }
    if (!name || Object.keys(missions).length === 0) return null;
    return {
      type: "create_preset",
      name,
      emoji: typeof o.emoji === "string" && o.emoji.trim() ? o.emoji.trim().slice(0, 8) : undefined,
      description: typeof o.description === "string" ? o.description.trim().slice(0, 200) : undefined,
      missions,
      apply: o.apply === true,
    };
  }

  if (type === "log_metric") {
    const metric = typeof o.metric === "string" ? o.metric.trim().slice(0, 80) : "";
    const value = Number(o.value);
    if (!metric || !Number.isFinite(value) || value <= 0 || value > 100000) return null;
    return { type: "log_metric", metric, value: Math.round(value * 100) / 100 };
  }

  if (type === "log_path_step") {
    const pathName = typeof o.pathName === "string" ? o.pathName.trim().slice(0, 200) : "";
    return pathName ? { type: "log_path_step", pathName } : null;
  }

  if (type === "create_path") {
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
    if (!name) return null;
    const rawSteps = Array.isArray(o.steps) ? o.steps : [];
    const steps = rawSteps
      .slice(0, 20)
      .map((r) => {
        if (!r || typeof r !== "object") return null;
        const x = r as Record<string, unknown>;
        const title = typeof x.title === "string" ? x.title.trim().slice(0, 200) : "";
        if (!title) return null;
        const days = Number(x.days);
        const xpNum = Number(x.xp);
        return {
          title,
          stage: typeof x.stage === "string" && x.stage.trim() ? x.stage.trim().slice(0, 60) : null,
          days: Number.isFinite(days) && days > 1 ? Math.min(365, Math.round(days)) : 1,
          xp: Number.isFinite(xpNum) && xpNum > 0 ? Math.min(500, Math.round(xpNum)) : undefined,
        };
      })
      .filter(Boolean) as { title: string; stage: string | null; days: number; xp?: number }[];
    const diagnosis = typeof o.diagnosis === "string" && o.diagnosis.trim() ? o.diagnosis.trim().slice(0, 400) : undefined;
    return { type: "create_path", name, diagnosis, steps };
  }

  if (type === "complete_task") {
    const title = typeof o.title === "string" ? o.title.trim().slice(0, 300) : "";
    return title ? { type: "complete_task", title } : null;
  }

  if (type === "add_event") {
    const title = typeof o.title === "string" ? o.title.trim().slice(0, 200) : "";
    const date = typeof o.date === "string" && ISO_DATE.test(o.date) ? o.date : "";
    if (!title || !date) return null;
    const time = typeof o.time === "string" && /^\d{1,2}:\d{2}$/.test(o.time.trim()) ? o.time.trim() : undefined;
    const notes = typeof o.notes === "string" ? o.notes.slice(0, 1000) : undefined;
    return { type: "add_event", title, date, time, notes };
  }

  if (type === "add_transaction") {
    const kind = o.kind === "income" ? "income" : o.kind === "expense" ? "expense" : null;
    const amount = Number(o.amount);
    const title = typeof o.title === "string" ? o.title.trim().slice(0, 200) : "";
    if (!kind || !title || !Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return null;
    const category = typeof o.category === "string" && o.category.trim() ? o.category.trim().slice(0, 60) : undefined;
    const date = typeof o.date === "string" && ISO_DATE.test(o.date) ? o.date : undefined;
    return { type: "add_transaction", kind, amount: Math.round(amount * 100) / 100, title, category, date };
  }

  if (type === "complete_mission") {
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) return null;
    const categoryId = typeof o.categoryId === "string" && o.categoryId.trim() ? o.categoryId.trim().slice(0, 80) : undefined;
    return { type: "complete_mission", title: title.slice(0, 200), categoryId };
  }

  if (type === "apply_preset") {
    const presetName = typeof o.presetName === "string" ? o.presetName.trim() : "";
    if (!presetName) return null;
    return { type: "apply_preset", presetName: presetName.slice(0, 60) };
  }

  if (type === "revise_path") {
    const pathName = typeof o.pathName === "string" ? o.pathName.trim() : "";
    const reason = typeof o.reason === "string" ? o.reason.trim() : "";
    const rawSteps = Array.isArray(o.steps) ? o.steps : [];
    if (!pathName || rawSteps.length === 0) return null;
    const steps = rawSteps
      .slice(0, 20)
      .map((raw) => {
        if (!raw || typeof raw !== "object") return null;
        const r = raw as Record<string, unknown>;
        const title = typeof r.title === "string" ? r.title.trim() : "";
        if (!title) return null;
        const daysNum = Number(r.days);
        const xpNum = Number(r.xp);
        return {
          title: title.slice(0, 200),
          stage: typeof r.stage === "string" && r.stage.trim() ? r.stage.trim().slice(0, 60) : null,
          days: Number.isFinite(daysNum) && daysNum > 1 ? Math.min(365, Math.round(daysNum)) : 1,
          xp: Number.isFinite(xpNum) && xpNum > 0 ? Math.min(500, Math.round(xpNum)) : undefined,
        };
      })
      .filter(Boolean) as { title: string; stage: string | null; days: number; xp?: number }[];
    if (steps.length === 0) return null;
    const diagnosis = typeof o.diagnosis === "string" && o.diagnosis.trim()
      ? o.diagnosis.trim().slice(0, 400)
      : undefined;
    return {
      type: "revise_path",
      pathName: pathName.slice(0, 200),
      reason: (reason || "revised in conversation").slice(0, 300),
      steps,
      diagnosis,
    };
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

/**
 * The reply as the user should see it while it is still streaming: prose only.
 * Everything from the start of an action block on is hidden (it becomes the
 * confirm card when the reply is complete), including a half-typed fence.
 */
export function visibleReplyText(raw: string): string {
  const start = raw.search(/```\s*action/i);
  let text = start >= 0 ? raw.slice(0, start) : raw;
  // A fence still being typed at the very end ("`", "``", "```", "```act").
  text = text.replace(/`{1,3}[a-z]*$/i, "");
  return text.trimEnd();
}

export interface ParseResult {
  text: string;
  actions: AssistantAction[];
  /** An action block was started but could not be read (cut off or malformed). */
  broken?: boolean;
}

export function parseActions(text: string, allowedScopes: ScopeId[]): ParseResult {
  const start = text.search(/```\s*action/i);
  if (start < 0) return { text, actions: [] };
  const rest = text.slice(start).replace(/^```\s*action\s*/i, "");
  const close = rest.indexOf("```");
  const body = close >= 0 ? rest.slice(0, close) : rest;
  const after = close >= 0 ? rest.slice(close + 3) : "";
  const cleaned = (text.slice(0, start) + after).trim();
  let parsed: unknown;
  try { parsed = JSON.parse(body.trim()); } catch { return { text: cleaned, actions: [], broken: true }; }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const allowed = new Set(allowedScopes);
  const actions: AssistantAction[] = [];
  for (const item of list) {
    const action = coerceAction(item);
    if (!action) continue;
    const scope = ACTION_SCOPE[action.type];
    if (scope === null || allowed.has(scope)) actions.push(action);
  }
  return { text: cleaned, actions };
}

/** Returns a multi-line tree preview string for mindmap actions, or null. */
export function mindmapPreview(action: AssistantAction): string | null {
  if (action.type === "add_mindmap_nodes") {
    return "New map\n" + nodesToTreePreview(action.nodes);
  }
  if (action.type === "create_preset") {
    return Object.entries(action.missions)
      .map(([id, list]) => `${PILLAR_NAMES[id] || id}: ${list.map((m) => `${m.title} (+${m.xp})`).join("; ")}`)
      .join("\n");
  }
  if (action.type === "create_path") {
    return action.steps
      .map((step, i) => `${String(i + 1).padStart(2, " ")}. ${step.stage ? `[${step.stage}] ` : ""}${step.title}${(step.days || 1) > 1 ? `  x${step.days} days` : ""}`)
      .join("\n");
  }
  if (action.type === "revise_path") {
    // The whole proposed plan, so the user agrees to something they can see
    // rather than to a sentence describing it.
    return action.steps
      .map((step, i) => {
        const days = (step.days || 1) > 1 ? `  x${step.days} days` : "";
        const stage = step.stage ? `[${step.stage}] ` : "";
        return `${String(i + 1).padStart(2, " ")}. ${stage}${step.title}${days}`;
      })
      .join("\n");
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
  if (action.type === "navigate") {
    return `Open ${MODULE_LABELS[action.module]}`;
  }
  if (action.type === "complete_mission") {
    return `Mark mission done: "${action.title}"`;
  }
  if (action.type === "open_settings") return `Open settings: ${SETTINGS_TAB_LABELS[action.tab]}`;
  if (action.type === "set_theme") {
    return `Change look: ${[action.theme && `theme ${action.theme}`, action.accent && `accent ${action.accent}`].filter(Boolean).join(", ")}`;
  }
  if (action.type === "toggle_module") return `${action.enabled ? "Show" : "Hide"} module: ${action.module}`;
  if (action.type === "uncomplete_mission") return `Untick mission: "${action.title}" (XP taken back)`;
  if (action.type === "edit_mission") {
    const bits = [
      action.newTitle && `rename to "${action.newTitle}"`,
      action.xp !== undefined && `${action.xp} XP`,
      action.duration !== undefined && `duration ${action.duration || "none"}`,
      action.description !== undefined && "new description",
    ].filter(Boolean);
    return `Edit mission "${action.title}": ${bits.join(", ")}`;
  }
  if (action.type === "remove_mission") return `Remove mission: "${action.title}"`;
  if (action.type === "create_preset") {
    const n = Object.values(action.missions).reduce((a, l) => a + l.length, 0);
    return `${action.apply ? "Create and load" : "Create"} preset "${action.emoji ? `${action.emoji} ` : ""}${action.name}" (${n} missions)${action.apply ? ", replaces the missions on Home" : ""}`;
  }
  if (action.type === "save_preset") return `Save current missions as preset "${action.emoji ? `${action.emoji} ` : ""}${action.name}"`;
  if (action.type === "log_metric") return `Log ${action.value} for "${action.metric}" today`;
  if (action.type === "log_path_step") return `Log today on path "${action.pathName}" (active step)`;
  if (action.type === "create_path") return `Create path "${action.name}" (${action.steps.length} steps)`;
  if (action.type === "complete_task") return `Mark task done: "${action.title}"`;
  if (action.type === "add_event") return `Add event ${action.date}${action.time ? ` ${action.time}` : ""}: "${action.title}"`;
  if (action.type === "add_transaction") {
    return `Add ${action.kind}: ${action.amount} · "${action.title}"${action.category ? ` (${action.category})` : ""}${action.date ? ` on ${action.date}` : ""}`;
  }
  if (action.type === "apply_preset") {
    return `Load mission preset "${action.presetName}" (replaces every mission list on Home)`;
  }
  if (action.type === "add_mindmap_nodes") {
    const breakdown = nodesLevelBreakdown(action.nodes);
    const first = action.nodes[0];
    return `New mindmap "${first?.title || "..."}"  (${action.nodes.length} nodes — ${breakdown})`;
  }
  if (action.type === "revise_path") {
    const repeated = action.steps.filter((s) => (s.days || 1) > 1).length;
    const shape = repeated > 0 ? `${action.steps.length} steps, ${repeated} repeated` : `${action.steps.length} steps`;
    return `Rewrite path "${action.pathName}" (${shape}) - ${action.reason}`;
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

/** Actions that run as soon as they are parsed, without the confirm card. */
export const AUTO_APPLY_ACTIONS = new Set<ActionType>(["navigate", "open_settings", "set_theme"]);
export function isAutoApply(action: AssistantAction): boolean {
  return AUTO_APPLY_ACTIONS.has(action.type);
}
