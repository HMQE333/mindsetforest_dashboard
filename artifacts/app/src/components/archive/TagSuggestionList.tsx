import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { usePillars } from "@/hooks/usePillars";
import { useArchiveState } from "@/hooks/useArchiveState";
import { useTagSuggestions, type TagSuggestion } from "@/hooks/useTagSuggestions";
import { shortTitle, type ArchiveBlock } from "@/lib/archive-data";
import { SuggestionChips, aiNote } from "./TagChips";
import { acceptChips, freshChips, undoAccepted, type Accepted } from "./note-suggestions";

/**
 * Suggested type, tags (and pillars, when the learn mode offers them) for a
 * few notes at once: the Inbox's strip under the box for what was just saved,
 * and the selection bar's "✨ Suggest". One row of chips per note, every chip
 * chosen until pressed off; Enter or "Accept all" accepts every row, a row's
 * own button accepts that row, Esc dismisses (dismissing records nothing).
 * Accepting records the answer (the chips left out as turned down) and toasts
 * an Undo for every note at once.
 */

export interface TagSuggestionListHandle {
  /** Accept every row's chosen chips. */
  acceptAll: () => void;
  /** Close without recording anything. */
  dismiss: () => void;
  /** Chips are showing (Enter has something to accept). */
  hasChips: () => boolean;
}

interface Props {
  notes: readonly ArchiveBlock[];
  /** Done: accepted or dismissed. */
  onClose: () => void;
  /** "inline" (the Inbox strip) or "dialog" (more room, no own frame). */
  variant?: "inline" | "dialog";
  /** Ask again even when answers are held (✨ Suggest on notes that have tags). */
  fresh?: boolean;
  /** Take the focus when shown, so Enter and Esc reach the list (the bar's dialog). */
  autoFocus?: boolean;
  /**
   * Filled with acceptAll / dismiss, for keys handled outside the list (the
   * Inbox's box). A prop, not `ref`: the list is code-split, and the lazy
   * wrapper does not forward refs.
   */
  handle?: Ref<TagSuggestionListHandle>;
}

/** Rows shown; a bigger save shows these and says how many more there are. */
export const LIST_MAX = 20;

export default function TagSuggestionList({ notes, onClose, variant = "inline", fresh = false, autoFocus = false, handle }: Props) {
  const api = useTagSuggestions();
  const apiRef = useRef(api);
  apiRef.current = api;
  const { updateBlock } = useArchiveState({ live: false });
  const pillars = usePillars();
  const pillarById = useMemo(() => new Map(pillars.map((p) => [p.id, p])), [pillars]);
  const shown = useMemo(() => notes.slice(0, LIST_MAX), [notes]);
  const ids = useMemo(() => shown.map((b) => b.id).join(","), [shown]);
  const [answers, setAnswers] = useState<Map<string, TagSuggestion[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState<Map<string, Set<string>>>(new Map());
  const [done, setDone] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const closed = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    const t = window.setTimeout(() => root.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [autoFocus]);

  useEffect(() => {
    closed.current = false;
    setAnswers(null);
    setError(null);
    setOff(new Map());
    setDone(new Set());
    if (!ids) return;
    let live = true;
    apiRef.current.suggest(ids.split(","), { fresh }).then(
      (map) => live && setAnswers(map),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [ids, fresh]);

  const rows = useMemo(
    () =>
      shown
        .filter((b) => !done.has(b.id))
        .map((b) => {
          const chips = answers ? freshChips(b, answers.get(b.id) ?? []) ?? [] : undefined;
          const skip = off.get(b.id);
          const chosen = new Set((chips ?? []).map((c) => c.tag).filter((t) => !skip?.has(t)));
          return { block: b, chips, chosen };
        }),
    [shown, answers, off, done],
  );
  const withChips = rows.filter((r) => r.chips && r.chips.length > 0);
  const loading = !answers && !error;

  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  }, [onClose]);

  const dismiss = useCallback(() => {
    for (const b of shown) apiRef.current.forget(b.id);
    close();
  }, [shown, close]);

  const accept = useCallback(
    async (which: typeof rows) => {
      const todo = which.filter((r) => r.chips && r.chips.length > 0);
      if (!todo.length || saving) return;
      setSaving(todo.length === 1 ? todo[0].block.id : "all");
      const results: { id: string; res: Accepted }[] = [];
      try {
        for (const r of todo) {
          const picked = r.chips!.filter((c) => r.chosen.has(c.tag));
          // Nothing chosen: the chips are recorded as turned down, nothing is written.
          const res = await acceptChips(apiRef.current, r.block, picked, updateBlock);
          if (res) results.push({ id: r.block.id, res });
        }
      } finally {
        setSaving(null);
      }
      const gone = new Set([...done, ...todo.map((r) => r.block.id)]);
      setDone(gone);
      const changed = results.filter(({ res }) => res.before.tags.join("\n") !== res.after.tags.join("\n") || res.before.pillars.join("\n") !== res.after.pillars.join("\n"));
      if (changed.length) {
        const one = changed.length === 1 ? shown.find((b) => b.id === changed[0].id) : undefined;
        toast.success(one ? "Tagged" : `Tagged ${changed.length} notes`, {
          description: one ? shortTitle(one.title, 60) : undefined,
          className: "[overflow-wrap:anywhere]",
          action: { label: "Undo", onClick: () => changed.forEach(({ id, res }) => undoAccepted(id, res, updateBlock)) },
        });
      }
      if (shown.every((b) => gone.has(b.id) || !(answers?.get(b.id)?.length))) close();
    },
    [saving, updateBlock, done, shown, answers, close],
  );

  useImperativeHandle(handle, () => ({ acceptAll: () => void accept(rows), dismiss, hasChips: () => withChips.length > 0 }), [accept, rows, dismiss, withChips.length]);

  // Nothing to offer: say so a moment, then go.
  useEffect(() => {
    if (!answers || withChips.length > 0) return;
    const t = window.setTimeout(close, 3500);
    return () => window.clearTimeout(t);
  }, [answers, withChips.length, close]);

  const toggle = (id: string, tag: string) =>
    setOff((prev) => {
      const next = new Map(prev);
      const s = new Set(next.get(id) ?? []);
      if (s.has(tag)) s.delete(tag);
      else s.add(tag);
      next.set(id, s);
      return next;
    });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      void accept(rows);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      dismiss();
    } else if (/^[1-9]$/.test(e.key) && withChips.length === 1) {
      const chip = withChips[0].chips![Number(e.key) - 1];
      if (chip) {
        e.preventDefault();
        toggle(withChips[0].block.id, chip.tag);
      }
    }
  };

  const status = aiNote(api.status?.ai, api.status?.aiError);
  const more = notes.length - shown.length;
  const frame = variant === "inline" ? "glass-card border border-primary/20 p-3 sm:p-4" : "";

  return (
    <div ref={root} tabIndex={-1} className={`space-y-2 outline-none ${frame}`} onKeyDown={onKeyDown} role="region" aria-label="Suggested tags" lang="en">
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-xs font-semibold [overflow-wrap:anywhere]">
          {notes.length === 1 ? (
            <>
              Tags for <span className="font-normal text-muted-foreground">{shortTitle(notes[0].title, 60)}</span>
            </>
          ) : (
            `Tags for the ${notes.length} notes`
          )}
        </p>
        {withChips.length > 1 && (
          <button
            type="button"
            onClick={() => void accept(rows)}
            disabled={!!saving}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/20 px-2.5 py-0.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/30 disabled:opacity-40"
          >
            {saving === "all" && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
            Accept all <kbd className="text-[9px] font-normal opacity-70">Enter</kbd>
          </button>
        )}
        {variant === "inline" && (
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            aria-label="Dismiss the suggestions (Esc)"
            title="Dismiss (Esc). Nothing is recorded."
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {loading && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-live="polite">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Looking at your similar notes…
        </p>
      )}
      {error && (
        <p className="text-[11px] text-destructive [overflow-wrap:anywhere]" role="alert">
          No suggestions: {error}
        </p>
      )}
      {answers && withChips.length === 0 && <p className="text-[11px] text-muted-foreground">Nothing to suggest for {notes.length === 1 ? "this note" : "these notes"}.</p>}

      <div className={`space-y-2 ${variant === "dialog" ? "max-h-[55vh] overflow-y-auto pr-1" : "max-h-[40vh] overflow-y-auto pr-1"}`}>
        {withChips.map((r) => (
          <div key={r.block.id} className="min-w-0 space-y-1">
            {notes.length > 1 && <p className="truncate text-[11px] text-muted-foreground" title={r.block.title}>{shortTitle(r.block.title, 70)}</p>}
            <SuggestionChips
              chips={r.chips}
              chosen={r.chosen}
              onToggle={(tag) => toggle(r.block.id, tag)}
              onAccept={() => void accept([r])}
              pillars={pillarById}
              numbered={variant === "dialog" && withChips.length === 1}
              keys={withChips.length === 1 ? "Enter" : null}
              saving={saving === r.block.id || saving === "all"}
              acceptLabel={withChips.length > 1 ? "Accept" : undefined}
            />
          </div>
        ))}
      </div>

      {status && <p className="text-[10px] text-muted-foreground [overflow-wrap:anywhere]">{status}</p>}
      {more > 0 && <p className="text-[10px] text-muted-foreground">And {more} more: tag them from the Library ("Tag untagged").</p>}
      {withChips.length > 0 && (
        <p className="hidden text-[10px] text-muted-foreground/60 sm:block">
          {variant === "inline"
            ? "Click a chip to leave it out · Enter in the empty box accepts · Esc dismisses (nothing is recorded)"
            : `Click a chip to leave it out · Enter accepts${withChips.length === 1 ? " · 1-9 toggle" : ""} · Esc closes`}
        </p>
      )}
    </div>
  );
}
