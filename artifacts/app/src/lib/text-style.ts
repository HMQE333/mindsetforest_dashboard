/**
 * House style for AI-written text: no em dashes. The prompts forbid them; this
 * catches whatever slips through. An em dash (or a horizontal bar, or an en
 * dash used as one with spaces around it) becomes an arrow. En dashes inside
 * ranges ("20–30 min") are left alone.
 */
export function replaceDashes(text: string): string {
  if (!text) return text;
  return text
    .replace(/\s*[—―]+\s*/g, " → ")
    .replace(/\s+–\s+/g, " → ")
    .replace(/ {2,}/g, " ")
    .replace(/^ → /, "→ ")
    .replace(/ → $/, " →");
}

/** Apply `replaceDashes` to every string in a JSON-like value (objects, arrays). */
export function replaceDashesDeep<T>(value: T): T {
  if (typeof value === "string") return replaceDashes(value) as unknown as T;
  if (Array.isArray(value)) return value.map(replaceDashesDeep) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = replaceDashesDeep(v);
    return out as T;
  }
  return value;
}
