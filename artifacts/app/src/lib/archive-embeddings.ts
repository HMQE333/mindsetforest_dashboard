/**
 * The embeddings this page is writing now (useArchiveState embeds every note
 * it saves or edits), by note id. ai-suggest-tags embeds a note that has none
 * before it looks for similar ones; a suggestion request for a just-saved note
 * (the Inbox strip, right after Save) waits here for the page's own embedding
 * instead, so the note is not embedded twice (two OpenAI calls, and two
 * updated_at bumps that each make the list refetch).
 */

const writing = new Map<string, Promise<void>>();

/** The page is embedding the note; `done` settles when it is written (or failed). */
export function trackEmbedding(id: string, done: Promise<unknown>): void {
  const p = done.then(
    () => undefined,
    () => undefined,
  );
  writing.set(id, p);
  void p.then(() => {
    if (writing.get(id) === p) writing.delete(id);
  });
}

/**
 * Resolves once the embeddings this page started for these notes are written,
 * or after `maxMs` (the function then embeds what is still missing itself).
 */
export function embeddingsWritten(ids: readonly string[], maxMs = 6_000): Promise<void> {
  const waits = ids.map((id) => writing.get(id)).filter((p): p is Promise<void> => !!p);
  if (!waits.length) return Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    Promise.all(waits).then(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, maxMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Embeddings in flight (for tests). */
export const embeddingsInFlight = () => writing.size;
