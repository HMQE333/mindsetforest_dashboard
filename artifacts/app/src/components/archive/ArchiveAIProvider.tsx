import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useArchiveState } from "@/hooks/useArchiveState";
import { invokeFunction } from "@/lib/function-error";
import { CREDENTIAL_MESSAGE, looksLikeCredential } from "@/lib/credential-check";
import { lazyModule } from "@/lib/lazy-module";
import { shortTitle, type ArchiveBlock } from "@/lib/archive-data";
import { isTypeTag } from "@/lib/archive-tags";
import {
  AI_ACTIONS,
  aiNoteTitle,
  aiTooLong,
  multiTooLong,
  titleAfterReplace,
  type AIAction,
  type MultiAIAction,
  type NoteAIAction,
} from "@/lib/archive-ai";
import type { AIPreviewView } from "./ArchiveAIPreviewModal";

/**
 * Every AI action on Archive notes goes through here, so each one ends in the
 * same preview (ArchiveAIPreviewModal: borders, warnings, word diff, Replace /
 * Save as new / Cancel) and nothing the model wrote is saved unseen.
 *
 * Mounted once around the Archive (ArchiveView). Anything inside calls
 * useArchiveAI(): run(notes, action) for Shorten / Expand / Clean / own prompt
 * on one note or on each of several (their previews follow one another, two
 * asked ahead), runMulti(notes, "merge" | "summarize") for a new note made of
 * several, ask(notes, mode) for his own prompt, preview(job) for any other
 * text (the Inbox draft). <ArchiveAIMenu notes={[b]} /> is the "✨ AI" button.
 *
 * Replace writes through useArchiveState and offers Undo (the old title and
 * text back); Save as new copies the note's tags and pillars and offers Undo
 * (the new note deleted).
 */

const PreviewModal = lazyModule(() => import("./ArchiveAIPreviewModal"));
const PromptModal = lazyModule(() => import("./ArchiveAIPromptModal"));

/** A text for the preview: what was sent, how to get the AI's version, and what the buttons do. */
export interface AIJob {
  action: AIAction;
  subject: string;
  original: string;
  /** Asks the model; resolves its text (and a line about it, e.g. "AI added 2 blocks"). */
  fetch: () => Promise<{ text: string; note?: string }>;
  /** Puts the result in place of the original; resolves whether it was saved. Without it, no Replace. */
  replace?: (text: string) => Promise<boolean>;
  /** Saves the result as a new note; resolves whether it was saved. Without it, no Save as new. */
  saveNew?: (text: string) => Promise<boolean>;
  replaceLabel?: string;
  /** Known before asking (the note is too long): shown instead of a result. */
  error?: string;
}

export interface ArchiveAI {
  /** Shorten / Expand / Clean / own prompt on each note, one preview after another. "prompt" without a prompt asks for it. */
  run: (notes: readonly ArchiveBlock[], action: NoteAIAction, opts?: { prompt?: string }) => void;
  /** Several notes into one new note. "together" is his own prompt (or a preset: themes, action_plan, compare). */
  runMulti: (notes: readonly ArchiveBlock[], action: MultiAIAction, opts?: { prompt?: string; preset?: string }) => void;
  /** Ask for his own prompt: on each note, or on all of them together. */
  ask: (notes: readonly ArchiveBlock[], mode: "each" | "together") => void;
  /** Any text through the preview (the Inbox draft). */
  preview: (jobs: AIJob | AIJob[]) => void;
  /** A run is open. */
  busy: boolean;
  /** Fetch the preview's code ahead (on hover of an AI button). */
  preload: () => void;
}

const Ctx = createContext<ArchiveAI | null>(null);

/** The Archive's AI runner, or null outside ArchiveAIProvider. */
export function useArchiveAI(): ArchiveAI | null {
  return useContext(Ctx);
}

/**
 * One note's text through an action, as the functions answer it. Clean and
 * own prompt are ai-archive-clean; Shorten and Expand are ai-archive-expand
 * (Expand is put together on the server, so his text comes back untouched).
 */
export async function fetchNoteAI(action: NoteAIAction, content: string, title: string, prompt?: string): Promise<{ text: string; note?: string }> {
  if (action === "clean" || action === "prompt") {
    const body = action === "prompt" ? { rawText: content, customPrompt: prompt ?? "" } : { rawText: content };
    const data = await invokeFunction<{ cleanedText?: string }>("ai-archive-clean", body);
    return { text: String(data?.cleanedText ?? "") };
  }
  const data = await invokeFunction<{ content?: string; additions?: number }>("ai-archive-expand", { content, title, action });
  const added = typeof data?.additions === "number" ? data.additions : null;
  return {
    text: String(data?.content ?? ""),
    note: action === "expand" && added !== null ? (added ? `AI added ${added} block${added === 1 ? "" : "s"}` : "AI found nothing to add") : undefined,
  };
}

interface Slot {
  job: AIJob;
  status: "loading" | "ready" | "error";
  text?: string;
  note?: string;
  error?: string;
}
interface Run {
  id: number;
  slots: Slot[];
  index: number;
  saving: boolean;
}

/** Results asked for ahead of the one on screen. */
const AHEAD = 2;
/** The text checked for secrets (as ai-suggest-tags does): a password sits near the top of a note. */
const SECRET_SCAN_CHARS = 10_000;
const holdsSecret = (b: { title?: string | null; content: string }) => looksLikeCredential(`${b.title ?? ""}\n\n${b.content}`.slice(0, SECRET_SCAN_CHARS));

const tagsOfAll = (notes: readonly ArchiveBlock[]) => {
  const out: string[] = [];
  for (const n of notes) for (const t of n.tags ?? []) if (!isTypeTag(t) && !out.includes(t)) out.push(t);
  return out;
};
const tagsInEvery = (notes: readonly ArchiveBlock[]) =>
  tagsOfAll(notes).filter((t) => notes.every((n) => (n.tags ?? []).includes(t)));
const pillarsOfAll = (notes: readonly ArchiveBlock[]) => [...new Set(notes.flatMap((n) => n.pillars ?? []))];
const pillarsInEvery = (notes: readonly ArchiveBlock[]) => pillarsOfAll(notes).filter((p) => notes.every((n) => (n.pillars ?? []).includes(p)));

export function ArchiveAIProvider({ children }: { children: ReactNode }) {
  const { updateBlock, addBlock, deleteBlock } = useArchiveState({ live: false });
  const [run, setRun] = useState<Run | null>(null);
  const [asking, setAsking] = useState<{ mode: "each" | "together"; notes: readonly ArchiveBlock[] } | null>(null);
  const seq = useRef(0);
  /** The open run's id (0: none), set at once, so a second start or a stopped run's workers see it before a render. */
  const alive = useRef(0);
  const runRef = useRef<Run | null>(null);
  runRef.current = run;
  useEffect(() => {
    if (!run) alive.current = 0;
  }, [run]);

  const patch = useCallback((id: number, i: number, slot: Partial<Slot>) => {
    setRun((r) => (r && r.id === id ? { ...r, slots: r.slots.map((s, j) => (j === i ? { ...s, ...slot } : s)) } : r));
  }, []);

  const ask1 = useCallback(
    (id: number, i: number, job: AIJob) => {
      if (job.error) {
        patch(id, i, { status: "error", error: job.error });
        return Promise.resolve();
      }
      patch(id, i, { status: "loading", error: undefined });
      return job.fetch().then(
        (r) => patch(id, i, r.text.trim() ? { status: "ready", text: r.text, note: r.note } : { status: "error", error: "The AI returned an empty text." }),
        (e: unknown) => patch(id, i, { status: "error", error: e instanceof Error ? e.message : String(e) }),
      );
    },
    [patch],
  );

  const start = useCallback(
    (jobs: AIJob[]) => {
      if (!jobs.length) return;
      if (alive.current) {
        toast.info("Finish the AI preview that is open first");
        return;
      }
      const id = ++seq.current;
      alive.current = id;
      setRun({ id, slots: jobs.map((job) => ({ job, status: "loading" })), index: 0, saving: false });
      // A few at a time, in order: the next previews are ready when he gets to them. Stop asks for no more.
      let next = 0;
      const worker = async () => {
        while (next < jobs.length && alive.current === id) {
          const i = next++;
          await ask1(id, i, jobs[i]);
        }
      };
      for (let w = 0; w < Math.min(AHEAD, jobs.length); w++) void worker();
    },
    [ask1],
  );

  const replaceNote = useCallback(
    async (b: ArchiveBlock, action: NoteAIAction, text: string): Promise<boolean> => {
      const before = { title: b.title, content: b.content };
      const title = titleAfterReplace(b.title, b.content, text);
      const ok = await updateBlock(b.id, title !== b.title ? { content: text, title } : { content: text });
      if (!ok) return false;
      toast.success(`${AI_ACTIONS[action].label}: note replaced`, {
        description: shortTitle(title, 60),
        duration: 8000,
        className: "[overflow-wrap:anywhere]",
        action: { label: "Undo", onClick: () => void updateBlock(b.id, before).then((done) => done && toast("Undone")) },
      });
      return true;
    },
    [updateBlock],
  );

  const saveNew = useCallback(
    async (fields: Partial<ArchiveBlock>): Promise<boolean> => {
      const saved = await addBlock({ directions: [], ...fields });
      if (!saved) return false;
      toast.success("Saved as a new note", {
        description: shortTitle(saved.title, 60),
        duration: 8000,
        className: "[overflow-wrap:anywhere]",
        action: { label: "Undo", onClick: () => void deleteBlock(saved.id).then((done) => done && toast("Undone")) },
      });
      return true;
    },
    [addBlock, deleteBlock],
  );

  const runNotes = useCallback(
    (notes: readonly ArchiveBlock[], action: NoteAIAction, prompt?: string) => {
      const jobs = notes.map<AIJob>((b) => ({
        action,
        subject: shortTitle(b.title, 60),
        original: b.content,
        // A note that looks like it holds a password or a key never leaves for the model.
        error: !b.content.trim() ? "The note is empty." : holdsSecret(b) ? CREDENTIAL_MESSAGE : aiTooLong(action, b.content) ?? undefined,
        fetch: () => fetchNoteAI(action, b.content, b.title, prompt),
        replace: (text) => replaceNote(b, action, text),
        saveNew: (text) => saveNew({ title: aiNoteTitle(action, b.title), content: text, pillars: [...(b.pillars ?? [])], tags: [...(b.tags ?? [])] }),
      }));
      // One note that cannot go: say so here, no empty preview.
      if (jobs.length === 1 && jobs[0].error) {
        toast.error(jobs[0].error);
        return;
      }
      start(jobs);
    },
    [replaceNote, saveNew, start],
  );

  const busy = run !== null;
  const value = useMemo<ArchiveAI>(() => {
    const runMulti: ArchiveAI["runMulti"] = (notes, action, opts = {}) => {
      if (notes.length < 2) {
        toast.info("Select 2 or more notes");
        return;
      }
      const list = notes.map((b) => ({ title: b.title, content: b.content }));
      const preset = action === "together" ? opts.preset : action;
      const tooLong = multiTooLong(list);
      if (tooLong) {
        toast.error(tooLong);
        return;
      }
      const secret = notes.find(holdsSecret);
      if (secret) {
        toast.error(`“${shortTitle(secret.title, 48)}”: ${CREDENTIAL_MESSAGE} Leave it out of the selection.`, { className: "[overflow-wrap:anywhere]" });
        return;
      }
      const together = action !== "merge";
      start([
        {
          action,
          subject: `${notes.length} notes`,
          original: notes.map((b) => `## ${b.title}\n\n${b.content}`).join("\n\n"),
          fetch: async () => {
            const data = await invokeFunction<{ content?: string }>("ai-archive-multi", { notes: list, preset, prompt: opts.prompt ?? "" });
            return { text: String(data?.content ?? "") };
          },
          saveNew: (text) =>
            saveNew({
              title: aiNoteTitle(action, "", notes.length),
              content: text,
              // A merge holds all of them; a summary or an answer belongs where all of them are.
              tags: together ? tagsInEvery(notes) : tagsOfAll(notes),
              pillars: together ? pillarsInEvery(notes) : pillarsOfAll(notes),
            }),
        },
      ]);
    };
    return {
      run: (notes, action, opts = {}) => {
        if (!notes.length) return;
        if (action === "prompt" && !opts.prompt?.trim()) {
          setAsking({ mode: "each", notes });
          return;
        }
        runNotes(notes, action, opts.prompt);
      },
      runMulti,
      ask: (notes, mode) => {
        if (notes.length) setAsking({ mode, notes });
      },
      preview: (jobs) => start(Array.isArray(jobs) ? jobs : [jobs]),
      busy,
      preload: () => {
        void PreviewModal.preload();
        void PromptModal.preload();
      },
    };
  }, [busy, runNotes, saveNew, start]);

  const slot = run?.slots[run.index];
  const advance = useCallback(() => {
    setRun((r) => (!r ? r : r.index + 1 >= r.slots.length ? null : { ...r, index: r.index + 1, saving: false }));
  }, []);
  const decide = useCallback(
    async (how: "replace" | "new", text: string) => {
      const r = runRef.current;
      const s = r?.slots[r.index];
      const write = how === "replace" ? s?.job.replace : s?.job.saveNew;
      if (!r || !s || !write) return;
      setRun((x) => (x && x.id === r.id ? { ...x, saving: true } : x));
      let ok = false;
      try {
        ok = await write(text);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Saving failed");
      }
      if (runRef.current?.id !== r.id) return;
      if (ok) advance();
      else setRun((x) => (x && x.id === r.id ? { ...x, saving: false } : x));
    },
    [advance],
  );

  const view: AIPreviewView | null = slot
    ? {
        action: slot.job.action,
        subject: slot.job.subject,
        position: run!.slots.length > 1 ? { index: run!.index, total: run!.slots.length } : undefined,
        status: slot.status,
        error: slot.error,
        original: slot.job.original,
        proposed: slot.text,
        note: slot.note,
        canReplace: !!slot.job.replace && AI_ACTIONS[slot.job.action].canReplace,
        canSaveNew: !!slot.job.saveNew,
        replaceLabel: slot.job.replaceLabel,
        saving: run!.saving,
      }
    : null;

  return (
    <Ctx.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        {view && run && (
          <PreviewModal
            view={view}
            onReplace={(t) => void decide("replace", t)}
            onSaveNew={(t) => void decide("new", t)}
            onSkip={advance}
            onStop={() => {
              alive.current = 0;
              setRun(null);
            }}
            onRetry={() => slot && void ask1(run.id, run.index, slot.job)}
          />
        )}
        {asking && (
          <PromptModal
            open
            mode={asking.mode}
            titles={asking.notes.map((b) => b.title)}
            onClose={() => setAsking(null)}
            onRun={(prompt, preset) => {
              const { mode, notes } = asking;
              setAsking(null);
              if (mode === "each") runNotes(notes, "prompt", prompt);
              else if (preset === "merge" || preset === "summarize") value.runMulti(notes, preset);
              else value.runMulti(notes, "together", { prompt, preset });
            }}
          />
        )}
      </Suspense>
    </Ctx.Provider>
  );
}

const NOTE_ACTIONS: NoteAIAction[] = ["shorten", "expand", "clean", "prompt"];

/**
 * "✨ AI": the note actions for one note (the peek, the reader) or each of
 * several (the selection bar), with their borders; for 2+ notes also "Prompt
 * on all together". Renders nothing outside ArchiveAIProvider.
 */
export function ArchiveAIMenu({
  notes,
  align = "end",
  side = "bottom",
  className,
  children,
  onStarted,
}: {
  notes: readonly ArchiveBlock[];
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  /** The trigger's classes (when no children are given). */
  className?: string;
  /** A trigger of your own (one element that takes a ref). */
  children?: ReactNode;
  /** After an action was picked (close a menu, clear a selection…). */
  onStarted?: (action: AIAction) => void;
}) {
  const ai = useArchiveAI();
  const [open, setOpen] = useState(false);
  if (!ai) return null;
  const many = notes.length > 1;
  const pick = (action: NoteAIAction) => {
    setOpen(false);
    ai.run(notes, action);
    onStarted?.(action);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <button
            type="button"
            disabled={ai.busy || notes.length === 0}
            onPointerEnter={ai.preload}
            onFocus={ai.preload}
            onClick={(e) => e.stopPropagation()}
            className={className ?? "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-40"}
            title={many ? `AI on each of ${notes.length} notes` : "AI actions: Shorten, Expand, Clean, own prompt"}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> AI{many ? "…" : ""}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} side={side} className="w-[min(20rem,calc(100vw-2rem))] border-white/10 p-1.5" onClick={(e) => e.stopPropagation()} lang="en">
        {many && <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">On each of {notes.length} notes</p>}
        {NOTE_ACTIONS.map((a) => {
          const info = AI_ACTIONS[a];
          return (
            <button
              key={a}
              type="button"
              onClick={() => pick(a)}
              className="flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
            >
              <span className="text-sm leading-5" aria-hidden>{info.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{info.label}{a === "prompt" ? "…" : ""}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">{info.border}</span>
              </span>
            </button>
          );
        })}
        {many && (
          <>
            <div className="my-1 h-px bg-white/10" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                ai.ask(notes, "together");
                onStarted?.("together");
              }}
              className="flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
            >
              <span className="text-sm leading-5" aria-hidden>{AI_ACTIONS.together.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Prompt on all together…</span>
                <span className="block text-[11px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">{AI_ACTIONS.together.border}</span>
              </span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
