import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, HelpCircle, Pencil, ExternalLink, Paperclip, RotateCcw, Ban } from "lucide-react";
import type { NodePatch, PlanningMention, PlanningTask } from "@/hooks/usePlanningState";
import { isRecord, isRule as ruleOf, stateOf, type NodeState, type PlanNode, type StateOptions, type Verdict } from "@/lib/planning-model";
import PlanningMentions from "./PlanningMentions";
import PlanningMarker from "./PlanningMarker";
import { reopenNode } from "./planning-reopen";

function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const hrefOf = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

const STATE_LABEL: Record<NodeState, string> = { open: "open", done: "done", settled: "settled", dropped: "dropped" };

const VERDICTS: { v: Verdict; label: string; icon: typeof Check; on: string; off: string }[] = [
  { v: "right", label: "It held", icon: Check, on: "border-green-500/60 bg-green-500/25 text-green-200", off: "border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20" },
  { v: "wrong", label: "It didn't", icon: X, on: "border-amber-500/60 bg-amber-500/25 text-amber-200", off: "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20" },
  { v: "unknown", label: "Can't tell", icon: HelpCircle, on: "border-white/30 bg-white/10 text-foreground", off: "border-white/12 bg-white/[0.03] text-muted-foreground hover:text-foreground" },
];

interface Props {
  /** The node to show (the Map and the List both open it). */
  node?: PlanningTask | null;
  /** Older name for `node`, still accepted. */
  task?: PlanningTask | null;
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Older close callback, still accepted (called with onOpenChange(false)). */
  onClose?: () => void;
  /** usePlanningState().updateNode: a title is re-parsed there ("X? ~ g" makes a question with a guess). */
  onUpdate: (id: string, patch: NodePatch) => unknown;
  /**
   * usePlanningState().setNodeState: answering, grading the guess, ticking and
   * reopening from the sheet. Without it the answer and verdict show read-only.
   */
  onSetState?: (id: string, state: NodeState, opts?: StateOptions) => unknown;
  /** The board's rows, so Undo after Reopen can drop the "chosen over" options again. */
  nodes?: PlanNode[];
}

/**
 * Everything about one node: its kind, its guess and answer (with the one-time
 * grade of the guess), notes, link, path mentions and dates. Edits go through
 * the hook's methods handed in, so the sheet never writes on its own.
 */
export default function PlanningNodeDetail({ node: nodeProp, task, open, onOpenChange, onClose, onUpdate, onSetState, nodes }: Props) {
  const node = nodeProp ?? task ?? null;
  const close = () => { onOpenChange?.(false); onClose?.(); };

  return (
    <Sheet open={open && !!node} onOpenChange={(o) => { if (!o) close(); else onOpenChange?.(true); }}>
      <SheetContent side="right" className="w-[340px] sm:w-[400px] bg-background border-l border-border/30 overflow-y-auto">
        {node && <DetailBody key={node.id} node={node} onUpdate={onUpdate} onSetState={onSetState} nodes={nodes} />}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({ node, onUpdate, onSetState, nodes }: {
  node: PlanningTask;
  onUpdate: Props["onUpdate"];
  onSetState?: Props["onSetState"];
  nodes?: PlanNode[];
}) {
  const state = stateOf(node);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(node.title);
  const [guess, setGuess] = useState(node.guess ?? "");
  const [answer, setAnswer] = useState(node.outcome ?? "");
  const [notes, setNotes] = useState(node.notes || "");
  const [url, setUrl] = useState(node.url || "");
  const [editingUrl, setEditingUrl] = useState(false);
  const focused = useRef<string | null>(null);

  // Follow the stored values (another view, the assistant) unless that field is being typed in.
  useEffect(() => { if (!editingTitle) setTitle(node.title); }, [node.title, editingTitle]);
  useEffect(() => { if (focused.current !== "guess") setGuess(node.guess ?? ""); }, [node.guess]);
  useEffect(() => { if (focused.current !== "answer") setAnswer(node.outcome ?? ""); }, [node.outcome]);
  useEffect(() => { if (focused.current !== "notes") setNotes(node.notes || ""); }, [node.notes]);
  useEffect(() => { if (!editingUrl) setUrl(node.url || ""); }, [node.url, editingUrl]);

  // Closing the sheet unmounts this before the textarea's blur can save it.
  const latest = useRef({ notes, node, onUpdate });
  latest.current = { notes, node, onUpdate };
  useEffect(() => () => {
    const { notes: n, node: nd, onUpdate: save } = latest.current;
    if (n !== (nd.notes || "")) save(nd.id, { notes: n });
  }, []);

  const saveTitle = () => {
    const t = title.trim();
    if (t && t !== node.title) onUpdate(node.id, { title: t });
    else setTitle(node.title);
    setEditingTitle(false);
  };
  const saveGuess = () => {
    focused.current = null;
    const g = guess.trim();
    if (g !== (node.guess ?? "")) onUpdate(node.id, { guess: g || null });
  };
  const saveAnswer = () => {
    focused.current = null;
    const a = answer.trim();
    if (!onSetState) return;
    if (state === "settled") {
      if (a && a !== (node.outcome ?? "")) onSetState(node.id, "settled", { outcome: a });
      else if (!a) setAnswer(node.outcome ?? "");
    }
  };
  const settle = () => {
    const a = answer.trim();
    if (!a || !onSetState) return;
    focused.current = null;
    onSetState(node.id, "settled", { outcome: a });
  };
  const saveNotes = () => {
    focused.current = null;
    if (notes !== (node.notes || "")) onUpdate(node.id, { notes });
  };
  const saveUrl = () => {
    const u = url.trim();
    if (u !== (node.url || "")) onUpdate(node.id, { url: u || null });
    setEditingUrl(false);
  };
  // A record (a settled or graded question) stays a question: a step has no guess or grade to keep.
  const kindLocked = node.ask && isRecord(node);
  const setKind = (ask: boolean) => {
    if (ask === node.ask || kindLocked) return;
    onUpdate(node.id, ask ? { ask: true } : { ask: false, guess: null });
  };

  const domain = node.url ? extractDomain(node.url) : "";
  const outcome = node.outcome?.trim() || "";
  const isRule = ruleOf(node);

  return (
    <>
      <SheetHeader className="pb-4">
        <div className="flex items-start gap-3">
          <PlanningMarker look={{ ask: node.ask, state }} className="mt-1" />
          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) saveTitle();
                  if (e.key === "Escape") { setTitle(node.title); setEditingTitle(false); }
                }}
                className="w-full bg-transparent border-b border-primary/50 text-base font-semibold text-foreground outline-none py-0.5"
              />
            ) : (
              <SheetTitle
                className={`text-base leading-tight cursor-pointer hover:text-primary transition-colors break-words text-left ${
                  state === "dropped" ? "line-through text-muted-foreground" : "text-foreground"
                }`}
                onClick={() => setEditingTitle(true)}
              >
                {node.title}
                <Pencil className="inline-block h-3 w-3 ml-1.5 opacity-40" />
              </SheetTitle>
            )}
            <SheetDescription className="text-xs mt-1 text-left">
              {isRule ? "Settled rule" : `${node.ask ? "Question" : "Step"} · ${STATE_LABEL[state]}`}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="space-y-5">
        {/* Kind, and the one state change that fits it */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 p-1 rounded-xl bg-muted/40 border border-white/5">
            {([[false, "Step"], [true, "Question"]] as [boolean, string][]).map(([ask, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setKind(ask)}
                disabled={kindLocked && node.ask !== ask}
                title={kindLocked && node.ask !== ask ? "A settled question stays a question. Reopen it first." : undefined}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  node.ask === ask ? "gradient-purple text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {onSetState && state === "open" && !node.ask && (
            <button
              type="button"
              onClick={() => onSetState(node.id, "done")}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-primary/30 text-primary hover:bg-primary/10 transition-all"
            >
              <Check className="h-3 w-3" /> Done
            </button>
          )}
          {onSetState && state === "settled" && (
            <button
              type="button"
              onClick={() => onSetState(node.id, "dropped", { dropOpenChildren: true })}
              title="Drop it: the answer and its grade stay as the record"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            >
              <Ban className="h-3 w-3" /> Drop
            </button>
          )}
          {onSetState && state !== "open" && (
            <button
              type="button"
              onClick={() => void reopenNode(node, onSetState, nodes)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            >
              <RotateCcw className="h-3 w-3" /> Reopen
            </button>
          )}
        </div>

        {/* Question: the guess written before the work, the answer, and the one grade */}
        {node.ask && !isRule && (
          <div className="rounded-xl bg-muted/10 border border-white/5 p-3 space-y-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Your guess</p>
              {state === "open" ? (
                <>
                  <input
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                    onFocus={() => { focused.current = "guess"; }}
                    onBlur={saveGuess}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur(); }}
                    placeholder="Before you find out, what do you expect?"
                    className="w-full bg-muted/20 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Graded once, when the question is answered.</p>
                </>
              ) : (
                <p className="text-xs text-foreground/80">{node.guess ? `“${node.guess}”` : <span className="text-muted-foreground">None written.</span>}</p>
              )}
            </div>

            {state !== "dropped" && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Answer</p>
                {onSetState ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onFocus={() => { focused.current = "answer"; }}
                      onBlur={state === "settled" ? saveAnswer : () => { focused.current = null; }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                        if (state === "settled") (e.target as HTMLInputElement).blur();
                        else settle();
                      }}
                      placeholder="The answer, in one line"
                      className="flex-1 min-w-0 bg-muted/20 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
                    />
                    {state === "open" && (
                      <button
                        type="button"
                        onClick={settle}
                        disabled={!answer.trim()}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold gradient-purple text-primary-foreground disabled:opacity-40 flex-shrink-0"
                      >
                        Settle
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-foreground/80">{outcome || <span className="text-muted-foreground">Not answered yet.</span>}</p>
                )}
              </div>
            )}

            {state === "settled" && node.guess && outcome && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Did the guess hold?</p>
                <div className="flex flex-wrap gap-2">
                  {VERDICTS.map(({ v, label, icon: Icon, on, off }) => (
                    <button
                      key={v}
                      type="button"
                      disabled={!onSetState}
                      onClick={() => onSetState?.(node.id, "settled", { verdict: v })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:cursor-default ${node.verdict === v ? on : off} ${
                        !onSetState && node.verdict !== v ? "opacity-40" : ""
                      }`}
                    >
                      <Icon className="h-3 w-3 inline mr-1" />{label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* How a step or a dropped node closed */}
        {(!node.ask || state === "dropped") && outcome && (
          <div className="rounded-xl bg-muted/10 border border-white/5 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              {state === "dropped" ? "Dropped because" : "Closed with"}
            </p>
            <p className="text-xs text-foreground/80 break-words">{outcome}</p>
          </div>
        )}

        {/* Link */}
        <div className="rounded-xl bg-muted/10 border border-white/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Link</p>
          </div>
          {editingUrl ? (
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={saveUrl}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) saveUrl();
                if (e.key === "Escape") { setUrl(node.url || ""); setEditingUrl(false); }
              }}
              placeholder="https://..."
              className="w-full bg-muted/20 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
            />
          ) : node.url ? (
            <div className="flex items-center gap-2">
              <img
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`}
                alt=""
                className="w-4 h-4 flex-shrink-0 rounded-sm"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <a
                href={hrefOf(node.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <span className="truncate">{domain || node.url}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
              <button type="button" onClick={() => setEditingUrl(true)} className="text-muted-foreground hover:text-foreground transition-colors">
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setEditingUrl(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              + Add link
            </button>
          )}
        </div>

        {/* Path mentions (hidden while Paths is switched off) */}
        <PlanningMentions
          mentions={node.mentions || []}
          onChange={(next: PlanningMention[]) => onUpdate(node.id, { mentions: next })}
        />

        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Notes</p>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onFocus={() => { focused.current = "notes"; }}
            onBlur={saveNotes}
            placeholder="Context, links, what you found…"
            className="min-h-[120px] bg-muted/10 border-white/10 text-sm resize-none focus:border-primary/50"
          />
        </div>

        <p className="text-[10px] text-muted-foreground">
          Created {new Date(node.created_at).toLocaleDateString()}
          {node.closed_at && <> · {state === "dropped" ? "dropped" : "closed"} {new Date(node.closed_at).toLocaleDateString()}</>}
        </p>
      </div>
    </>
  );
}
