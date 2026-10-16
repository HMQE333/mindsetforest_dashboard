import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { pasteStructure, setKindUnder, type LineKind, type PasteRow } from "@/lib/planning-model";
import PlanningMarker, { lookOfLine } from "./PlanningMarker";

const CYCLE: LineKind[] = ["step", "question", "settled", "note"];
const KIND_LABEL: Record<LineKind, string> = { step: "step", question: "question", settled: "settled", note: "note" };
const nextKind = (k: LineKind) => CYCLE[(CYCLE.indexOf(k) + 1) % CYCLE.length];

interface Props {
  open: boolean;
  /** parsePaste of what was pasted. */
  rows: PasteRow[];
  /** Where the rows will land, e.g. `under "Grow RybiaPaka"` or `at the top of 📥 Inbox`. */
  target: string;
  /** The title of the row the paste goes under (null or absent = the top level), for the notes' labels. */
  parentTitle?: string | null;
  onCancel: () => void;
  /** insertTree; resolve true to close the preview. */
  onInsert: (rows: PasteRow[]) => Promise<boolean> | boolean;
}

/**
 * A multi-line paste, shown as the tree it will become before anything is
 * written. His real specs are Markdown whose open questions often do not end in
 * '?', so nothing is inferred from words: one tap on a marker cycles that row
 * step → question → settled → note, and one tap on a heading's chip sets its
 * whole section. Insert is one insertTree; Cancel writes nothing.
 */
export default function PlanningPastePreview({ open, rows, target, parentTitle = null, onCancel, onInsert }: Props) {
  const [draft, setDraft] = useState<PasteRow[]>(rows);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(rows);
      setBusy(false);
    }
  }, [open, rows]);

  const tally = useMemo(() => {
    const t: Record<LineKind, number> = { step: 0, question: 0, settled: 0, note: 0 };
    for (const r of draft) t[r.line.kind]++;
    return t;
  }, [draft]);
  // Where each note will go, resolved exactly as insertTree does (its parent, not simply the row above).
  const shape = useMemo(() => pasteStructure(draft, parentTitle != null), [draft, parentTitle]);
  const nodeCount = shape.node.filter(Boolean).length;
  const noteLabel = (i: number): string => {
    if (shape.node[i]) return "added as a step";
    const p = shape.parent[i];
    const title = p !== null ? draft[p].line.title : parentTitle;
    return title ? `note for “${title.length > 40 ? `${title.slice(0, 40)}…` : title}”` : "note";
  };

  const cycle = (i: number) =>
    setDraft((prev) => prev.map((r, j) => (j === i ? { ...r, line: { ...r.line, kind: nextKind(r.line.kind) } } : r)));

  const insert = async () => {
    if (busy || draft.length === 0) return;
    setBusy(true);
    const ok = await onInsert(draft);
    setBusy(false);
    if (ok) onCancel();
  };

  const summary = (["step", "question", "settled", "note"] as LineKind[])
    .filter((k) => tally[k] > 0)
    .map((k) => `${tally[k]} ${KIND_LABEL[k]}${tally[k] === 1 || k === "settled" ? "" : "s"}`)
    .join(" · ");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent className="glass-card border-white/10 max-w-2xl w-[calc(100vw-2rem)] max-h-[85vh] flex flex-col gap-3 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-foreground">Paste as a list</DialogTitle>
          <DialogDescription className="text-xs">
            {draft.length} {draft.length === 1 ? "line" : "lines"}, {target}. Tap a marker to change what a line is
            waiting for; a heading's chips set its whole section.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-0.5">
          {draft.map((r, i) => {
            const isNote = r.line.kind === "note";
            const answer = r.line.kind === "settled" && r.line.outcome && r.line.outcome !== r.line.title ? r.line.outcome : null;
            return (
              <div key={i} style={{ paddingLeft: `${Math.min(r.depth, 8) * 18}px` }}>
                <div className="flex items-start gap-2 py-1 px-2 rounded-lg hover:bg-white/5">
                  <PlanningMarker
                    look={lookOfLine(r.line.kind)}
                    onClick={() => cycle(i)}
                    title={`${KIND_LABEL[r.line.kind]}: tap for ${KIND_LABEL[nextKind(r.line.kind)]}`}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm break-words ${
                      isNote ? "text-muted-foreground italic" : r.heading ? "font-semibold text-foreground" : "text-foreground"
                    }`}>
                      {r.line.title || <span className="text-muted-foreground">(empty)</span>}
                      {r.line.kind === "question" && r.line.guess && (
                        <span className="text-muted-foreground font-normal"> ~ {r.line.guess}</span>
                      )}
                      {answer && <span className="text-muted-foreground font-normal"> = {answer}</span>}
                      {isNote && <span className="not-italic text-[10px] tracking-wide ml-2 text-muted-foreground/70">{noteLabel(i)}</span>}
                    </p>
                    {r.heading && (
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <span className="text-[10px] text-muted-foreground mr-0.5">all below:</span>
                        {CYCLE.map((k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setDraft((prev) => setKindUnder(prev, i, k))}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md border border-white/10 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/10 transition-all"
                          >
                            {KIND_LABEL[k]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between gap-2 border-t border-white/5 pt-3">
          <p className="text-[11px] text-muted-foreground min-w-0 truncate">{summary}</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={insert}
              disabled={busy || draft.length === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-bold gradient-purple text-primary-foreground disabled:opacity-50 transition-all"
            >
              {busy ? "Inserting…" : nodeCount === 0 ? "Add as notes" : nodeCount === 1 ? "Insert 1 row" : `Insert ${nodeCount} rows`}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
