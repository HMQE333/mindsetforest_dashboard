import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type TouchEvent as ReactTouchEvent } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, FolderInput, Pencil, Pin, Sparkles, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { usePillars, type Pillar } from "@/hooks/usePillars";
import type { ArchiveBlock } from "@/lib/archive-data";
import type { TypeTag } from "@/lib/archive-tags";
import { copyText } from "@/lib/hand-off";
import { safeUrl } from "@/lib/safe-url";
import { isShortcutKey } from "./keyboard";
import { neighbourAfterRemoval, noteHeading, readingLabel, swipeStep } from "./reader-model";
import { CARD, NoteText, useNoteText } from "./NoteText";
import { DeleteConfirmButton, useArmedDelete } from "./DeleteConfirm";
import FolderPicker from "./FolderPicker";
import { ArchiveAIMenu, useArchiveAI } from "./ArchiveAIProvider";
import { noteTags } from "./archive-index";
import { useNoteSuggestions } from "./note-suggestions";
import { deleteWithUndo, usePendingDeletes } from "./pending-deletes";
import { usePillarToggle } from "./pillar-toggle";
import { NoteTagChips, PillarRow, SuggestionChips, aiNote } from "./TagChips";

export interface ArchiveReaderProps {
  /** The list the note was opened from, in the order shown (its search, filters and sort applied). */
  snapshot: ArchiveBlock[];
  initialId: string;
  /** Every note as it is now: an edit or a pin shows at once, and a deleted note drops out of the order. */
  blocks: ArchiveBlock[];
  /** The list's name, for the way back ("Library"). */
  from: string;
  /** Closing; gets the note the reader ended on (the list can show it). */
  onClose: (lastId?: string) => void;
  onEdit: (block: ArchiveBlock) => void;
  onUpdate: (id: string, updates: Partial<ArchiveBlock>) => Promise<unknown>;
  /** Sent when the delete's Undo toast ends (pending-deletes.ts). */
  onDelete: (id: string) => Promise<unknown>;
  /** A press on one of the note's tags: the list filters by it (the reader closes). */
  onFilterTag?: (tag: string) => void;
  onFilterType?: (type: TypeTag) => void;
  /** The folder the list is showing: Folder… → Move takes the note out of it. */
  viewedFolder?: string | null;
}

const titleOf = (b: ArchiveBlock) => noteHeading(b.title, b.content).title;

/** Readers open now; while any is, the assistant (drawn above every layer, but out of reach under a modal) is hidden (index.css). */
let openReaders = 0;

/** Whether a touch starts inside something that scrolls sideways (a code block, a table, the contents row). */
function inSideScroller(el: HTMLElement | null, stop: HTMLElement): boolean {
  for (let node = el; node && node !== stop; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth + 1) {
      const x = getComputedStyle(node).overflowX;
      if (x === "auto" || x === "scroll") return true;
    }
  }
  return false;
}

/**
 * A note read in full, over the whole page, with the list it came from one
 * key or swipe away: ← / → (or the arrows, or a swipe on a phone) step through
 * the list in the order shown, Esc or Back closes. The text is Markdown,
 * rendered as Wykłady renders a lecture; a very long note opens with its start
 * and renders the rest a part at a time.
 */
export default function ArchiveReader({ snapshot, initialId, blocks, from, onClose, onEdit, onUpdate, onDelete, onFilterTag, onFilterType, viewedFolder = null }: ArchiveReaderProps) {
  const pillarList = usePillars();
  const pillars = useMemo(() => new Map(pillarList.map((p) => [p.id, p])), [pillarList]);
  const ai = useArchiveAI();

  const order = useMemo(() => snapshot.map((b) => b.id), [snapshot]);
  const live = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);
  // A note deleted with its Undo still showing is gone from the order (Undo brings it back).
  const pending = usePendingDeletes();
  // A listed note the live list did not hold when the reader opened (a smart-search hit not loaded
  // yet) shows as listed. One the live list did hold and no longer does was deleted: it drops out.
  const [listedOnly] = useState(() => {
    const held = new Set(blocks.map((b) => b.id));
    return new Map(snapshot.filter((b) => !held.has(b.id)).map((b) => [b.id, b]));
  });
  const resolve = useCallback((id: string) => (pending.has(id) ? undefined : live.get(id) ?? listedOnly.get(id)), [live, listedOnly, pending]);
  const alive = useMemo(() => order.filter((id) => resolve(id) !== undefined), [order, resolve]);

  const [currentId, setCurrentId] = useState(initialId);
  const [dir, setDir] = useState<-1 | 0 | 1>(0);
  const block = resolve(currentId);
  const at = alive.indexOf(currentId);
  const total = alive.length;
  const prevId = at > 0 ? alive[at - 1] : null;
  const nextId = at >= 0 && at < total - 1 ? alive[at + 1] : null;

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const currentRef = useRef(currentId);
  currentRef.current = currentId;
  const close = useCallback(() => closeRef.current(currentRef.current), []);
  const stepsRef = useRef({ prevId, nextId });
  stepsRef.current = { prevId, nextId };

  // The open note was deleted (here, or in the editor): its neighbour takes its place, before paint.
  useLayoutEffect(() => {
    if (block) return;
    const next = neighbourAfterRemoval(order, currentId, (id) => resolve(id) !== undefined);
    if (next) {
      setDir(0);
      setCurrentId(next);
    } else close();
  }, [block, order, currentId, resolve, close]);

  // Each note opens at its top; one already read in this sitting opens where it was left.
  const scroller = useRef<HTMLDivElement>(null);
  const scrolled = useRef(new Map<string, number>());
  const go = useCallback((step: 1 | -1) => {
    const id = step === 1 ? stepsRef.current.nextId : stepsRef.current.prevId;
    if (!id) return;
    scrolled.current.set(currentRef.current, scroller.current?.scrollTop ?? 0);
    setDir(step);
    setCurrentId(id);
  }, []);
  const opened = useRef(false);
  useLayoutEffect(() => {
    // Not on open: the page starts at its top, and setting it would only force an early layout.
    if (!opened.current) {
      opened.current = true;
      return;
    }
    if (scroller.current) scroller.current.scrollTop = scrolled.current.get(currentId) ?? 0;
  }, [currentId]);

  // Said to a screen reader after a step (the title is read on open).
  const [announce, setAnnounce] = useState("");
  const blockTitle = block ? titleOf(block) : "";
  useEffect(() => {
    if (dir !== 0 && blockTitle && at >= 0) setAnnounce(`Note ${at + 1} of ${total}: ${blockTitle}`);
    // Only on a step to another note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // The assistant's robot would float over the text, unusable (a modal makes the page behind it
  // inert) and catching nothing but taps meant for the note: it steps aside while the reader is open.
  useEffect(() => {
    openReaders++;
    document.body.dataset.archiveReaderOpen = "";
    return () => {
      if (--openReaders === 0) delete document.body.dataset.archiveReaderOpen;
    };
  }, []);

  // The note's suggested chips (no tag or no type), and its pillars, one press each.
  const sugg = useNoteSuggestions(block, onUpdate);
  const pillarToggle = usePillarToggle(onUpdate);
  // Delete: "Delete?" first (a second press, Enter or Delete again deletes), then the Undo toast.
  const del = useArmedDelete();
  useEffect(() => del.disarm(), [currentId, del.disarm]);
  const remove = useCallback(() => {
    const b = resolve(currentRef.current);
    del.disarm();
    if (!b) return;
    // The note drops out of the order at once and its neighbour opens (or the reader closes).
    deleteWithUndo([b.id], onDelete, { label: titleOf(b) });
  }, [resolve, onDelete, del]);

  // ← / →, Delete, and Enter for the suggestions, unless the editor or a menu is open over the
  // reader, or a field has the keys.
  const keys = useRef({ go, remove, del, sugg });
  keys.current = { go, remove, del, sugg };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey || !isShortcutKey(e)) return;
      const open = document.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
      if (open[open.length - 1] !== scroller.current) return;
      const k = keys.current;
      const onControl = !!(e.target as HTMLElement | null)?.closest?.("button, a, [role='button']");
      if (k.del.armed && (e.key === "Enter" || e.key === "Delete")) {
        e.preventDefault();
        k.remove();
      } else if (e.key === "Delete") {
        e.preventDefault();
        k.remove();
      } else if (e.key === "Enter" && !onControl && k.sugg.visible && k.sugg.chips?.length) {
        e.preventDefault();
        void k.sugg.accept();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        k.go(e.key === "ArrowRight" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Phones: Back closes the reader instead of leaving the app. One history entry with the same
  // URL, added just after the reader opens and taken off again when it closes another way.
  useEffect(() => {
    const token = `${Date.now()}-${Math.random()}`;
    let pushed = false;
    const timer = window.setTimeout(() => {
      try {
        window.history.pushState({ ...(window.history.state ?? {}), mfReader: token }, "");
        pushed = true;
      } catch {
        // A sandboxed frame: Back leaves as before.
      }
    }, 0);
    const onPop = () => {
      if (!pushed || window.history.state?.mfReader === token) return;
      // Something open over the reader (the editor, the delete confirmation): Back closes that,
      // as Esc does, and the reader keeps its own history entry for the next Back.
      const open = document.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
      const top = open[open.length - 1];
      if (top && scroller.current && top !== scroller.current) {
        try {
          window.history.pushState({ ...(window.history.state ?? {}), mfReader: token }, "");
        } catch {
          pushed = false;
        }
        top.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
        return;
      }
      pushed = false;
      close();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", onPop);
      if (pushed && window.history.state?.mfReader === token) window.history.back();
    };
  }, [close]);

  // Swipe left for the next note, right for the previous one.
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    const p = e.touches[0];
    const edge = 24; // the browser's own back / forward swipe starts at the screen's edge
    const target = e.target as HTMLElement;
    const inside = e.currentTarget.contains(target); // not a confirmation portalled out of the reader
    const zoomed = (window.visualViewport?.scale ?? 1) > 1.01; // a one-finger pan of a pinch-zoomed page
    touch.current =
      inside && !zoomed && e.touches.length === 1 && p && p.clientX > edge && p.clientX < window.innerWidth - edge && !inSideScroller(target, e.currentTarget)
        ? { x: p.clientX, y: p.clientY, t: performance.now() }
        : null;
  };
  const onTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 1) touch.current = null; // pinch zoom
  };
  const onTouchEnd = (e: ReactTouchEvent<HTMLDivElement>) => {
    const start = touch.current;
    touch.current = null;
    const p = e.changedTouches[0];
    if (!start || !p || window.getSelection()?.toString()) return;
    const step = swipeStep({ dx: p.clientX - start.x, dy: p.clientY - start.y, ms: performance.now() - start.t });
    if (step) go(step);
  };

  // Pin shows its new state at once; a failed write puts it back.
  const [pinOverride, setPinOverride] = useState<{ id: string; pinned: boolean } | null>(null);
  const pinned = pinOverride?.id === currentId ? pinOverride.pinned : !!block?.is_pinned;
  const togglePin = async () => {
    if (!block) return;
    const id = block.id;
    const next = !pinned;
    setPinOverride({ id, pinned: next });
    await onUpdate(id, { is_pinned: next });
    setPinOverride((o) => (o?.id === id ? null : o));
  };

  const [copied, setCopied] = useState<string | null>(null);
  const copyTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  const copy = async () => {
    if (!block) return;
    const id = block.id;
    if (!(await copyText(block.content))) {
      toast.error("Couldn't copy. Select the text and copy it instead.");
      return;
    }
    setCopied(id);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(null), 1600);
  };

  // Focus goes back to the open note's card in the list (it may be another one than the card
  // that opened the reader), else to whatever had it before.
  const [returnTo] = useState(() => (typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null));
  const onCloseAutoFocus = (e: Event) => {
    e.preventDefault();
    const card = document.querySelector<HTMLElement>(`[data-note-id="${CSS.escape(currentRef.current)}"]`);
    const el = card ?? (returnTo?.isConnected ? returnTo : null);
    if (!el) return;
    el.focus({ preventScroll: true });
    if (card) card.scrollIntoView({ block: "nearest" });
  };

  const prev = prevId ? resolve(prevId) : undefined;
  const next = nextId ? resolve(nextId) : undefined;
  const stepping = total > 1 && at >= 0;

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background animate-in fade-in-0 duration-150 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          ref={scroller}
          aria-describedby={undefined}
          // Radix leaves the app's root readable when it holds a live region (the toasts): say the page behind is out of reach.
          aria-modal="true"
          data-archive-reader=""
          onOpenAutoFocus={(e) => {
            // The page itself takes focus, so the arrows, Space and Page Down read on at once.
            e.preventDefault();
            scroller.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={onCloseAutoFocus}
          // Esc first takes back a "Delete?", then closes (suggestions not accepted are dropped, recording nothing).
          onEscapeKeyDown={(e) => {
            if (del.armed) {
              e.preventDefault();
              del.disarm();
            }
          }}
          // The reader covers the page: anything "outside" floats over it (a toast), and a press there is not a close.
          onInteractOutside={(e) => e.preventDefault()}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={() => (touch.current = null)}
          className="fixed inset-0 z-50 overflow-y-auto overscroll-contain outline-none animate-in fade-in-0 duration-150 motion-reduce:animate-none"
        >
          <div className="sticky top-0 z-10 mb-4 border-b border-white/5 bg-background/95">
            <div className="mx-auto flex w-full max-w-[44rem] items-center gap-1 px-4 py-2 sm:gap-2">
              <button
                type="button"
                onClick={close}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:h-9"
                aria-label={`Close the note, back to ${from}`}
                title={`Back to ${from} (Esc)`}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{from}</span>
              </button>
              {stepping && (
                <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground" aria-hidden="true">
                  {at + 1} / {total}
                </span>
              )}
              <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
                <ToolButton label="Edit" text="Edit" icon={Pencil} onClick={() => block && onEdit(block)} />
                <ToolButton
                  label={copied === currentId ? "Copied" : "Copy the text"}
                  text={copied === currentId ? "Copied" : "Copy"}
                  icon={copied === currentId ? Check : Copy}
                  onClick={() => void copy()}
                />
                {/* One name; aria-pressed says whether it is on ("Unpin, pressed" left it unclear what a press does). */}
                <ToolButton label="Pin to the top of the Library" icon={Pin} pressed={pinned} onClick={() => void togglePin()} />
                {block && (
                  <FolderPicker notes={[block]} blocks={blocks} viewed={viewedFolder} updateBlock={onUpdate}>
                    <ToolTrigger label="Put in a folder" text="Folder…" icon={FolderInput} />
                  </FolderPicker>
                )}
                {/* The Archive's AI actions (Shorten, Expand, Clean, own prompt), each through its preview. */}
                {block && ai && (
                  <ArchiveAIMenu notes={[block]}>
                    <ToolTrigger label="AI actions: Shorten, Expand, Clean, own prompt" text="AI…" icon={Sparkles} onPointerEnter={ai.preload} />
                  </ArchiveAIMenu>
                )}
                <DeleteConfirmButton variant="tool" armed={del.armed} onArm={() => del.arm()} onDisarm={del.disarm} onConfirm={remove} />
                {stepping && (
                  <>
                    <span className="mx-0.5 h-5 w-px bg-white/10 sm:mx-1.5 lg:hidden" aria-hidden="true" />
                    <span className="flex items-center gap-1 lg:hidden">
                      <ToolButton label="Previous note (←)" icon={ChevronLeft} disabled={!prevId} onClick={() => go(-1)} />
                      <ToolButton label="Next note (→)" icon={ChevronRight} disabled={!nextId} onClick={() => go(1)} />
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 44rem: about 80 characters a line in the note's box. */}
          <div className="mx-auto w-full max-w-[44rem] px-4 pb-16">

            {block && (
              <NoteView
                key={block.id}
                block={block}
                dir={dir}
                pinned={pinned}
                pillarList={pillarList}
                pillars={pillars}
                pillarsOn={pillarToggle.pillarsOf(block)}
                onTogglePillar={(id) => void pillarToggle.toggle(block, id)}
                sugg={sugg}
                onFilterTag={onFilterTag}
                onFilterType={onFilterType}
              />
            )}

            {stepping && (
              <nav aria-label="Previous and next note" className="mt-4 grid grid-cols-2 gap-3">
                {prev ? <NeighbourCard block={prev} step={-1} onClick={() => go(-1)} /> : <span />}
                {next ? (
                  <NeighbourCard block={next} step={1} onClick={() => go(1)} />
                ) : (
                  <p className="self-center text-right text-xs text-muted-foreground">End of the list</p>
                )}
              </nav>
            )}
          </div>

          {stepping && (
            <>
              <SideArrow side="left" disabled={!prevId} onClick={() => go(-1)} />
              <SideArrow side="right" disabled={!nextId} onClick={() => go(1)} />
            </>
          )}

          <p className="sr-only" aria-live="polite">
            {announce}
          </p>

        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// -- the note ------------------------------------------------------------------------------

const DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function NoteView({
  block,
  dir,
  pinned,
  pillarList,
  pillars,
  pillarsOn,
  onTogglePillar,
  sugg,
  onFilterTag,
  onFilterType,
}: {
  block: ArchiveBlock;
  dir: -1 | 0 | 1;
  pinned: boolean;
  pillarList: readonly Pillar[];
  pillars: ReadonlyMap<string, Pillar>;
  pillarsOn: readonly string[];
  onTogglePillar: (id: string) => void;
  sugg: ReturnType<typeof useNoteSuggestions>;
  onFilterTag?: (tag: string) => void;
  onFilterType?: (type: TypeTag) => void;
}) {
  const heading = useMemo(() => noteHeading(block.title, block.content), [block.title, block.content]);
  // A first-line heading that became the title is left out of the body.
  const content = useMemo(() => (heading.skip ? block.content.slice(heading.skip) : block.content), [block.content, heading.skip]);
  const text = useNoteText(content);
  const tags = noteTags(block).shown;
  const source = safeUrl(block.source_url);
  const label = readingLabel(block.content.length);
  const toc = text.whole !== null ? text.layout.toc : [];
  const shortToc = (s: string) => (s.length > 34 ? `${s.slice(0, 33)}…` : s);
  const slide = dir === 1 ? "slide-in-from-right-3" : dir === -1 ? "slide-in-from-left-3" : "";

  return (
    <article className={`space-y-4 animate-in fade-in-0 duration-200 motion-reduce:animate-none ${slide}`} lang={text.lang}>
      <header className={`${CARD} space-y-3 p-4 sm:p-5`}>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" lang="en">
          <time dateTime={block.created_at}>{new Date(block.created_at).toLocaleString("en-GB", DATE)}</time>
          {label && <span>· {label}</span>}
          {pinned && <span>· 📌 Pinned</span>}
        </p>
        {/* An auto-title is the start of the text, which the body shows: then only a screen reader hears it. */}
        <DialogPrimitive.Title className={heading.shown ? "break-words text-xl font-bold leading-tight text-foreground [overflow-wrap:anywhere] sm:text-2xl" : "sr-only"}>
          {heading.title}
        </DialogPrimitive.Title>
        {tags.length > 0 && <NoteTagChips tags={tags} onTag={onFilterTag} onType={onFilterType} size="md" focusable />}
        {sugg.visible && (
          <SuggestionChips
            chips={sugg.chips}
            chosen={sugg.chosen}
            onToggle={sugg.toggle}
            onAccept={() => void sugg.accept()}
            onDismiss={sugg.dismiss}
            pillars={pillars}
            loading={sugg.loading}
            error={sugg.error}
            note={aiNote(sugg.status?.ai, sugg.status?.aiError)}
            saving={sugg.saving}
          />
        )}
        <PillarRow pillars={pillarList} active={pillarsOn} onToggle={onTogglePillar} />
        {source && (
          <a href={source} target="_blank" rel="noopener noreferrer" className="inline-block max-w-full truncate text-xs text-primary hover:underline" title={source}>
            🔗 {hostOf(source)}
          </a>
        )}
        {toc.length >= 3 && (
          <nav aria-label="Contents" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {toc.map((e) => (
              <a
                key={e.id}
                href={`#${e.id}`}
                onClick={(ev) => {
                  ev.preventDefault();
                  document.getElementById(e.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="shrink-0 whitespace-nowrap rounded-lg border border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                title={e.title}
              >
                {shortToc(e.title)}
              </a>
            ))}
          </nav>
        )}
      </header>

      <NoteText model={text} />
    </article>
  );
}

// -- controls ------------------------------------------------------------------------------

function ToolButton({
  label,
  text,
  icon: Icon,
  onClick,
  pressed,
  danger,
  disabled,
  className = "",
}: {
  label: string;
  text?: string;
  icon: LucideIcon;
  onClick: () => void;
  pressed?: boolean;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  // aria-disabled rather than disabled: a focused button keeps focus at the end of the list.
  const tone = disabled
    ? "cursor-default opacity-35"
    : danger
      ? "text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
      : pressed
        ? "bg-primary/15 text-primary hover:bg-primary/25"
        : "text-muted-foreground hover:bg-white/5 hover:text-foreground";
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      className={`inline-flex h-11 min-w-[2rem] items-center justify-center gap-1.5 rounded-lg px-1.5 text-sm sm:min-w-[2.25rem] sm:px-2 transition-colors active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:h-9 ${tone} ${className}`}
    >
      <Icon className={`h-4 w-4 ${pressed ? "fill-current" : ""}`} aria-hidden />
      {text && <span className="hidden sm:inline">{text}</span>}
    </button>
  );
}

/** A toolbar button a Popover trigger can hand its props and ref to (Folder…). */
const ToolTrigger = forwardRef<HTMLButtonElement, { label: string; text?: string; icon: LucideIcon } & ButtonHTMLAttributes<HTMLButtonElement>>(function ToolTrigger(
  { label, text, icon: Icon, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-11 min-w-[2rem] items-center justify-center gap-1.5 rounded-lg px-1.5 text-sm sm:min-w-[2.25rem] sm:px-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:h-9 ${className ?? ""}`}
      {...rest}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {text && <span className="hidden sm:inline">{text}</span>}
    </button>
  );
});

/** Large arrows beside the text on wide screens. */
function SideArrow({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  const label = side === "left" ? "Previous note (←)" : "Next note (→)";
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-label={label}
      title={label}
      aria-disabled={disabled || undefined}
      className={`fixed top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-muted/30 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary lg:flex ${
        side === "left" ? "left-4 xl:left-8" : "right-4 xl:right-8"
      } ${disabled ? "cursor-default opacity-25" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground active:scale-95"}`}
    >
      <Icon className="h-6 w-6" aria-hidden />
    </button>
  );
}

/** The previous or next note at the end of this one, by title. */
function NeighbourCard({ block, step, onClick }: { block: ArchiveBlock; step: 1 | -1; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${CARD} flex min-w-0 flex-col gap-1 border border-transparent p-3 transition-colors hover:border-primary/30 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:p-4 ${
        step === 1 ? "items-end text-right" : "items-start text-left"
      }`}
    >
      <span className="text-[11px] text-muted-foreground">{step === 1 ? "Next →" : "← Previous"}</span>
      <span className="line-clamp-2 break-words text-sm font-semibold leading-snug text-foreground">{titleOf(block)}</span>
    </button>
  );
}
