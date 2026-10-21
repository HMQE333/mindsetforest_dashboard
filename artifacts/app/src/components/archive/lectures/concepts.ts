import { fold, OTHER_COURSE, type KnowledgeNote } from "@/lib/kos-vault";

/** One course's notes in the Pojęcia view; notes without a course sit in "Inne", last. */
export interface NoteGroup {
  course: string;
  notes: KnowledgeNote[];
}

const searchWords = (query: string) => fold(query).split(/\s+/).filter(Boolean);

/** The notes whose title, other names, course or text hold every word of the query, diacritics folded. */
export function filterNotes(notes: KnowledgeNote[], query: string): KnowledgeNote[] {
  const words = searchWords(query);
  if (words.length === 0) return notes;
  return notes.filter((n) => {
    const hay = fold(`${n.title}\n${n.aliases.join("\n")}\n${n.course ?? ""}\n${n.body}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Grouped by course (alphabetical, "Inne" last), each group by title. */
export function groupNotes(notes: KnowledgeNote[]): NoteGroup[] {
  const by = new Map<string, KnowledgeNote[]>();
  for (const n of notes) {
    const c = n.course?.trim() || OTHER_COURSE;
    const arr = by.get(c);
    if (arr) arr.push(n);
    else by.set(c, [n]);
  }
  return [...by.entries()]
    .sort(([a], [b]) => Number(a === OTHER_COURSE) - Number(b === OTHER_COURSE) || a.localeCompare(b, "pl"))
    .map(([course, list]) => ({ course, notes: list.sort((a, b) => a.title.localeCompare(b.title, "pl")) }));
}

/** The note before and after `name` in the order the cards are shown, by lower-cased name. */
export function neighbours(order: KnowledgeNote[], name: string | null): { prev: KnowledgeNote | null; next: KnowledgeNote | null } {
  const i = name ? order.findIndex((n) => n.name.toLowerCase() === name.toLowerCase()) : -1;
  if (i < 0) return { prev: null, next: null };
  return { prev: order[i - 1] ?? null, next: order[i + 1] ?? null };
}

export type LecturesMode = "lectures" | "concepts";
export const MODE_KEY = "kos.lectures.mode";

export function readMode(): LecturesMode {
  try {
    return localStorage.getItem(MODE_KEY) === "concepts" ? "concepts" : "lectures";
  } catch {
    return "lectures";
  }
}

export function saveMode(mode: LecturesMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* private mode */
  }
}
