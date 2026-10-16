/**
 * The plan's open loops as lines for the planner prompt (buildPlannerContext in
 * planner.ts, read by ai-mission-suggest, ai-path-suggest and ai-review).
 *
 * Every planning node is an open loop of one of two kinds: a Step waits to be
 * done, a Question waits to be answered, optionally after the user wrote a
 * guess first. Two things from the plan are worth a planner's attention, and
 * both are about not speaking for the user:
 *  - the open questions, so it does not invent answers (it may suggest how to
 *    find out), and
 *  - the settled ones with the options they were chosen over, so it does not
 *    reopen a decision or re-propose what was dropped.
 * There is deliberately no "next steps" line: the planner rules forbid
 * re-skinning a task the user already has, so listing them would only invite it.
 *
 * The app's assistant writes the same two lines (gatherPlanning in
 * artifacts/app/src/lib/assistant-context.ts). An edge function cannot import
 * from the app, so this is a copy: same headers, same item format, held
 * together by artifacts/app/src/test/planning-context.test.ts.
 *
 * No imports, so the app's tests can load this file as it is.
 */

export const OPEN_QUESTIONS_HEADER = "Open questions (do not invent answers; you may suggest how to find out)";
export const SETTLED_HEADER = "Settled (treat as decided; do not reopen or re-propose what was dropped)";
/** Each line stops near this many characters ("; +N more"). */
export const PLAN_LINE_MAX_CHARS = 1500;

/** The columns read (rows from before the open-loops migration lack most of them). */
interface Row {
  id: string;
  parent_id: string | null;
  board_id: string | null;
  title: string;
  ask: boolean;
  done: boolean;
  dropped: boolean;
  guess: string | null;
  outcome: string | null;
  verdict: "right" | "wrong" | "unknown" | null;
  closed_at: string | null;
  sort_order: number;
  created_at: string;
}

function rowOf(raw: unknown): Row | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const verdict = r.verdict;
  return {
    id: r.id,
    parent_id: str(r.parent_id),
    board_id: str(r.board_id),
    title: String(r.title ?? "").trim(),
    ask: r.ask === true,
    done: r.done === true,
    dropped: r.dropped === true,
    guess: str(r.guess)?.trim() || null,
    outcome: str(r.outcome)?.trim() || null,
    verdict: verdict === "right" || verdict === "wrong" || verdict === "unknown" ? verdict : null,
    closed_at: str(r.closed_at),
    sort_order: Number(r.sort_order) || 0,
    created_at: String(r.created_at ?? ""),
  };
}

const isOpenQuestion = (r: Row) => r.ask && !r.done && !r.dropped;
const isSettled = (r: Row) => r.ask && r.done && !r.dropped;

/** Sibling order, as the app's List: sort_order, then created_at, then id. */
function compareSiblings(a: Row, b: Row): number {
  return a.sort_order - b.sort_order ||
    (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Every row in outline order: boards by their newest node first (the server
 * cannot see which board is open in the app), each board's roots in sibling
 * order and each followed by its subtree. A row whose parent is on another
 * board, or gone, is a root of its own board. Safe on a parent loop: rows that
 * no root reaches (a loop and what hangs from it) follow the board's tree in
 * sibling order rather than going missing.
 */
function outline(rows: Row[]): Row[] {
  const boards = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.board_id ?? "";
    const list = boards.get(key);
    if (list) list.push(r);
    else boards.set(key, [r]);
  }
  const newest = (list: Row[]) => list.reduce((m, r) => (r.created_at > m ? r.created_at : m), "");
  const ordered = [...boards.values()].sort((a, b) => (newest(b) < newest(a) ? -1 : newest(b) > newest(a) ? 1 : 0));
  const out: Row[] = [];
  for (const list of ordered) {
    const ids = new Set(list.map((r) => r.id));
    const kids = new Map<string | null, Row[]>();
    for (const r of list) {
      const key = r.parent_id && ids.has(r.parent_id) && r.parent_id !== r.id ? r.parent_id : null;
      const l = kids.get(key);
      if (l) l.push(r);
      else kids.set(key, [r]);
    }
    for (const l of kids.values()) l.sort(compareSiblings);
    const seen = new Set<string>();
    const walk = (r: Row) => {
      if (seen.has(r.id)) return;
      seen.add(r.id);
      out.push(r);
      for (const c of kids.get(r.id) ?? []) walk(c);
    };
    for (const r of kids.get(null) ?? []) walk(r);
    for (const r of [...list].sort(compareSiblings)) walk(r);
  }
  return out;
}

/** Items joined with "; ", stopping near `max` characters with "; +N more". */
export function capItems(items: string[], max = PLAN_LINE_MAX_CHARS): string {
  const out: string[] = [];
  let len = 0;
  for (let i = 0; i < items.length; i++) {
    const add = (out.length > 0 ? 2 : 0) + items[i].length;
    if (out.length > 0 && len + add > max) return `${out.join("; ")}; +${items.length - i} more`;
    out.push(items[i]);
    len += add;
  }
  return out.join("; ");
}

/**
 * "Q (their guess: g; dropped: X, Y)". The options already dropped under a
 * question that is still open are named too: "you may suggest how to find
 * out" must not turn into testing an option the user has ruled out.
 */
function openQuestionItem(r: Row, dropped: string[]): string {
  const notes = [r.guess ? `their guess: ${r.guess}` : "", dropped.length > 0 ? `dropped: ${dropped.join(", ")}` : ""].filter(Boolean);
  return notes.length > 0 ? `${r.title} (${notes.join("; ")})` : r.title;
}

/** "Q → a (dropped: X, Y)"; a rule ("= text") is just its text. */
function settledItem(r: Row, dropped: string[]): string {
  const head = r.outcome && r.outcome !== r.title
    ? `${r.title} → ${r.outcome}`
    : !r.outcome && r.title.endsWith("?") ? `${r.title} → (no answer written)` : r.title;
  return dropped.length > 0 ? `${head} (dropped: ${dropped.join(", ")})` : head;
}

/**
 * The open-questions line and the settled line (each only when it has items),
 * in the plan's outline order. Rows that are not planning rows are skipped, and
 * rows without the open-loops columns read as open steps: no lines, never a
 * crash.
 */
export function planningLines(raw: unknown[] | null | undefined): string[] {
  const rows = (raw ?? []).map(rowOf).filter((r): r is Row => !!r && !!r.title);
  if (rows.length === 0) return [];
  const ordered = outline(rows);
  const dropped = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.dropped || !r.parent_id) continue;
    const l = dropped.get(r.parent_id);
    if (l) l.push(r);
    else dropped.set(r.parent_id, [r]);
  }
  const droppedUnder = (id: string) => (dropped.get(id) ?? []).sort(compareSiblings).map((d) => d.title);
  const open = ordered.filter(isOpenQuestion).map((r) => openQuestionItem(r, droppedUnder(r.id)));
  const settled = ordered.filter(isSettled).map((r) => settledItem(r, droppedUnder(r.id)));
  const lines: string[] = [];
  if (open.length > 0) lines.push(`${OPEN_QUESTIONS_HEADER}: ${capItems(open)}`);
  if (settled.length > 0) lines.push(`${SETTLED_HEADER}: ${capItems(settled)}`);
  return lines;
}

/** How many graded guesses the tally reads (the newest), like the path diagnoses. */
const GUESSES_READ = 20;

/**
 * The plan-guess tally: guesses the user wrote on plan questions and graded
 * when the question settled. A separate count from the path diagnoses, which
 * are a different reference class (the binding constraint of a whole path
 * against a cheap per-question estimate): pooled, easy guesses would drown out
 * the diagnosis signal. The assistant never writes guesses or verdicts, so
 * every one counted here is the user's own.
 */
export function planGuessLines(raw: unknown[] | null | undefined): string[] {
  const scored = (raw ?? [])
    .map(rowOf)
    .filter((r): r is Row => !!r && r.ask && !!r.verdict && !!r.guess && !!r.outcome)
    .sort((a, b) => ((b.closed_at ?? "") < (a.closed_at ?? "") ? -1 : (b.closed_at ?? "") > (a.closed_at ?? "") ? 1 : 0))
    .slice(0, GUESSES_READ);
  if (scored.length === 0) return [];
  const right = scored.filter((r) => r.verdict === "right").length;
  const unknown = scored.filter((r) => r.verdict === "unknown").length;
  const lines = [
    `Plan guesses: ${right} of ${scored.length} right (the user's own grading of guesses written on plan questions, ` +
      `counted apart from the path diagnoses${unknown > 0 ? `; ${unknown} of them could not be told` : ""}).`,
  ];
  const misses = scored.filter((r) => r.verdict === "wrong").slice(0, 5)
    .map((r) => `thought "${r.guess}", was "${r.outcome}"`);
  if (misses.length > 0) lines.push(`Plan guesses that missed: ${misses.join("; ")}.`);
  return lines;
}
