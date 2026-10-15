/**
 * The two study prompts the user keeps in Settings > AI Context > Nauka, one
 * source of truth for both places he studies: the learning mode ("Tryb nauki")
 * goes into every ChatGPT study pack and, through the tracker, into the vault
 * as _SYSTEM/learning-mode.md for Claude Desktop; the Primer prompt tells the
 * routine how to write a course's textbook (_SYSTEM/primer-prompt.md). Both
 * started life as Archive notes, so "Wczytaj z Archiwum" finds them there.
 */
import { fold } from "@/lib/kos-vault";

export interface StudyPrompts {
  learning_mode: string;
  primer_prompt: string;
  /** "" or a https://chatgpt.com/… link to the project whose instructions hold the learning mode. */
  chatgpt_project_url: string;
}

export const EMPTY_STUDY_PROMPTS: StudyPrompts = { learning_mode: "", primer_prompt: "", chatgpt_project_url: "" };

export type StudyPromptKind = "learning" | "primer";

export const CHATGPT_HOME = "https://chatgpt.com/";

/** Only a https link on chatgpt.com (default port, as the table's check wants): the button opens it in a new tab. */
export function isChatGptUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === "https:" && u.hostname === "chatgpt.com" && u.port === "" && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Where "Ucz się w ChatGPT" goes: the project, when one is set, else a new chat. */
export const chatGptTarget = (projectUrl: string | null | undefined) =>
  projectUrl && isChatGptUrl(projectUrl) ? projectUrl.trim() : CHATGPT_HOME;

/** An ilike pattern that narrows archive_blocks to candidates; `matchesArchivePrompt` decides. */
export const ARCHIVE_PATTERN: Record<StudyPromptKind, string> = {
  learning: "%Tryb nauki%",
  primer: "%self%contained%primer%",
};

/**
 * Is this Archive note the prompt? The learning mode is the note that starts
 * with "Tryb nauki" (a heading or bold marks before it are fine); the Primer
 * is the one asking for "a compact, self-contained primer".
 */
export function matchesArchivePrompt(kind: StudyPromptKind, content: string): boolean {
  if (kind === "learning") return /^tryb nauki\b/.test(fold(content.replace(/^[\s#>*_~=-]+/, "")));
  return /compact,?\s+self[\s-]?contained\s+primer/i.test(content);
}

/** The newest Archive note that is the prompt, or null. */
export function pickArchivePrompt<T extends { content: string; created_at: string }>(kind: StudyPromptKind, rows: T[]): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (!r.content || !matchesArchivePrompt(kind, r.content)) continue;
    if (!best || r.created_at > best.created_at) best = r;
  }
  return best;
}
