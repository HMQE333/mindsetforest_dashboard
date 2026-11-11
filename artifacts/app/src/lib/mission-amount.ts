/**
 * Numbers read from a mission's own words: "Read 40 pages" -> 40, "Nauka 1h" ->
 * 60 minutes, "15 min" -> 15. Only defaults for the quiet prompts: the user
 * always sees and can change the number before anything is saved.
 */

/** Minutes in a duration text ("15 min", "1h", "1h 30m", "1,5 h", "90 minut", "2 godz"). */
export function parseMinutes(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(",", ".");
  let total = 0;
  let found = false;
  const h = t.match(/(\d+(?:\.\d+)?)\s*(?:h\b|hr|hrs|hour|hours|godz\w*|godzin\w*)/);
  if (h) { total += parseFloat(h[1]) * 60; found = true; }
  const m = t.match(/(\d+)\s*(?:m\b|min\w*)/);
  if (m) { total += parseInt(m[1], 10); found = true; }
  if (!found) return null;
  const r = Math.round(total);
  return r > 0 && r <= 24 * 60 ? r : null;
}

/** The planned minutes of a mission: set by hand, else read from its duration or title. */
export function plannedMinutesOf(m: { plannedMinutes?: number; duration?: string; title?: string }): number | null {
  if (m.plannedMinutes && m.plannedMinutes > 0) return m.plannedMinutes;
  return parseMinutes(m.duration) ?? parseMinutes(m.title);
}

/**
 * The amount in a mission's title: the first number that is not a time.
 * "Read 40 pages" -> 40, "50 pompek" -> 50, "Nauka 1h" -> null.
 */
export function parseAmount(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(",", ".");
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*([\p{L}]*)/gu)) {
    const unit = m[2];
    if (/^(h|hr|hrs|hour|hours|godz\w*|godzin\w*|m|min\w*|s|sek\w*|sec\w*)$/.test(unit)) continue;
    const n = parseFloat(m[1]);
    if (n > 0 && n < 100000) return n;
  }
  return null;
}

/** Does a metric count time, and in which unit? "min"/"minutes" -> minutes, "h"/"hours"/"godz" -> hours. */
export function timeUnitOf(unit: string | null | undefined): "minutes" | "hours" | null {
  const u = (unit ?? "").trim().toLowerCase();
  if (/^(h|hr|hrs|hour|hours|godz\w*|godzin\w*)$/.test(u)) return "hours";
  if (/^(m|min|mins|minute|minutes|minut\w*)$/.test(u)) return "minutes";
  return null;
}

/** Minutes as the metric's own value (hours rounded to 0.05 h). */
export function minutesToMetricValue(minutes: number, unit: string | null | undefined): number {
  return timeUnitOf(unit) === "hours" ? Math.round((minutes / 60) * 20) / 20 : Math.round(minutes);
}

/** "52 min", "1 h 05 min". */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}
