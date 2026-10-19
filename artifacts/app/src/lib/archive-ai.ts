/**
 * AI actions on Archive notes, and the checks that keep them honest.
 *
 * Every action has stated borders: what it may and may not do to his text.
 * The same words are shown on the button (tooltip), in the preview header,
 * and given to the model (supabase/functions/ai-archive-*). After the model
 * answers, checkAIResult (archive-ai-check.ts, loaded with the preview) tests
 * the borders that can be tested and the preview shows what failed, next to a
 * word-level diff.
 *
 * Pure: no React, no Supabase. Kept small: it ships with the Archive.
 */
import { autoTitle } from "./archive-data";

/** On one note (or the Inbox draft). */
export type NoteAIAction = "shorten" | "expand" | "clean" | "prompt";
/** On two or more notes together; the result is always a new note. */
export type MultiAIAction = "merge" | "summarize" | "together";
export type AIAction = NoteAIAction | MultiAIAction;

export interface AIActionInfo {
  label: string;
  /** "Shortening": the preview's loading line. */
  verb: string;
  icon: string;
  /** The borders, one sentence each, shown in the tooltip and the preview header. */
  border: string;
  /** What Enter does in the preview. */
  defaultSave: "replace" | "new";
  /** Whether "Replace" is offered at all (never for a note made from several). */
  canReplace: boolean;
}

export const AI_ACTIONS: Record<AIAction, AIActionInfo> = {
  shorten: {
    label: "Shorten",
    verb: "Shortening",
    icon: "✂️",
    border: "Same meaning and language. Keeps every link, number, name, date and #tag. Removes repetition and filler only; never adds facts.",
    defaultSave: "replace",
    canReplace: true,
  },
  expand: {
    label: "Expand",
    verb: "Expanding",
    icon: "💡",
    border: "Your text stays word for word. AI only adds short explanations in marked blocks (> 💡 AI: …) after your paragraphs.",
    defaultSave: "new",
    canReplace: true,
  },
  clean: {
    label: "Clean",
    verb: "Cleaning",
    icon: "🧹",
    border: "Fixes typos, spacing and formatting only. Same words otherwise; never shortens, rephrases or splits.",
    defaultSave: "replace",
    canReplace: true,
  },
  prompt: {
    label: "Own prompt",
    verb: "Working",
    icon: "💬",
    border: "Does what you ask, nothing more. Check the changes before you replace anything.",
    defaultSave: "new",
    canReplace: true,
  },
  merge: {
    label: "Merge",
    verb: "Merging",
    icon: "🔗",
    border: "One new note from the selected ones: keeps every unique point, link, number and #tag; removes only repeats. The originals stay.",
    defaultSave: "new",
    canReplace: false,
  },
  summarize: {
    label: "Summarize",
    verb: "Summarizing",
    icon: "📝",
    border: "A short summary of the selected notes as a new note. Adds nothing that is not in them. The originals stay.",
    defaultSave: "new",
    canReplace: false,
  },
  together: {
    label: "Prompt on all",
    verb: "Working",
    icon: "🤖",
    border: "Your prompt over all the selected notes together; the answer becomes a new note. The originals stay.",
    defaultSave: "new",
    canReplace: false,
  },
};

/** The longest text each function takes whole (it refuses more rather than cut his note). */
export const AI_TEXT_LIMIT: Record<NoteAIAction, number> = {
  shorten: 30_000,
  expand: 30_000,
  clean: 60_000,
  prompt: 60_000,
};
/** ai-archive-multi: per note and for all of them together. */
export const MULTI_NOTE_LIMIT = 15_000;
export const MULTI_TOTAL_LIMIT = 60_000;
export const MULTI_MAX_NOTES = 40;

/** Why the text cannot go to this action, or null. */
export function aiTooLong(action: NoteAIAction, content: string): string | null {
  const limit = AI_TEXT_LIMIT[action];
  if (content.length <= limit) return null;
  return `Too long for ${AI_ACTIONS[action].label} (${content.length.toLocaleString("en-US")} characters; the limit is ${limit.toLocaleString("en-US")}). Split the note first.`;
}

/** Why these notes cannot be merged or summarised together, or null. */
export function multiTooLong(notes: readonly { title: string; content: string }[]): string | null {
  if (notes.length > MULTI_MAX_NOTES) return `At most ${MULTI_MAX_NOTES} notes at once (${notes.length} selected).`;
  const long = notes.find((n) => n.content.length > MULTI_NOTE_LIMIT);
  if (long) return `"${long.title.slice(0, 40)}" is too long to combine (${long.content.length.toLocaleString("en-US")} characters; the limit is ${MULTI_NOTE_LIMIT.toLocaleString("en-US")} per note).`;
  const total = notes.reduce((s, n) => s + n.content.length, 0);
  if (total > MULTI_TOTAL_LIMIT) return `Together the notes are too long (${total.toLocaleString("en-US")} characters; the limit is ${MULTI_TOTAL_LIMIT.toLocaleString("en-US")}).`;
  return null;
}

/**
 * The title after replacing the content: a title the Inbox made from the
 * first line (autoTitle) follows the new text; one he wrote stays.
 */
export function titleAfterReplace(title: string, oldContent: string, newContent: string): string {
  return title === autoTitle(oldContent) || !title.trim() ? autoTitle(newContent) : title;
}

/** The title of a note saved from an AI result. */
export function aiNoteTitle(action: AIAction, sourceTitle: string, count = 1): string {
  if (action === "merge") return `Merged (${count} notes)`;
  if (action === "summarize") return `Summary (${count} notes)`;
  if (action === "together") return `AI (${count} notes)`;
  const base = sourceTitle.replace(/\s+/g, " ").trim().slice(0, 50) || "note";
  const word = action === "shorten" ? "Shortened" : action === "expand" ? "Expanded" : action === "clean" ? "Cleaned" : "AI";
  return `${word}: ${base}`;
}
