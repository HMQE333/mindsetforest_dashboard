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

const HINTS: { scope: ScopeId; pattern: RegExp }[] = [
  { scope: "archive", pattern: /\b(notatk\w*|note[sd]?|zapisz|zanotuj|zapamietaj|zapamiętaj|archiw\w*|archive|jot|remember this)\b/i },
  { scope: "dashboard", pattern: /\b(misj\w*|mission\w*|preset\w*|odhacz\w*|zrobi[lł]\w*|done with|completed|tick|xp|streak|home|monk mode|lock in)\b/i },
  { scope: "paths", pattern: /\b(path\w*|[sś]cie[zż]k\w*|krok\w*|step\w*|plan\w* [sś]cie[zż]k\w*)\b/i },
  { scope: "planning", pattern: /\b(task\w*|zadani\w*|mindmap\w*|mapa my[sś]li|planning|planowani\w*|deadline\w*|termin\w*)\b/i },
  { scope: "calendar", pattern: /\b(calendar|kalendarz\w*|spotkani\w*|meeting\w*|wydarzeni\w*|event\w*)\b/i },
  { scope: "finance", pattern: /\b(finans\w*|finance\w*|pieni[aą]dz\w*|money|wydatk\w*|expense\w*|bud[zż]et\w*|budget\w*|subskrypcj\w*|subscription\w*)\b/i },
  { scope: "health", pattern: /\b(zdrowi\w*|health|waga|weight|sen|sleep|hrv|t[eę]tno|heart rate|trening\w*|workout\w*)\b/i },
  { scope: "computer", pattern: /\b(komputer\w*|computer|screen time|czas przy komputerze|aplikacj\w*|apps?)\b/i },
  { scope: "tracker", pattern: /\b(tracker|statystyk\w*|stats|metryk\w*|metric\w*)\b/i },
  { scope: "library", pattern: /\b(ksi[aą][zż]k\w*|book\w*|library|bibliotek\w*|czyta[lł]\w*|reading)\b/i },
  { scope: "cooking", pattern: /\b(przepis\w*|recipe\w*|gotowani\w*|cooking|posi[lł]\w*|meal\w*)\b/i },
  { scope: "breathing", pattern: /\b(oddech\w*|breath\w*|breathing)\b/i },
  { scope: "oracle", pattern: /\b(oracle|wyroczni\w*|nagrod\w*|reward\w*)\b/i },
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
}

/** The conversation as the model should remember it: replies plus what happened to their actions. */
export function annotateHistory(messages: HistoryMessage[]): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((m) => !m.error)
    .map((m) => {
      if (m.role !== "assistant" || !m.actions || m.actions.length === 0) return { role: m.role, content: m.content };
      const list = m.actions.map(describeAction).join("; ");
      const marker =
        m.actionsResolved === "applied"
          ? `[Applied by the user, these happened: ${list}]`
          : m.actionsResolved === "dismissed"
            ? `[The user declined these proposed actions: ${list}]`
            : `[Proposed, not yet confirmed: ${list}]`;
      return { role: m.role, content: `${m.content}\n${marker}` };
    });
}
