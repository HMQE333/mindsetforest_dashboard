/**
 * Whether a text looks like it holds a password, a PIN, a token or a key.
 *
 * One rule for the whole Archive: ai-suggest-tags runs the same check before
 * anything reaches a model or the embedding, the app runs it over all of a
 * note before an AI action (Shorten, Expand, Clean, own prompt, Merge,
 * Summarize) sends it, and ai-archive-clean / -expand / -multi run it again.
 * The rule lives in the edge function's shared file, which has no imports, so
 * the app bundles that one function from it as it is.
 */
export { looksLikeCredential } from "../../../../supabase/functions/_shared/archive-tags";

/** What the Archive says instead of sending such a text: the words the AI functions refuse it with (422). */
export { CREDENTIAL_REFUSAL as CREDENTIAL_MESSAGE } from "../../../../supabase/functions/_shared/ai-errors";
