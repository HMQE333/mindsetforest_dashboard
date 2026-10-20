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
 * Notes whose chips he accepted or hid (✕ / Esc) in this session, with the
 * text they were for: not offered again when he steps away and back (the peek
 * mounts afresh per note), until the note is edited or he presses ✨ Suggest.
 */
const settled = new Map<string, string>();

/**
 * The suggestion chips of one note shown in the peek or the reader: asked for
 * after the note has been on screen a moment (stepping through notes does not
 * ask for each), only for a note with no tag or no type, and kept for the
 * session. Esc or ✕ hides them without recording anything, for the session.
 */
export function useNoteSuggestions(block: ArchiveBlock | undefined, updateBlock: UpdateBlock, { dwellMs = 450 }: { dwellMs?: number } = {}) {
  const api = useTagSuggestions();
  const id = block?.id;
  // "✨ Suggest" asks for a note that has its tags and type too; each press asks again
  // (after a dismiss or a failed answer as well), hence the count.
  const [forced, setForced] = useState<{ id: string; n: number } | null>(null);
  const forcedHere = !!block && forced?.id === block.id;
  const forcedN = forcedHere ? forced!.n : 0;
  const wants = !!block && (forcedHere || wantsSuggestions(block));
  const print = block ? fingerprint(block.content) : "";
  const [state, setState] = useState<{ id: string; chips?: TagSuggestion[]; error?: string; loading?: boolean } | null>(null);
  const [chosenOff, setChosenOff] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const apiRef = useRef(api);
  apiRef.current = api;
  const blockRef = useRef(block);
  blockRef.current = block;
  const nothingNew = (list: readonly TagSuggestion[]) => {
    const b = blockRef.current;
    return !b || (freshChips(b, list)?.length ?? 0) === 0;
  };

  useEffect(() => {
    setChosenOff(new Set());
    if (!id || !wants || (forcedN === 0 && settled.get(id) === print)) {
      setState(null);
      return;
    }
    const held = apiRef.current.peek(id);
    const from = madeFrom.get(id);
    // A press on ✨ Suggest asks again when what is held has nothing left to offer.
    if (held && (from === undefined || from === print) && !(forcedN > 0 && nothingNew(held))) {
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
          const list = map.get(id) ?? [];
          if (!live) return;
          setState({ id, chips: list });
          // Asked for by a press: say so when the answer has nothing the note does not have.
          if (forcedN > 0 && nothingNew(list)) toast.info("Nothing new to suggest for this note");
        },
        (e: unknown) => live && setState({ id, error: e instanceof Error ? e.message : String(e) }),
      );
    }, forcedN > 0 ? 0 : dwellMs);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // nothingNew reads the note through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, wants, dwellMs, forcedN, print]);

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
    settled.delete(id);
    setForced((f) => ({ id, n: f?.id === id ? f.n + 1 : 1 }));
  }, [id]);

  // Hidden for the session; the chips stay held, so a press on ✨ Suggest shows them without asking again.
  const dismiss = useCallback(() => {
    if (!id) return;
    settled.set(id, print);
    setState(null);
  }, [id, print]);

  const accept = useCallback(async () => {
    if (!block || !chips || saving) return;
    const picked = chips.filter((c) => chosen.has(c.tag));
    if (picked.length === 0) return;
    setSaving(true);
    try {
      const res = await acceptChips(apiRef.current, block, picked, updateBlock);
      if (!res) return;
      settled.set(block.id, fingerprint(block.content));
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
