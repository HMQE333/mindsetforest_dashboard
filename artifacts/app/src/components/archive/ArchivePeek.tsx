import { Suspense, forwardRef, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type RefObject, type TouchEvent as ReactTouchEvent } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  FolderInput,
  Loader2,
  Maximize2,
  Pencil,
  Pin,
  Sprout,
  Star,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Pillar } from "@/hooks/usePillars";
import { AI_ACTIONS, aiNoteTitle, aiTooLong, titleAfterReplace, type NoteAIAction } from "@/lib/archive-ai";
import type { ArchiveBlock } from "@/lib/archive-data";
import type { TypeTag } from "@/lib/archive-tags";
import { CREDENTIAL_MESSAGE, looksLikeCredential } from "@/lib/credential-check";
import { copyText } from "@/lib/hand-off";
import { lazyModule } from "@/lib/lazy-module";
import { fetchNoteAI, useArchiveAI } from "./ArchiveAIProvider";
import type { AIPreviewView } from "./ArchiveAIPreviewModal";
import { DeleteConfirmButton, type Armed } from "./DeleteConfirm";
import FolderPicker from "./FolderPicker";
import { NoteText, useNoteText } from "./NoteText";
import { noteTags } from "./archive-index";
import { useNoteSuggestions } from "./note-suggestions";
import { noteHeading, readingLabel } from "./reader-model";
import { NoteTagChips, PillarRow, SuggestionChips, aiNote } from "./TagChips";

type UpdateBlock = (id: string, updates: Partial<ArchiveBlock>) => Promise<unknown>;

/** Characters of a long note the peek renders before "Show all" (the full reader opens with more). */
export const PEEK_FIRST_CHARS = 12_000;

export interface ArchivePeekProps {
  block: ArchiveBlock;
  /** Where it sits in the list shown (index -1: no longer in it). */
  index: number;
  total: number;
  /** The bottom sheet of a phone instead of the side panel. */
  phone: boolean;
  /** His pillars, in the order the digit keys reach them. */
  pillars: readonly Pillar[];
  pillarMap: ReadonlyMap<string, Pillar>;
  /** The note's pillars as the row shows them (a press shows before the server answers). */
  pillarsOn: readonly string[];
  onTogglePillar: (id: string) => void;
  /** Every note: the folders the Folder… button offers. */
  blocks: readonly ArchiveBlock[];
  viewedFolder: string | null;
  armed: Armed | null;
  onArm: () => void;
  onDisarm: () => void;
  onConfirmDelete: () => void;
  onClose: () => void;
  onStep: (step: 1 | -1) => void;
  onOpenFull: () => void;
  onEdit: () => void;
  onUpdate: UpdateBlock;
  onFilterTag: (tag: string) => void;
  onFilterType: (type: TypeTag) => void;
  /**
   * The Archive's AI flow for one note (Shorten, Expand, Clean, own prompt,
   * through the preview with its stated borders). Without it the peek runs
   * Shorten, Expand and Clean itself, through the same preview.
   */
  onAIAction?: (block: ArchiveBlock, action: NoteAIAction) => void;
  /** "Save as new" of an AI result the peek ran itself. */
  onSaveNew?: (note: Partial<ArchiveBlock>) => Promise<unknown>;
  onPlant?: (block: ArchiveBlock) => void;
}

/**
 * A quick look at a note without leaving the list: a panel on the right of a
 * desktop (the list stays visible and scrollable, nothing behind it is
 * locked), a bottom sheet on a phone (swipe it down, or Back, to close). The
 * Library owns the keys: ← → ↑ ↓ step through the list, Esc closes, Enter
 * opens the full reader, Delete asks to delete, 1-8 toggle a pillar.
 */
export default function ArchivePeek(props: ArchivePeekProps) {
  const { block, index, total, phone, onClose, onStep, onOpenFull } = props;
  const heading = useMemo(() => noteHeading(block.title, block.content), [block.title, block.content]);
  const scroller = useRef<HTMLDivElement>(null);
  // Each note opens at its top.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [block.id]);

  const header = (
    <div className="flex items-center gap-1 border-b border-white/5 px-2 py-1.5">
      <ToolButton label="Previous note (←)" icon={phone ? ChevronLeft : ChevronUp} disabled={index <= 0} onClick={() => onStep(-1)} />
      <ToolButton label="Next note (→)" icon={phone ? ChevronRight : ChevronDown} disabled={index < 0 || index >= total - 1} onClick={() => onStep(1)} />
      {index >= 0 && (
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground" aria-hidden>
          {index + 1} / {total}
        </span>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        <ToolButton label="Open in the full reader (Enter)" icon={Maximize2} text="Open" onClick={onOpenFull} />
        <ToolButton label="Close (Esc)" icon={X} onClick={onClose} />
      </div>
    </div>
  );

  const body = (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6 pt-3 sm:px-4">
      <PeekBody key={block.id} {...props} heading={heading} />
    </div>
  );

  if (phone) return <PhoneSheet title={heading.title} onClose={onClose} header={header} body={body} scroller={scroller} />;
  return (
    <aside
      aria-label={`Preview: ${heading.title}`}
      data-archive-peek=""
      data-archive-peek-panel=""
      className="fixed bottom-0 right-0 top-0 z-40 flex w-[440px] max-w-[92vw] flex-col border-l border-white/10 bg-background shadow-2xl animate-in slide-in-from-right-4 duration-150 motion-reduce:animate-none"
    >
      {header}
      {body}
    </aside>
  );
}

function PeekBody({
  block,
  phone,
  pillars,
  pillarMap,
  pillarsOn,
  onTogglePillar,
  blocks,
  viewedFolder,
  armed,
  onArm,
  onDisarm,
  onConfirmDelete,
  onEdit,
  onUpdate,
  onFilterTag,
  onFilterType,
  onAIAction,
  onSaveNew,
  onPlant,
  heading,
}: ArchivePeekProps & { heading: ReturnType<typeof noteHeading> }) {
  const tags = noteTags(block);
  const text = useNoteText(heading.skip ? block.content.slice(heading.skip) : block.content, PEEK_FIRST_CHARS);
  const sugg = useNoteSuggestions(block, onUpdate);
  const label = readingLabel(block.content.length);

  // Pin and bookmark show their new state at once; a failed write puts them back.
  const [flags, setFlags] = useState<{ pinned?: boolean; starred?: boolean }>({});
  const pinned = flags.pinned ?? !!block.is_pinned;
  const starred = flags.starred ?? !!block.is_starred;
  const flip = async (key: "pinned" | "starred") => {
    const next = key === "pinned" ? !pinned : !starred;
    setFlags((f) => ({ ...f, [key]: next }));
    await onUpdate(block.id, key === "pinned" ? { is_pinned: next } : { is_starred: next });
    setFlags((f) => ({ ...f, [key]: undefined }));
  };

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!(await copyText(block.content))) {
      toast.error("Couldn't copy. Select the text and copy it instead.");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <article className="space-y-3" lang={text.lang}>
      <div className="space-y-1">
        <h2 className={`line-clamp-3 break-words text-lg font-bold leading-snug text-foreground [overflow-wrap:anywhere] ${heading.shown ? "" : "sr-only"}`}>{heading.title}</h2>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground" lang="en">
          <time dateTime={block.created_at}>{new Date(block.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</time>
          {label && <span>· {label}</span>}
          {pinned && <span>· 📌 Pinned</span>}
        </p>
      </div>

      <div className="-mx-1 flex flex-wrap items-center gap-0.5" lang="en">
        <ToolButton label="Edit (E)" icon={Pencil} onClick={onEdit} />
        <ToolButton label={copied ? "Copied" : "Copy the text"} icon={copied ? Check : Copy} onClick={() => void copy()} />
        <ToolButton label="Pin to the top of the Library (P)" icon={Pin} pressed={pinned} onClick={() => void flip("pinned")} />
        <ToolButton label="Bookmark" icon={Star} pressed={starred} onClick={() => void flip("starred")} />
        <FolderPicker notes={[block]} blocks={blocks} viewed={viewedFolder} updateBlock={onUpdate} align={phone ? "center" : "end"}>
          <ToolButtonEl label="Folder…" icon={FolderInput} text="Folder…" />
        </FolderPicker>
        <AIMenu block={block} onAIAction={onAIAction} onSuggest={sugg.ask} onUpdate={onUpdate} onSaveNew={onSaveNew} />
        {onPlant && <ToolButton label="Plant in the Forest" icon={Sprout} onClick={() => onPlant(block)} />}
        <span className="ml-auto">
          <DeleteConfirmButton variant="tool" armed={armed} onArm={onArm} onDisarm={onDisarm} onConfirm={onConfirmDelete} />
        </span>
      </div>

      {(tags.shown.length > 0 || sugg.visible) && (
        <div className="space-y-2">
          <NoteTagChips tags={tags.shown} onTag={onFilterTag} onType={onFilterType} size="md" focusable />
          {sugg.visible && (
            <SuggestionChips
              chips={sugg.chips}
              chosen={sugg.chosen}
              onToggle={sugg.toggle}
              onAccept={() => void sugg.accept()}
              onDismiss={sugg.dismiss}
              pillars={pillarMap}
              loading={sugg.loading}
              error={sugg.error}
              note={aiNote(sugg.status?.ai, sugg.status?.aiError)}
              keys={null}
              saving={sugg.saving}
            />
          )}
        </div>
      )}

      <PillarRow pillars={pillars} active={pillarsOn} onToggle={onTogglePillar} numbered={!phone} />

      <NoteText model={text} className="p-3 sm:p-4" />
    </article>
  );
}

// -- AI ------------------------------------------------------------------------------------

/** The current note-AI preview, fetched the first time an action runs from the peek. */
const AIPreviewModal = lazyModule(() => import("./ArchiveAIPreviewModal"));

/** The actions the peek runs itself when neither the Archive's AI handler nor its provider is there. */
const HERE: NoteAIAction[] = ["shorten", "expand", "clean"];

/** The note's AI actions, one press away. Every result opens the preview first; nothing is saved before it. */
function AIMenu({
  block,
  onAIAction: onAIActionProp,
  onSuggest,
  onUpdate,
  onSaveNew,
}: {
  block: ArchiveBlock;
  onAIAction?: ArchivePeekProps["onAIAction"];
  onSuggest: () => void;
  onUpdate: UpdateBlock;
  onSaveNew?: ArchivePeekProps["onSaveNew"];
}) {
  // The Archive's runner (ArchiveAIProvider) when the Library sits inside it, even without the prop.
  const archiveAI = useArchiveAI();
  const onAIAction = onAIActionProp ?? (archiveAI ? (b: ArchiveBlock, a: NoteAIAction) => archiveAI.run([b], a) : undefined);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AIPreviewView | null>(null);
  const runId = useRef(0);
  const actions: NoteAIAction[] = onAIAction ? ["shorten", "expand", "clean", "prompt"] : HERE;

  const subject = useMemo(() => {
    const t = noteHeading(block.title, block.content).title;
    return t.length > 40 ? `${t.slice(0, 39)}…` : t;
  }, [block.title, block.content]);

  // The flow kept for when the Archive's handler is not passed in: one note, the same preview.
  const runHere = async (action: NoteAIAction) => {
    const tooLong = aiTooLong(action, block.content);
    if (tooLong) {
      toast.error(tooLong);
      return;
    }
    // All of what would be sent is read (the length was checked above).
    if (looksLikeCredential(`${block.title}\n\n${block.content}`)) {
      toast.error(CREDENTIAL_MESSAGE);
      return;
    }
    const id = ++runId.current;
    const base: AIPreviewView = { action, subject, status: "loading", original: block.content, canReplace: true, canSaveNew: !!onSaveNew };
    setView(base);
    try {
      // The same call the Archive's runner makes (one place that speaks to ai-archive-*).
      const { text: proposed, note } = await fetchNoteAI(action, block.content, block.title);
      if (runId.current === id) setView(proposed.trim() ? { ...base, status: "ready", proposed, note } : { ...base, status: "error", error: "The AI returned an empty text." });
    } catch (e) {
      if (runId.current === id) setView({ ...base, status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  };

  const run = (action: NoteAIAction | "suggest") => {
    setOpen(false);
    if (action === "suggest") onSuggest();
    else if (onAIAction) onAIAction(block, action);
    else void runHere(action);
  };

  const close = () => {
    runId.current++;
    setView(null);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <ToolButtonEl label="AI actions" icon={view?.status === "loading" ? Loader2 : WandSparkles} text="AI…" spin={view?.status === "loading"} onPointerEnter={() => void AIPreviewModal.preload()} />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 border-white/10 p-1" lang="en">
          <button type="button" onClick={() => run("suggest")} className="block w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-white/5">
            <span className="block text-sm font-semibold">✨ Suggest</span>
            <span className="block text-[11px] leading-snug text-muted-foreground">Type, tags and pillars from your similar notes. Nothing changes until you accept.</span>
          </button>
          {actions.map((a) => (
            <button key={a} type="button" onClick={() => run(a)} className="block w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-white/5" title={AI_ACTIONS[a].border}>
              <span className="block text-sm font-semibold">
                {AI_ACTIONS[a].icon} {AI_ACTIONS[a].label}
              </span>
              <span className="block text-[11px] leading-snug text-muted-foreground">{AI_ACTIONS[a].border}</span>
            </button>
          ))}
        </PopoverContent>
      </Popover>
      {view && (
        <Suspense fallback={null}>
          <AIPreviewModal
            view={view}
            onReplace={async (text) => {
              const before = { title: block.title, content: block.content };
              const after = { content: text, title: titleAfterReplace(block.title, block.content, text) };
              setView({ ...view, saving: true });
              const ok = (await onUpdate(block.id, after)) !== false;
              close();
              if (ok) toast.success("Note replaced", { action: { label: "Undo", onClick: () => void onUpdate(block.id, before) } });
            }}
            onSaveNew={async (text) => {
              if (!onSaveNew) return;
              setView({ ...view, saving: true });
              await onSaveNew({ title: aiNoteTitle(view.action, block.title), content: text, pillars: block.pillars, tags: block.tags, directions: [] });
              close();
            }}
            onSkip={close}
            onStop={close}
            onRetry={() => void runHere(view.action as NoteAIAction)}
          />
        </Suspense>
      )}
    </>
  );
}

// -- the phone's sheet ---------------------------------------------------------------------

function PhoneSheet({
  title,
  onClose,
  header,
  body,
  scroller,
}: {
  title: string;
  onClose: () => void;
  header: ReactNode;
  body: ReactNode;
  scroller: RefObject<HTMLDivElement>;
}) {
  const [drag, setDrag] = useState(0);
  const start = useRef<{ y: number; t: number } | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Back closes the sheet instead of leaving the app (as the reader does).
  useEffect(() => {
    const token = `${Date.now()}-${Math.random()}`;
    let pushed = false;
    try {
      window.history.pushState({ ...(window.history.state ?? {}), mfPeek: token }, "");
      pushed = true;
    } catch {
      /* a sandboxed frame */
    }
    const onPop = () => {
      if (!pushed || window.history.state?.mfPeek === token) return;
      // The full reader opened over the sheet has its own entry; this one is under it.
      if (document.querySelector("[data-archive-reader]")) return;
      // Something open over the sheet (the editor, the AI preview, the folder picker): Back closes
      // that, as Esc does, and the sheet keeps its own history entry for the next Back.
      const open = [...document.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')].filter(
        (el) => !sheetRef.current?.contains(el),
      );
      const top = open[open.length - 1];
      if (top) {
        try {
          window.history.pushState({ ...(window.history.state ?? {}), mfPeek: token }, "");
        } catch {
          pushed = false;
        }
        top.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
        return;
      }
      pushed = false;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    // The assistant's robot would float over the sheet.
    const hidRobot = !("archiveReaderOpen" in document.body.dataset);
    if (hidRobot) document.body.dataset.archiveReaderOpen = "";
    return () => {
      window.removeEventListener("popstate", onPop);
      if (pushed && window.history.state?.mfPeek === token) window.history.back();
      if (hidRobot && !document.querySelector("[data-archive-reader]")) delete document.body.dataset.archiveReaderOpen;
    };
  }, []);

  // Swipe down from the top of the sheet (or anywhere, once its text is scrolled to the top).
  const onTouchStart = (e: ReactTouchEvent) => {
    const p = e.touches[0];
    const fromHandle = (e.target as HTMLElement).closest("[data-sheet-handle]");
    start.current = p && e.touches.length === 1 && (fromHandle || (scroller.current?.scrollTop ?? 0) <= 0) ? { y: p.clientY, t: performance.now() } : null;
  };
  const onTouchMove = (e: ReactTouchEvent) => {
    const p = e.touches[0];
    if (!start.current || !p) return;
    const dy = p.clientY - start.current.y;
    if (dy > 0 && (scroller.current?.scrollTop ?? 0) <= 0) setDrag(dy);
    else if (dy < 0) setDrag(0);
  };
  const onTouchEnd = () => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const fast = drag > 40 && performance.now() - s.t < 300;
    if (drag > 110 || fast) onClose();
    else setDrag(0);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 animate-in fade-in-0 duration-150" onClick={onClose} aria-hidden />
      <section
        ref={sheetRef}
        role="region"
        aria-label={`Preview: ${title}`}
        data-archive-peek=""
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          start.current = null;
          setDrag(0);
        }}
        style={{ transform: drag ? `translateY(${drag}px)` : undefined, transition: drag ? "none" : "transform 150ms ease-out" }}
        className="fixed inset-x-0 bottom-0 z-50 flex h-[70vh] flex-col rounded-t-2xl border-t border-white/10 bg-background shadow-2xl animate-in slide-in-from-bottom-8 duration-200 motion-reduce:animate-none"
      >
        <div data-sheet-handle="" className="flex justify-center pb-1 pt-2" aria-hidden>
          <span className="h-1.5 w-10 rounded-full bg-white/20" />
        </div>
        {header}
        {body}
      </section>
    </>
  );
}

// -- controls ------------------------------------------------------------------------------

const toolTone = (pressed?: boolean, disabled?: boolean) =>
  disabled ? "cursor-default opacity-35" : pressed ? "bg-primary/15 text-primary hover:bg-primary/25" : "text-muted-foreground hover:bg-white/5 hover:text-foreground";
const TOOL = "inline-flex h-10 min-w-[2.25rem] items-center justify-center gap-1.5 rounded-lg px-2 text-sm transition-colors active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:h-9";

function ToolButton({
  label,
  text,
  icon: Icon,
  onClick,
  pressed,
  disabled,
}: {
  label: string;
  text?: string;
  icon: LucideIcon;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      className={`${TOOL} ${toolTone(pressed, disabled)}`}
    >
      <Icon className={`h-4 w-4 ${pressed ? "fill-current" : ""}`} aria-hidden />
      {text && <span className="hidden text-xs sm:inline">{text}</span>}
    </button>
  );
}

/** A tool button that a Popover trigger can hand its props and ref to. */
const ToolButtonEl = forwardRef<HTMLButtonElement, { label: string; text?: string; icon: LucideIcon; spin?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>>(
  function ToolButtonEl({ label, text, icon: Icon, spin, className, ...rest }, ref) {
    return (
      <button ref={ref} type="button" aria-label={label} title={label} className={`${TOOL} ${toolTone()} ${className ?? ""}`} {...rest}>
        <Icon className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} aria-hidden />
        {text && <span className="hidden text-xs sm:inline">{text}</span>}
      </button>
    );
  },
);
