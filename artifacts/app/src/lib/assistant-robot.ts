/**
 * What the assistant's robot (assets/assistant-robot.json) shows. Pure, so the
 * rules can be tested: a mood it holds (idle, or thinking while an answer is
 * on its way) and one-off reactions to what just happened in the chat.
 *
 * The animation is one timeline cut into segments by its markers.
 */

export type RobotMood = "idle" | "thinking";
export type RobotReactionKind = "yes" | "no" | "alert" | "jump";
export interface RobotReaction {
  kind: RobotReactionKind;
  /** Changes once per event, so the same kind can play again for a new one. */
  key: string;
}

/** Frame ranges from the animation's markers (60 fps). */
export const ROBOT_SEGMENTS: Record<RobotMood | RobotReactionKind, [number, number]> = {
  idle: [0, 29],
  yes: [31, 105],
  no: [106, 180],
  alert: [181, 270],
  thinking: [271, 390],
  jump: [391, 479],
};

/** A still frame per state, for reduced motion: the pose that says it best. */
export const ROBOT_STILL: Record<RobotMood | RobotReactionKind, number> = {
  idle: 0,
  yes: 60,
  no: 140,
  alert: 220,
  thinking: 330,
  jump: 430,
};

interface MessageLike {
  id: string;
  role: "user" | "assistant";
  error?: boolean;
  actions?: unknown[];
  actionsResolved?: "applied" | "dismissed";
  actionResults?: boolean[];
}

export interface RobotSignal {
  mood: RobotMood;
  reaction: RobotReaction | null;
}

/**
 * Mood and latest reaction from the conversation:
 * thinking while an answer streams (or voice mode is working on one);
 * alert when a reply proposes changes to confirm; yes when they were applied;
 * no when any failed, they were dismissed, or the reply errored.
 */
export function robotSignal(messages: MessageLike[], isStreaming: boolean, voiceThinking = false): RobotSignal {
  const mood: RobotMood = isStreaming || voiceThinking ? "thinking" : "idle";
  let last: MessageLike | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") { last = messages[i]; break; }
  }
  if (!last || isStreaming) return { mood, reaction: null };
  if (last.error) return { mood, reaction: { kind: "no", key: `${last.id}:error` } };
  if (last.actions && last.actions.length > 0) {
    if (!last.actionsResolved) return { mood, reaction: { kind: "alert", key: `${last.id}:pending` } };
    if (last.actionsResolved === "dismissed") return { mood, reaction: { kind: "no", key: `${last.id}:dismissed` } };
    const ok = !last.actionResults || last.actionResults.every(Boolean);
    return { mood, reaction: { kind: ok ? "yes" : "no", key: `${last.id}:applied` } };
  }
  return { mood, reaction: null };
}
