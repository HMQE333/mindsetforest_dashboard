/**
 * Which model the "smart" AI features (plan simulation + plan chat) run on.
 * The user picks one in Settings → AI; the edge function maps the choice to an
 * OpenRouter model id (overridable there via env, so the exact model can change
 * without a client release).
 */
export type AIModelChoice = "sonnet" | "gpt";

export const AI_MODEL_CHOICES: { id: AIModelChoice; label: string; blurb: string }[] = [
  { id: "sonnet", label: "Claude Sonnet", blurb: "Best at long, structured decomposition and precise edits." },
  { id: "gpt", label: "GPT", blurb: "OpenAI's flagship — a different second opinion on the same plan." },
];

export const DEFAULT_AI_MODEL: AIModelChoice = "sonnet";

export function aiModelLabel(choice: AIModelChoice | undefined): string {
  return AI_MODEL_CHOICES.find((c) => c.id === choice)?.label ?? "Claude Sonnet";
}
