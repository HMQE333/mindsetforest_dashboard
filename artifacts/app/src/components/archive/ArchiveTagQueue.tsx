import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, Check, Loader2, X } from "lucide-react";
import type { Pillar } from "@/hooks/usePillars";
import { SUGGEST_BATCH, useTagSuggestions, type TagSuggestion } from "@/hooks/useTagSuggestions";
import type { ArchiveBlock } from "@/lib/archive-data";
import { isShortcutKey, keepFocus } from "./keyboard";
import { CARD, NoteText, useNoteText } from "./NoteText";
import { noteTags } from "./archive-index";
import { acceptChips, freshChips } from "./note-suggestions";
import { noteHeading } from "./reader-model";
import { NoteTagChips, SuggestionChips, aiNote } from "./TagChips";

type UpdateBlock = (id: string, updates: Partial<ArchiveBlock>) => Promise<unknown>;

/** Characters of a note the queue renders: enough to tell what it is. */
const QUEUE_FIRST_CHARS = 8_000;
/** Ask for the next batch when this few notes with chips are left ahead. */
const PREFETCH_AHEAD = 6;

export interface ArchiveTagQueueProps {
  /** The notes to go through, in order (untagged, newest first), as they were when the queue opened. */
  ids: string[];
  /** Every note as it is now. */
  blocks: ArchiveBlock[];
  pillarMap: ReadonlyMap<string, Pillar>;
  onClose: () => void;
  onUpdate: UpdateBlock;
}

/**
 * "Tag untagged": one note at a time with its suggested chips. Enter accepts
 * the chosen chips (all, until a digit turns one off) and moves on, 1-9
 * toggle a chip, → skips, ← goes back, Esc leaves. Enter never moves past a
 * note on its own: while its chips load, or with none chosen, only → or Skip
 * does. The note on screen is asked for alone first (its chips come in one
 * note's time), then the notes ahead in batches of up to 20, one at a time.
 */
export default function ArchiveTagQueue({ ids, blocks, pillarMap, onClose, onUpdate }: ArchiveTagQueueProps) {
  const api = useTagSuggestions();
  const apiRef = useRef(api);
  apiRef.current = api;
  const live = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);
  const order = useMemo(() => ids.filter((id) => live.has(id)), [ids, live]);

  const [at, setAt] = useState(0);
  const [chips, setChips] = useState<ReadonlyMap<string, TagSuggestion[]>>(new Map());
  /** Notes whose batch failed, with the function's message. */
  const [failed, setFailed] = useState<ReadonlyMap<string, string>>(new Map());
  const [off, setOff] = useState<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const asked = useRef(0);
  /** A batch is on its way; the next one waits for it (and the effect runs again when it lands). */
  const asking = useRef(false);
  const [landed, setLanded] = useState(0);

  const currentId = order[Math.min(at, order.length - 1)];
  const block = currentId ? live.get(currentId) : undefined;
  const finished = at >= order.length;

  // The first note alone, then batches of up to 20, one at a time, ahead of where he is.
  useEffect(() => {
    if (asking.current || asked.current >= order.length || asked.current - at > PREFETCH_AHEAD) return;
    const batch = order.slice(asked.current, asked.current + (asked.current === 0 ? 1 : SUGGEST_BATCH));
    asked.current += batch.length;
    asking.current = true;
    apiRef.current
      .suggest(batch)
      .then(
        (map) =>
          setChips((prev) => {
            const next = new Map(prev);
            for (const [id, list] of map) next.set(id, list);
            return next;
          }),
        (e: unknown) =>
          setFailed((prev) => {
            const next = new Map(prev);
            for (const id of batch) next.set(id, e instanceof Error ? e.message : String(e));
            return next;
          }),
      )
      .finally(() => {
        asking.current = false;
        setLanded((n) => n + 1);
      });
  }, [at, order, landed]);

  const shown = block ? freshChips(block, chips.get(block.id)) : undefined;
  const chosen = useMemo(() => {
    const o = (currentId && off.get(currentId)) || new Set<string>();
    return new Set((shown ?? []).map((c) => c.tag).filter((t) => !o.has(t)));
  }, [shown, off, currentId]);

  const toggle = useCallback(
    (tag: string) => {
      if (!currentId) return;
      setOff((prev) => {
        const next = new Map(prev);
        const set = new Set(prev.get(currentId) ?? []);
        if (set.has(tag)) set.delete(tag);
        else set.add(tag);
        next.set(currentId, set);
        return next;
      });
    },
    [currentId],
  );

  const step = useCallback((d: 1 | -1) => setAt((i) => Math.max(0, Math.min(order.length, i + d))), [order.length]);

  const accept = useCallback(async () => {
    // Still loading, or nothing chosen: Enter does nothing (→ or Skip moves on), so no note is passed over unseen.
    if (!block || saving || !shown) return;
    const picked = shown.filter((c) => chosen.has(c.tag));
    if (picked.length === 0) return;
    setSaving(true);
    try {
      const res = await acceptChips(apiRef.current, block, picked, onUpdate);
      if (res) {
        setDone((prev) => new Set(prev).add(block.id));
        step(1);
      }
    } finally {
      setSaving(false);
    }
  }, [block, saving, shown, chosen, onUpdate, step]);

  const keys = useRef({ accept, toggle, step, shown });
  keys.current = { accept, toggle, step, shown };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isShortcutKey(e)) return;
      const k = keys.current;
      if (e.key === "Enter") {
        // A focused button's own Enter presses it.
        if ((e.target as HTMLElement | null)?.closest?.("button, a")) return;
        e.preventDefault();
        void k.accept();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        k.step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        k.step(-1);
      } else if (/^[1-9]$/.test(e.key)) {
        const chip = k.shown?.[Number(e.key) - 1];
        if (chip) {
          e.preventDefault();
          k.toggle(chip.tag);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const headingTitle = useMemo(() => (block ? noteHeading(block.title, block.content).title : ""), [block]);
  const error = block ? (failed.get(block.id) ?? null) : null;
  const loading = !!block && !chips.has(block.id) && !error;

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background animate-in fade-in-0 duration-150 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus?.({ preventScroll: true });
          }}
          className="fixed inset-0 z-50 overflow-y-auto overscroll-contain outline-none"
          tabIndex={-1}
          lang="en"
        >
          <div className="sticky top-0 z-10 border-b border-white/5 bg-background/95">
            <div className="mx-auto flex w-full max-w-[44rem] items-center gap-2 px-4 py-2">
              <DialogPrimitive.Title className="shrink-0 text-sm font-bold">Tag untagged</DialogPrimitive.Title>
              <span className="min-w-0 flex-1 truncate text-xs tabular-nums text-muted-foreground">
                {finished ? order.length : at + 1} / {order.length}
                {done.size > 0 && ` · ${done.size} tagged`}
              </span>
              <span className="hidden shrink-0 text-[11px] text-muted-foreground lg:inline">Enter accept · 1-9 toggle · → skip · ← back · Esc out</span>
              {/* Always one tap away (a phone has no arrow keys), not below a long note. */}
              {!finished && block && (
                <nav className="flex shrink-0 items-center gap-1" aria-label="Previous and next note">
                  <button
                    type="button"
                    onMouseDown={keepFocus}
                    onClick={() => step(-1)}
                    disabled={at === 0}
                    className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-30"
                    aria-label="Back (←)"
                    title="Back (←)"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onMouseDown={keepFocus}
                    onClick={() => step(1)}
                    className="inline-flex h-9 items-center gap-1 rounded-lg bg-muted/40 px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    title="Skip (→)"
                  >
                    Skip <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                </nav>
              )}
              <DialogPrimitive.Close className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground" aria-label="Close (Esc)">
                <X className="h-4 w-4" aria-hidden />
              </DialogPrimitive.Close>
            </div>
            {/* Said when the note changes, as the reader says it. */}
            <p className="sr-only" aria-live="polite">
              {finished || !block ? "That was the last one." : `Note ${at + 1} of ${order.length}: ${headingTitle}`}
            </p>
            <div className="h-0.5 bg-white/5">
              <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${order.length ? (Math.min(at, order.length) / order.length) * 100 : 100}%` }} />
            </div>
          </div>

          <div className="mx-auto w-full max-w-[44rem] space-y-4 px-4 pb-16 pt-4">
            {finished || !block ? (
              <div className={`${CARD} space-y-3 p-6 text-center`}>
                <p className="text-2xl" aria-hidden>
                  🏷️
                </p>
                <p className="font-semibold">{order.length === 0 ? "Every note has a tag." : "That was the last one."}</p>
                <p className="text-sm text-muted-foreground">
                  {done.size} of {order.length} note{order.length === 1 ? "" : "s"} tagged in this round.
                </p>
                <div className="flex justify-center gap-2">
                  {order.length > 0 && (
                    <button type="button" onClick={() => step(-1)} className="rounded-xl bg-muted/50 px-4 py-2 text-sm font-semibold hover:bg-muted">
                      ← Back
                    </button>
                  )}
                  <button type="button" onClick={onClose} className="gradient-purple rounded-xl px-4 py-2 text-sm font-bold text-primary-foreground">
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <QueueNote
                key={block.id}
                block={block}
                tagged={done.has(block.id)}
                chips={shown}
                chosen={chosen}
                onToggle={toggle}
                onAccept={() => void accept()}
                pillarMap={pillarMap}
                loading={loading}
                error={error}
                note={aiNote(api.status?.ai, api.status?.aiError)}
                saving={saving}
              />
            )}

          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function QueueNote({
  block,
  tagged,
  chips,
  chosen,
  onToggle,
  onAccept,
  pillarMap,
  loading,
  error,
  note,
  saving,
}: {
  block: ArchiveBlock;
  tagged: boolean;
  chips: TagSuggestion[] | undefined;
  chosen: ReadonlySet<string>;
  onToggle: (tag: string) => void;
  onAccept: () => void;
  pillarMap: ReadonlyMap<string, Pillar>;
  loading: boolean;
  error: string | null;
  note: string | null;
  saving: boolean;
}) {
  const heading = useMemo(() => noteHeading(block.title, block.content), [block.title, block.content]);
  const text = useNoteText(heading.skip ? block.content.slice(heading.skip) : block.content, QUEUE_FIRST_CHARS);
  const tags = noteTags(block).shown;
  return (
    <article className="space-y-3 animate-in fade-in-0 duration-150 motion-reduce:animate-none" lang={text.lang}>
      <header className={`${CARD} space-y-3 p-4 sm:p-5`}>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" lang="en">
          <time dateTime={block.created_at}>{new Date(block.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</time>
          {tagged && (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <Check className="h-3 w-3" aria-hidden /> Tagged
            </span>
          )}
        </p>
        {heading.shown && <h2 className="break-words text-lg font-bold leading-snug [overflow-wrap:anywhere]">{heading.title}</h2>}
        <NoteTagChips tags={tags} size="md" />
        {loading && !chips ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Looking at your similar notes…
          </p>
        ) : chips && chips.length === 0 ? (
          <p className="text-xs text-muted-foreground">No suggestion for this one. → skips it.</p>
        ) : (
          <SuggestionChips
            chips={chips}
            chosen={chosen}
            onToggle={onToggle}
            onAccept={onAccept}
            pillars={pillarMap}
            loading={loading}
            error={error}
            note={note}
            numbered
            saving={saving}
          />
        )}
      </header>
      <NoteText model={text} />
    </article>
  );
}
