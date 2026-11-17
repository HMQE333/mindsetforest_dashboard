/**
 * Prep boxes: a recipe's ingredients split into numbered boxes, in the order
 * they go into the pan. An ingredient is known by its line's normalised text,
 * so editing one line of the recipe leaves the others in their boxes.
 */
export interface RecipeBoxes {
  count: number;
  labels: string[];
  /** ingredient key -> box index (0-based) */
  assign: Record<string, number>;
}

export interface Ingredient { key: string; text: string }

export const MIN_BOXES = 1;
export const MAX_BOXES = 6;
export const DEFAULT_BOXES: RecipeBoxes = { count: 4, labels: [], assign: {} };

/** "- 200 g rice" -> "200 g rice"; headings ("Sauce:") and blank lines are not ingredients. */
export function parseIngredients(text: string | null | undefined): Ingredient[] {
  const seen = new Map<string, number>();
  const out: Ingredient[] = [];
  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•·▪◦]|\d+[.)])\s+/, "").trim();
    if (!line || /:$/.test(line) || /^#+\s/.test(line)) continue;
    const base = line.toLowerCase().replace(/\s+/g, " ");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({ key: n ? `${base}#${n + 1}` : base, text: line });
  }
  return out;
}

/** Stored JSON, cleaned: a count in range, no box index past the count. */
export function readBoxes(v: unknown): RecipeBoxes {
  if (!v || typeof v !== "object") return { ...DEFAULT_BOXES, assign: {} };
  const o = v as Partial<RecipeBoxes>;
  const count = Math.min(MAX_BOXES, Math.max(MIN_BOXES, Math.round(Number(o.count) || DEFAULT_BOXES.count)));
  const labels = Array.isArray(o.labels) ? o.labels.map((l) => String(l ?? "").slice(0, 40)) : [];
  const assign: Record<string, number> = {};
  for (const [k, i] of Object.entries(o.assign ?? {})) if (Number.isInteger(i) && i >= 0 && i < count) assign[k] = i;
  return { count, labels, assign };
}

/** Each box's ingredients (in recipe order) and the ones not in a box yet. */
export function boxContents(ingredients: Ingredient[], boxes: RecipeBoxes): { boxes: Ingredient[][]; loose: Ingredient[] } {
  const out: Ingredient[][] = Array.from({ length: boxes.count }, () => []);
  const loose: Ingredient[] = [];
  for (const ing of ingredients) {
    const i = boxes.assign[ing.key];
    if (i !== undefined && i < boxes.count) out[i].push(ing);
    else loose.push(ing);
  }
  return { boxes: out, loose };
}

/** Put an ingredient in a box (null: back on the table). */
export function moveTo(boxes: RecipeBoxes, key: string, box: number | null): RecipeBoxes {
  const assign = { ...boxes.assign };
  if (box === null) delete assign[key];
  else assign[key] = box;
  return { ...boxes, assign };
}

/** Fewer boxes: what was in a removed box goes back on the table. */
export function setCount(boxes: RecipeBoxes, count: number): RecipeBoxes {
  const c = Math.min(MAX_BOXES, Math.max(MIN_BOXES, count));
  const assign: Record<string, number> = {};
  for (const [k, i] of Object.entries(boxes.assign)) if (i < c) assign[k] = i;
  return { ...boxes, count: c, assign };
}
