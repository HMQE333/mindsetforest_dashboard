/**
 * SELECT - the operator that decides what a stalled path actually needs.
 *
 * The naive version of this feature asks an LLM "why is the user stuck and what
 * should they read?". That is wrong twice over: it costs a round trip to answer
 * a question the user can answer instantly, and it assumes the answer is
 * information. Usually it is not.
 *
 * So the router is a fixed symptom table, evaluated on the client, with no model
 * call. Exactly one of its routes fetches information. The rest change the plan,
 * end the deliberation, or legitimise stopping - which is the whole finding:
 * being stuck is far more often a termination problem than a knowledge problem.
 *
 * If the `inform` route turns out to fire most of the time in practice, that is
 * the evidence that justifies building a real retrieval layer. Until then it
 * would be a subsystem built on a guess.
 */

/** What the app does once the user names the symptom. */
export type RouteKind =
  /** The one route that genuinely needs outside information. */
  | "inform"
  /** Deliberation that will not terminate. Shrink the step until it can be finished. */
  | "commit"
  /** The named constraint was wrong. Rewrite the diagnosis before re-planning. */
  | "rediagnose"
  /** Legitimate stillness. Park it without killing the path. */
  | "park"
  /** The step is too big to start. Cut it down. */
  | "cut"
  /** Nothing to change. Recorded, not acted on. */
  | "note";

export interface Route {
  id: string;
  /** What the user feels. Written in their voice, not the system's. */
  symptom: string;
  /** What that symptom means mechanically. Shown small, under the button. */
  reads: string;
  kind: RouteKind;
  /** What happens next, shown once they pick it. */
  verdict: string;
}

export const ROUTES: Route[] = [
  {
    id: "unknown-how",
    symptom: "I don't know what to actually do",
    reads: "A real information gap",
    kind: "inform",
    verdict:
      "This is the one kind of stuck that reading fixes. Name the single question you need answered - not the topic, the question.",
  },
  {
    id: "circles",
    symptom: "I keep going round in circles",
    reads: "Deliberation that will not end",
    kind: "commit",
    verdict:
      "More thinking will not resolve this; the regress is structural. Shrink the step until it is something you could finish today, then do that version.",
  },
  {
    id: "wrong-problem",
    symptom: "This isn't the real problem",
    reads: "The diagnosis was wrong",
    kind: "rediagnose",
    verdict:
      "Everything under a wrong diagnosis is decoration. Rewrite the constraint first - the steps are downstream of it.",
  },
  {
    id: "too-big",
    symptom: "The step is too big to start",
    reads: "No affordable first move",
    kind: "cut",
    verdict:
      "Cut it to the smallest version that still counts as the real thing. A step you can start badly beats a step you admire.",
  },
  {
    id: "wrong-time",
    symptom: "Wrong time - life is in the way",
    reads: "Deferral, chosen on purpose",
    kind: "park",
    verdict:
      "Parked. The path stays alive and stops asking. Stillness that you chose is not drift.",
  },
  {
    id: "just-didnt",
    symptom: "No reason. I just didn't",
    reads: "No change to the plan",
    kind: "note",
    verdict:
      "Left exactly as it is. If this is the answer three times running, the shape of the step is wrong for you, not your willingness.",
  },
];

/** Days a step sits untouched before the app is allowed to ask about it once. */
export const STALL_DAYS = 7;

/** How long "wrong time" buys before the question can come back. */
export const PARK_DAYS = 14;

export function routeById(id: string): Route | undefined {
  return ROUTES.find(r => r.id === id);
}
