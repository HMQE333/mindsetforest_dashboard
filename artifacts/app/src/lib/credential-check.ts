/**
 * Whether a text looks like it holds a password, a PIN, a token or a key.
 *
 * One rule for the whole Archive: ai-suggest-tags runs the same check before
 * anything reaches a model or the embedding, and the app runs it before an AI
 * action (Shorten, Expand, Clean, own prompt, Merge, Summarize) sends a note.
 * The rule lives in the edge function's shared file, which has no imports, so
 * the app bundles that one function from it as it is.
 */
export { looksLikeCredential } from "../../../../supabase/functions/_shared/archive-tags";

/** What the Archive says instead of sending such a text. */
export const CREDENTIAL_MESSAGE = "This looks like it holds a password or a key, so it is not sent to the AI.";
