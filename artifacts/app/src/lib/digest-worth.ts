/**
 * Whether a note is worth a spaced-repetition card. Digest asks "do you still
 * remember this?", so a note that is only a link (or only a picture) has
 * nothing to remember: it needs some words of its own. A link with a summary,
 * a transcript or a written thought stays in.
 */
const URLS = /https?:\/\/\S+/gi;
const IMAGE_TAG = /\[image\]/gi;
/** Letters (any alphabet) needed outside links before a note can be a card. */
export const DIGEST_MIN_LETTERS = 40;

export function worthReviewing(title: string | null | undefined, content: string | null | undefined): boolean {
  const own = `${title ?? ""} ${content ?? ""}`.replace(URLS, " ").replace(IMAGE_TAG, " ");
  const letters = own.match(/\p{L}/gu)?.length ?? 0;
  return letters >= DIGEST_MIN_LETTERS;
}
