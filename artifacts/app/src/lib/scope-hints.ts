import type { ScopeId } from "@/lib/assistant-context";
import { describeAction, type AssistantAction } from "@/lib/assistant-actions";

/**
 * Two small guards against the router changing its mind between turns.
 *
 * 1. `keywordScopes`: a deterministic pre-pass. When the message plainly names
 *    a section or a write intent ("save a note", "tick the mission", "load the
 *    preset"), that section rides along whatever the router model picks, so
 *    the matching action is always offered.
 * 2. `annotateHistory`: what the model said earlier is only half the record;
 *    whether the user applied the proposed actions is the other half. Marking
 *    it in the history stops the model from "correcting" a note it did save.
 */

/**
 * A whole-word, case-insensitive match. `\b` and `\w` only know ASCII, so
 * "ścieżka" never starts a word for them and "kroków" breaks mid-word; the
 * word edges here are Unicode letters and digits instead, and `\w` in a
 * pattern means any letter. No lookbehind, so older Safari still parses it.
 */
const LETTER = String.raw`[\p{L}\p{N}_]`;
function hint(alternatives: string): RegExp {
  const body = alternatives.replace(/\\w/g, LETTER);
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])(?:${body})(?!${LETTER})`, "iu");
}

const HINTS: { scope: ScopeId; pattern: RegExp }[] = [
  { scope: "archive", pattern: hint(String.raw`notatk\w*|note[sd]?|zapisz|zanotuj|zapamietaj|zapamiętaj|archiw\w*|archive|jot|remember this`) },
  { scope: "dashboard", pattern: hint(String.raw`misj\w*|mission\w*|preset\w*|odhacz\w*|zrobi[lł]\w*|done with|completed|tick|xp|streak|home|monk mode|lock in`) },
  { scope: "paths", pattern: hint(String.raw`path\w*|[sś]cie[zż]k\w*|krok\w*|step\w*|plan\w* [sś]cie[zż]k\w*`) },
  { scope: "planning", pattern: hint(String.raw`task\w*|zadani\w*|mindmap\w*|mapa my[sś]li|planning|planowani\w*|deadline\w*|termin\w*`) },
  { scope: "calendar", pattern: hint(String.raw`calendar|kalendarz\w*|spotkani\w*|meeting\w*|wydarzeni\w*|event\w*`) },
  { scope: "finance", pattern: hint(String.raw`finans\w*|finance\w*|pieni[aą]dz\w*|money|wydatk\w*|expense\w*|bud[zż]et\w*|budget\w*|subskrypcj\w*|subscription\w*`) },
  { scope: "health", pattern: hint(String.raw`zdrowi\w*|health|waga|weight|sen|sleep|hrv|t[eę]tno|heart rate|trening\w*|workout\w*`) },
  { scope: "computer", pattern: hint(String.raw`komputer\w*|computer|screen time|czas przy komputerze|aplikacj\w*|apps?`) },
  { scope: "tracker", pattern: hint(String.raw`tracker|statystyk\w*|stats|metryk\w*|metric\w*|zaloguj\w*|wpisz\w*|pompk\w*|push-?ups?|przeczyta\w*|stron\w*|pages|godzin\w* pracy|deep work|kroków|wypi\w*`) },
  { scope: "library", pattern: hint(String.raw`ksi[aą][zż]k\w*|book\w*|library|bibliotek\w*|czyta[lł]\w*|reading`) },
  { scope: "cooking", pattern: hint(String.raw`przepis\w*|recipe\w*|gotowani\w*|cooking|posi[lł]\w*|meal\w*`) },
  { scope: "breathing", pattern: hint(String.raw`oddech\w*|breath\w*|breathing`) },
  { scope: "oracle", pattern: hint(String.raw`oracle|wyroczni\w*|nagrod\w*|reward\w*`) },
];

/** Sections a message names outright. Empty when it names none. */
export function keywordScopes(text: string): ScopeId[] {
  const t = text.normalize("NFC");
  const out: ScopeId[] = [];
  for (const h of HINTS) if (h.pattern.test(t)) out.push(h.scope);
  return out;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  actions?: AssistantAction[];
  actionsResolved?: "applied" | "dismissed";
  /** Per action, whether it actually went through when the user applied them. */
  actionResults?: boolean[];
}

/** The conversation as the model should remember it: replies plus what happened to their actions. */
export function annotateHistory(messages: HistoryMessage[]): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((m) => !m.error)
    .map((m) => {
      if (m.role !== "assistant" || !m.actions || m.actions.length === 0) return { role: m.role, content: m.content };
      const list = m.actions.map(describeAction).join("; ");
      let marker: string;
      if (m.actionsResolved === "applied") {
        // Confirming is not the same as succeeding: only the actions that went
        // through are recorded as done, or the model later claims a failed one
        // happened. Replies saved before results were kept count as all done.
        const results = m.actionResults && m.actionResults.length === m.actions.length ? m.actionResults : null;
        const done = m.actions.filter((_, i) => !results || results[i]).map(describeAction);
        const failed = results ? m.actions.filter((_, i) => !results[i]).map(describeAction) : [];
        marker = [
          done.length > 0 ? `[Applied by the user, these happened: ${done.join("; ")}]` : "",
          failed.length > 0 ? `[The user confirmed these but they FAILED and did not happen: ${failed.join("; ")}]` : "",
        ].filter(Boolean).join("\n");
      } else if (m.actionsResolved === "dismissed") {
        marker = `[The user declined these proposed actions: ${list}]`;
      } else {
        marker = `[Proposed, not yet confirmed: ${list}]`;
      }
      return { role: m.role, content: `${m.content}\n${marker}` };
    });
}
