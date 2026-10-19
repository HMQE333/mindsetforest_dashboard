import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useArchiveState } from "@/hooks/useArchiveState";
import { mergeTags, normaliseTag, type TagSuggestion } from "@/lib/archive-tags";
import { toast } from "sonner";

/**
 * Tag suggestions that learn from his own notes (ai-suggest-tags, mode "learn"):
 * the tags of his most similar notes, his past answers on them, the type rule
 * and the model, as at most five chips per note, the type chip first.
 *
 * - suggest(ids): chips per note. Asked in batches of 20, one batch at a time;
 *   answers are kept for the session and shared by every component (the Inbox
 *   strip, the reader and the tag queue), and a note already being asked about
 *   is not asked twice. Rejects with the function's own message.
 * - accept(id, tags): writes the note's tags (a type replaces the note's type,
 *   the rest are added) and records the answer: the chosen tags as accepted,
 *   the chips offered but left out as turned down. Resolves the tags before
 *   and after (for Undo), or null when nothing was saved.
 * - reject(id, tag): one chip turned down; it is not offered for this note again.
 * - forget(id): drop the chips without recording anything (Esc, dismiss).
 *
 * The answers go to archive_tag_feedback
 * (supabase/migrations/20261019180000_archive_tag_learning.sql); until that is
 * applied the tags are still written and the answers are simply not kept.
 */

export type { TagSuggestion } from "@/lib/archive-tags";

/** What happened to the model's part: "capped" and "off" mean only similar notes and the rule answered. */
export type TagAiStatus = "used" | "capped" | "off" | "failed" | "not-asked";
export interface TagSuggestStatus {
  ai: TagAiStatus;
  /** Why the model did not answer, when it did not (Polish for the monthly cap). */
  aiError?: string;
}
export interface AcceptResult {
  before: string[];
  after: string[];
}

export const SUGGEST_BATCH = 20;
const MAX_HELD = 500;

type FeedbackSource = "neighbours" | "ai" | "type-rule" | "manual";
interface FeedbackRow {
  user_id: string;
  block_id: string;
  tag: string;
  accepted: boolean;
  source: FeedbackSource;
}

// Per user and note, for the session.
const held = new Map<string, TagSuggestion[]>();
const pending = new Map<string, Promise<TagSuggestion[]>>();
const keyOf = (userId: string, blockId: string) => `${userId}:${blockId}`;

function remember(key: string, list: TagSuggestion[]) {
  held.delete(key);
  held.set(key, list);
  while (held.size > MAX_HELD) held.delete(held.keys().next().value as string);
}

/** The function's own message instead of "Edge Function returned a non-2xx status code". */
async function functionError(error: { message: string }): Promise<string> {
  let message = error.message;
  try {
    const json = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
    if (json?.error) message = json.error;
  } catch { /* not JSON */ }
  return message;
}

async function askBatch(ids: string[]): Promise<{ suggestions: Record<string, TagSuggestion[]>; status: TagSuggestStatus }> {
  const { data, error } = await supabase.functions.invoke("ai-suggest-tags", { body: { mode: "learn", blockIds: ids } });
  if (error) throw new Error(await functionError(error));
  if (data?.error) throw new Error(String(data.error));
  return {
    suggestions: (data?.suggestions ?? {}) as Record<string, TagSuggestion[]>,
    status: { ai: (data?.ai ?? "not-asked") as TagAiStatus, ...(data?.aiError ? { aiError: String(data.aiError) } : {}) },
  };
}

async function logFeedback(rows: FeedbackRow[]) {
  const valid = rows.filter((r) => r.tag && r.tag.length <= 64);
  if (!valid.length) return;
  const { error } = await supabase.from("archive_tag_feedback").insert(valid);
  if (error) console.warn("archive_tag_feedback insert failed:", error.message);
}

export function useTagSuggestions() {
  const { user } = useAuth();
  const userId = user?.id;
  const { updateBlock } = useArchiveState({ live: false });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<TagSuggestStatus | null>(null);
  const inFlight = useRef(0);

  const suggest = useCallback(async (blockIds: readonly string[], opts: { fresh?: boolean } = {}): Promise<Map<string, TagSuggestion[]>> => {
    const out = new Map<string, TagSuggestion[]>();
    if (!userId) return out;
    const waits: Promise<void>[] = [];
    const toAsk: string[] = [];
    for (const id of new Set(blockIds)) {
      const key = keyOf(userId, id);
      const have = held.get(key);
      const asking = pending.get(key);
      if (!opts.fresh && have) out.set(id, have);
      else if (!opts.fresh && asking) waits.push(asking.then((list) => void out.set(id, list)));
      else toAsk.push(id);
    }
    // One batch at a time: the queue prefetches while he reads, it must not flood the model.
    let chain: Promise<unknown> = Promise.resolve();
    for (let i = 0; i < toAsk.length; i += SUGGEST_BATCH) {
      const batch = toAsk.slice(i, i + SUGGEST_BATCH);
      const request = chain.catch(() => undefined).then(() => askBatch(batch));
      chain = request;
      for (const id of batch) {
        const key = keyOf(userId, id);
        const one = request.then(({ suggestions, status: s }) => {
          setStatus(s);
          const list = Array.isArray(suggestions[id]) ? suggestions[id] : [];
          remember(key, list);
          return list;
        });
        pending.set(key, one);
        one.catch(() => undefined).finally(() => { if (pending.get(key) === one) pending.delete(key); });
        waits.push(one.then((list) => void out.set(id, list)));
      }
    }
    if (!waits.length) return out;
    inFlight.current++;
    setBusy(true);
    try {
      await Promise.all(waits);
    } finally {
      if (--inFlight.current === 0) setBusy(false);
    }
    return out;
  }, [userId]);

  const accept = useCallback(async (blockId: string, tags: readonly string[]): Promise<AcceptResult | null> => {
    if (!userId) return null;
    const key = keyOf(userId, blockId);
    const offered = held.get(key) ?? [];
    const chosen = [...new Set(tags.map(normaliseTag).filter(Boolean))];
    // From the server, not the list held here: that may be a poll behind another device.
    const { data, error } = await supabase.from("archive_blocks").select("tags").eq("id", blockId).maybeSingle();
    if (error || !data) {
      toast.error("Could not read the note's tags", { description: error?.message });
      return null;
    }
    const before = [...((data.tags ?? []) as string[])];
    const after = mergeTags(before, chosen);
    const changed = after.length !== before.length || after.some((t, i) => t !== before[i]);
    if (changed && !(await updateBlock(blockId, { tags: after }))) return null;
    held.delete(key);
    const sourceOf = (tag: string): FeedbackSource => offered.find((s) => s.tag === tag)?.source ?? "manual";
    void logFeedback([
      ...chosen
        .filter((tag) => offered.some((s) => s.tag === tag) || !before.includes(tag))
        .map((tag) => ({ user_id: userId, block_id: blockId, tag, accepted: true, source: sourceOf(tag) })),
      ...offered
        .filter((s) => !chosen.includes(s.tag))
        .map((s) => ({ user_id: userId, block_id: blockId, tag: s.tag, accepted: false, source: s.source })),
    ]);
    return { before, after };
  }, [userId, updateBlock]);

  const reject = useCallback(async (blockId: string, tag: string): Promise<void> => {
    if (!userId) return;
    const key = keyOf(userId, blockId);
    const t = normaliseTag(tag);
    if (!t) return;
    const offered = held.get(key);
    const source = offered?.find((s) => s.tag === t)?.source ?? "manual";
    if (offered) held.set(key, offered.filter((s) => s.tag !== t));
    await logFeedback([{ user_id: userId, block_id: blockId, tag: t, accepted: false, source }]);
  }, [userId]);

  const forget = useCallback((blockId: string) => {
    if (userId) held.delete(keyOf(userId, blockId));
  }, [userId]);

  /** The chips already fetched for a note, without asking (undefined when none are held). */
  const peek = useCallback((blockId: string): TagSuggestion[] | undefined => (userId ? held.get(keyOf(userId, blockId)) : undefined), [userId]);

  return { suggest, accept, reject, forget, peek, busy, status };
}
