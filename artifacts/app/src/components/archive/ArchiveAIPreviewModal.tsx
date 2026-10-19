import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AI_ACTIONS, type AIAction } from "@/lib/archive-ai";
import { checkAIResult, diffCounts, lengthLine, warnsOfLoss, wordDiff, type DiffPart } from "@/lib/archive-ai-check";

/**
 * What an AI action did, before anything is saved: the action's borders, the
 * length before -> after, the warnings (a link, number or #tag gone, his own
 * words changed by Expand), a word-level diff, and the buttons. Replace is the
 * default for Shorten and Clean, Save as new for the rest, and for any result
 * that would lose something of his. Loaded the first time an AI action runs.
 */

export interface AIPreviewView {
  action: AIAction;
  /** What it was run on: the note's short title, "Inbox draft", "3 notes". */
  subject: string;
  /** In a run over several notes: this one's place. */
  position?: { index: number; total: number };
  status: "loading" | "ready" | "error";
  error?: string;
  original: string;
  proposed?: string;
  /** A line from the function ("AI added 2 blocks"). */
  note?: string;
  canReplace: boolean;
  canSaveNew: boolean;
  /** "Replace" by default; the Inbox says "Use this text". */
  replaceLabel?: string;
  saving?: boolean;
}

interface Props {
  view: AIPreviewView;
  onReplace: (text: string) => void;
  onSaveNew: (text: string) => void;
  /** This one is not wanted (closes when it is the last). */
  onSkip: () => void;
  /** Cancel this one and the rest. */
  onStop: () => void;
  onRetry: () => void;
}

/** Unchanged stretches longer than this fold to their ends in the diff. */
const FOLD_AT = 600;
const FOLD_KEEP = 180;

function DiffView({ parts, folded, onUnfold }: { parts: DiffPart[]; folded: boolean; onUnfold: () => void }) {
  const out: ReactNode[] = [];
  parts.forEach((p, i) => {
    if (p.kind === "del") {
      out.push(
        <del key={i} className="rounded-sm bg-red-500/15 text-red-300 decoration-red-400/70">
          {p.text}
        </del>,
      );
    } else if (p.kind === "add") {
      out.push(
        <ins key={i} className="rounded-sm bg-emerald-500/15 text-emerald-200 no-underline">
          {p.text}
        </ins>,
      );
    } else if (folded && p.text.length > FOLD_AT) {
      const head = i === 0 ? "" : p.text.slice(0, FOLD_KEEP);
      const tail = i === parts.length - 1 ? "" : p.text.slice(-FOLD_KEEP);
      const hidden = p.text.length - head.length - tail.length;
      out.push(
        <span key={i} className="text-muted-foreground">
          {head}
          <button type="button" onClick={onUnfold} className="mx-1 rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground">
            ⋯ {hidden.toLocaleString("en-US")} unchanged characters ⋯
          </button>
          {tail}
        </span>,
      );
    } else {
      out.push(
        <span key={i} className="text-muted-foreground">
          {p.text}
        </span>,
      );
    }
  });
  return <>{out}</>;
}

const ArchiveAIPreviewModal = ({ view, onReplace, onSaveNew, onSkip, onStop, onRetry }: Props) => {
  const info = AI_ACTIONS[view.action];
  const [edited, setEdited] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"changes" | "result">(view.action === "summarize" || view.action === "together" ? "result" : "changes");
  const [folded, setFolded] = useState(true);
  const replaceRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  // A new result (the next note, a retry) starts from what the AI wrote.
  const resultKey = `${view.subject}\u0000${view.position?.index ?? 0}\u0000${view.proposed ?? ""}`;
  useEffect(() => {
    setEdited(null);
    setEditing(false);
    setFolded(true);
  }, [resultKey]);

  const text = edited ?? view.proposed ?? "";
  const ready = view.status === "ready";
  const parts = useMemo(() => (ready ? wordDiff(view.original, text) : []), [ready, view.original, text]);
  const warnings = useMemo(() => (ready ? checkAIResult(view.action, view.original, text, parts) : []), [ready, view.action, view.original, text, parts]);
  const counts = useMemo(() => diffCounts(parts), [parts]);
  const lossy = warnsOfLoss(warnings);
  const primary: "replace" | "new" =
    !view.canSaveNew ? "replace" : !view.canReplace ? "new" : lossy ? "new" : info.defaultSave;

  // Enter takes the default: focus it whenever a result is shown.
  useEffect(() => {
    if (!ready || editing) return;
    const t = window.setTimeout(() => (primary === "replace" ? replaceRef : saveRef).current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [ready, editing, primary, resultKey]);

  const many = !!view.position && view.position.total > 1;
  const title = `${info.icon} ${info.label}`;
  const btn = "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-40";
  const primaryCls = `${btn} gradient-purple text-primary-foreground glow-sm hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`;
  const secondaryCls = `${btn} border border-white/15 bg-white/[0.04] text-foreground hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`;
  const ghostCls = `${btn} text-muted-foreground hover:text-foreground`;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onStop(); }}>
      <DialogContent
        className="glass-card flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-3 border-white/10 p-4 sm:p-6"
        onOpenAutoFocus={(e) => e.preventDefault()}
        lang="en"
      >
        <DialogHeader className="min-w-0 space-y-1 pr-6 text-left">
          <DialogTitle className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-base leading-snug">
            <span className="text-gradient-purple">{title}</span>
            <span className="min-w-0 text-sm font-normal text-muted-foreground [overflow-wrap:anywhere]">{view.subject}</span>
            {many && (
              <span className="text-xs font-normal text-muted-foreground">
                · {view.position!.index + 1} of {view.position!.total}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] leading-relaxed">
            <span className="font-semibold text-foreground/80">Borders: </span>
            {info.border}
          </DialogDescription>
        </DialogHeader>

        {view.status === "loading" && (
          <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            {info.verb}…
          </div>
        )}

        {view.status === "error" && (
          <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 text-center" role="alert">
            <p className="max-w-md text-sm text-destructive [overflow-wrap:anywhere]">{view.error || "The AI action failed."}</p>
            <button type="button" onClick={onRetry} className={secondaryCls}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Try again
            </button>
          </div>
        )}

        {ready && (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>{lengthLine(view.original, text)}</span>
              {tab === "changes" && (
                <span>
                  <span className="text-red-300">−{counts.removed}</span> / <span className="text-emerald-300">+{counts.added}</span> words
                </span>
              )}
              {view.note && <span>{view.note}</span>}
              {edited !== null && <span className="text-amber-300">edited by you</span>}
            </div>

            {warnings.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200" aria-label="Warnings">
                {warnings.map((w) => (
                  <li key={w.kind} className="flex min-w-0 gap-1.5 [overflow-wrap:anywhere]">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0">{w.message}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-1" role="tablist" aria-label="View">
              {(["changes", "result"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t && !editing}
                  onClick={() => { setTab(t); setEditing(false); }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${tab === t && !editing ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t === "changes" ? "Changes" : "Result"}
                </button>
              ))}
              <button
                type="button"
                role="tab"
                aria-selected={editing}
                onClick={() => setEditing(true)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${editing ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Edit
              </button>
              {edited !== null && (
                <button type="button" onClick={() => setEdited(null)} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">
                  Back to the AI's text
                </button>
              )}
            </div>

            <div className="min-h-[140px] min-w-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-background/40">
              {editing ? (
                <Textarea
                  value={text}
                  onChange={(e) => setEdited(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  autoFocus
                  aria-label="The result, to edit before saving"
                  className="min-h-[260px] w-full resize-y border-0 bg-transparent text-sm focus-visible:ring-0"
                />
              ) : (
                <div className="whitespace-pre-wrap p-3 text-sm leading-relaxed [overflow-wrap:anywhere]">
                  {tab === "changes" ? <DiffView parts={parts} folded={folded} onUnfold={() => setFolded(false)} /> : text}
                </div>
              )}
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {many && (
            <button type="button" onClick={onStop} className={`${ghostCls} mr-auto`} title="Cancel this one and the rest">
              Stop
            </button>
          )}
          <button type="button" onClick={onSkip} className={ghostCls}>
            {many ? "Skip" : "Cancel"}
          </button>
          {view.canSaveNew && (
            <button
              ref={saveRef}
              type="button"
              disabled={!ready || view.saving || !text.trim()}
              onClick={() => onSaveNew(text)}
              className={primary === "new" ? primaryCls : secondaryCls}
              title="Keep the original and save the result as a new note"
            >
              {view.saving && primary === "new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Save as new
            </button>
          )}
          {view.canReplace && (
            <button
              ref={replaceRef}
              type="button"
              disabled={!ready || view.saving || !text.trim()}
              onClick={() => onReplace(text)}
              className={primary === "replace" ? primaryCls : secondaryCls}
              title="Put the result in place of the original (Undo stays a few seconds)"
            >
              {view.saving && primary === "replace" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {view.replaceLabel || "Replace"}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ArchiveAIPreviewModal;
