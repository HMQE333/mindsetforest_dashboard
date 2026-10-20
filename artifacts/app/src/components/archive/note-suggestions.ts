import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTagSuggestions, type TagSuggestion } from "@/hooks/useTagSuggestions";
import type { ArchiveBlock } from "@/lib/archive-data";
import { pillarTag } from "@/lib/archive-tags";
import { noteTags } from "./archive-index";
import { isPillarChip, pillarIdOf } from "./TagChips";

type UpdateBlock = (id: string, updates: Partial<ArchiveBlock>) => Promise<unknown>;
type SuggestApi = ReturnType<typeof useTagSuggestions>;

/** A note that wants chips: no tag, or no type. */
export function wantsSuggestions(b: ArchiveBlock): boolean {
  const t = noteTags(b);
  return t.folders.length === 0 || t.type === null;
}

/** The chips still worth showing for the note as it is now: none it already carries. */
export function freshChips(b: ArchiveBlock, chips: readonly TagSuggestion[] | undefined): TagSuggestion[] | undefined {
  if (!chips) return chips;
  const t = noteTags(b);
  return chips.filter((c) => {
    if (isPillarChip(c)) return !b.pillars.includes(pillarIdOf(c));
    if (c.kind === "type") return t.type === null && !t.shown.includes(c.tag);
    return !t.shown.includes(c.tag);
  });
}

export interface Accepted {
  before: { tags: string[]; pillars: string[] };
  after: { tags: string[]; pillars: string[] };
}

/**
 * Accept the chosen chips through useTagSuggestions, in one write: the type
 * replaces the note's type, tags are added, suggested pillars ("pillar:<id>")
 * are added to the note's pillars (never removing one). It records the answer:
 * the chosen chips as accepted, pillars included, and the chips left out as
 * turned down. Resolves the note's tags and pillars before and after, or null
 * when nothing was saved. (`_updateBlock` is kept for the callers' shape: the
 * write goes through the hook.)
 */
export async function acceptChips(api: SuggestApi, block: ArchiveBlock, chosen: readonly TagSuggestion[], _updateBlock?: UpdateBlock): Promise<Accepted | null> {
  const res = await api.accept(block.id, chosen.map((c) => (isPillarChip(c) ? pillarTag(pillarIdOf(c)) : c.tag)));
  if (!res) return null;
  return { before: { tags: res.before, pillars: res.pillarsBefore }, after: { tags: res.after, pillars: res.pillarsAfter } };
}

/** Put a note's tags and pillars back as they were before an accept. */
export function undoAccepted(id: string, a: Accepted, updateBlock: UpdateBlock) {
  const updates: Partial<ArchiveBlock> = {};
  if (a.before.tags.join("\n") !== a.after.tags.join("\n")) updates.tags = a.before.tags;
  if (a.before.pillars.join("\n") !== a.after.pillars.join("\n")) updates.pillars = a.before.pillars;
  if (Object.keys(updates).length) void updateBlock(id, updates);
}

/** The text the chips held for a note were made from, roughly: an edit after them asks again. */
const madeFrom = new Map<string, string>();
const fingerprint = (c: string) => `${c.length}:${c.slice(0, 160)}:${c.slice(-160)}`;

/**
 * The suggestion chips of one note shown in the peek or the reader: asked for
 * after the note has been on screen a moment (stepping through notes does not
 * ask for each), only for a note with no tag or no type, and kept for the
 * session. Esc or ✕ hides them without recording anything.
 */
export function useNoteSuggestions(block: ArchiveBlock | undefined, updateBlock: UpdateBlock, { dwellMs = 450 }: { dwellMs?: number } = {}) {
  const api = useTagSuggestions();
  const id = block?.id;
  // "✨ Suggest" asks for a note that has its tags and type too.
  const [forced, setForced] = useState<string | null>(null);
  const wants = !!block && (forced === block.id || wantsSuggestions(block));
  const print = block ? fingerprint(block.content) : "";
  const [state, setState] = useState<{ id: string; chips?: TagSuggestion[]; error?: string; loading?: boolean } | null>(null);
  const [chosenOff, setChosenOff] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  // Accepted or dismissed here: not asked again while this view lives.
  const done = useRef(new Set<string>());
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    setChosenOff(new Set());
    if (!id || !wants || done.current.has(id)) {
      setState(null);
      return;
    }
    const held = apiRef.current.peek(id);
    const from = madeFrom.get(id);
    if (held && (from === undefined || from === print)) {
      madeFrom.set(id, print);
      setState({ id, chips: held });
      return;
    }
    // The note was edited since its chips were made: they may no longer fit.
    if (held) apiRef.current.forget(id);
    setState({ id, loading: true });
    let live = true;
    const timer = window.setTimeout(() => {
      apiRef.current.suggest([id]).then(
        (map) => {
          madeFrom.set(id, print);
          if (live) setState({ id, chips: map.get(id) ?? [] });
        },
        (e: unknown) => live && setState({ id, error: e instanceof Error ? e.message : String(e) }),
      );
    }, forced === id ? 0 : dwellMs);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [id, wants, dwellMs, forced, print]);

  const chips = useMemo(() => (block && state?.id === block.id ? freshChips(block, state.chips) : undefined), [block, state]);
  const chosen = useMemo(() => new Set((chips ?? []).map((c) => c.tag).filter((t) => !chosenOff.has(t))), [chips, chosenOff]);
  const visible = !!block && state?.id === block.id && (state.loading || !!state.error || (chips?.length ?? 0) > 0);

  const toggle = useCallback((tag: string) => {
    setChosenOff((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  /** Ask now, whatever tags the note has. */
  const ask = useCallback(() => {
    if (!id) return;
    done.current.delete(id);
    setForced(id);
  }, [id]);

  const dismiss = useCallback(() => {
    if (!id) return;
    done.current.add(id);
    apiRef.current.forget(id);
    setState(null);
  }, [id]);

  const accept = useCallback(async () => {
    if (!block || !chips || saving) return;
    const picked = chips.filter((c) => chosen.has(c.tag));
    if (picked.length === 0) return;
    setSaving(true);
    try {
      const res = await acceptChips(apiRef.current, block, picked, updateBlock);
      if (!res) return;
      done.current.add(block.id);
      setState(null);
      const n = picked.length;
      toast.success(n === 1 ? "Suggestion accepted" : `${n} suggestions accepted`, {
        action: { label: "Undo", onClick: () => undoAccepted(block.id, res, updateBlock) },
      });
    } finally {
      setSaving(false);
    }
  }, [block, chips, chosen, saving, updateBlock]);

  return {
    visible,
    chips,
    chosen,
    loading: !!state?.loading,
    error: state?.error ?? null,
    status: api.status,
    saving,
    toggle,
    accept,
    dismiss,
    ask,
  };
}
