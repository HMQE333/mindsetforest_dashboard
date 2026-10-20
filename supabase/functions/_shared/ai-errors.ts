/**
 * What the Archive's AI functions answer when the model provider fails: a
 * sentence the app shows as it is (the client reads { error }), instead of
 * "AI gateway error" or a bare non-2xx status.
 */

export function providerErrorMessage(status: number): string {
  if (status === 429) return "The AI service is busy (rate limit). Try again in a minute.";
  if (status === 402) return "The AI account (OpenRouter) is out of credits.";
  if (status === 401 || status === 403) return "The AI key (OPENROUTER_API_KEY) was refused by OpenRouter.";
  if (status === 408 || status === 504) return "The AI service took too long to answer. Try again.";
  if (status >= 500) return `The AI service failed (${status}). Try again in a moment.`;
  return `The AI service refused the request (${status}).`;
}

/** The status the app gets: 429 and 402 as they are, any other provider failure as 502. */
export function providerErrorStatus(status: number): number {
  return status === 429 || status === 402 ? status : 502;
}

export const NO_KEY_MESSAGE = "AI is not set up: OPENROUTER_API_KEY is missing for this function.";
export const EMPTY_ANSWER_MESSAGE = "The AI returned no answer. Try again.";

/**
 * A text that looks like it holds a password or a key (looksLikeCredential in
 * ./archive-tags.ts) is refused with this (422) before anything reaches the
 * model: the app checks first, this is for a client that did not.
 */
export const CREDENTIAL_REFUSAL = "This looks like it holds a password or a key, so it is not sent to the AI.";
