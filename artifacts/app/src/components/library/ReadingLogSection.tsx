import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { describeEntry, logError, nextFromPage, pagesIn, type ReadingLogEntry } from "@/lib/reading-log";

const SHOWN = 5;

interface Props {
  bookId: string;
  pagesRead: number;
  totalPages: number;
  entries: ReadingLogEntry[];
  /** Saves the stretch and moves the bookmark; resolves to whether it worked. */
  onLog: (fromPage: number, toPage: number) => Promise<boolean>;
  onRemove: (id: string) => void;
}

/** "From [124] to [   ] Log", then the last few stretches: "Today · 100 → 123   24 p." */
export default function ReadingLogSection({ bookId, pagesRead, totalPages, entries, onLog, onRemove }: Props) {
  const [from, setFrom] = useState(String(nextFromPage(pagesRead)));
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);

  // A new book, or the bookmark moved (the reader, the assistant): start from the page after it.
  useEffect(() => { setFrom(String(nextFromPage(pagesRead))); setTo(""); }, [bookId, pagesRead]);
  useEffect(() => setAll(false), [bookId]);

  const f = Number(from);
  const t = Number(to);
  const error = to ? logError(f, t, totalPages) : null;

  const submit = async () => {
    if (!to || error || busy) return;
    setBusy(true);
    if (await onLog(f, t)) setTo("");
    setBusy(false);
  };

  const shown = all ? entries : entries.slice(0, SHOWN);

  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">Reading log</label>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>From</span>
        <Input type="number" min={1} value={from} onChange={e => setFrom(e.target.value)} aria-label="From page" className="bg-muted/30 border-white/10 h-8 w-20 text-sm" />
        <span>to</span>
        <Input
          type="number"
          min={1}
          value={to}
          onChange={e => setTo(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
          placeholder="page"
          aria-label="To page"
          className="bg-muted/30 border-white/10 h-8 w-20 text-sm"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!to || !!error || busy}
          className="h-8 px-3 rounded-md bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 disabled:opacity-40 transition-colors"
        >
          Log
        </button>
      </div>
      {error && <p className="text-[11px] text-destructive mt-1">{error}</p>}
      {entries.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {shown.map(e => (
            <li key={e.id} className="group flex items-center gap-2 text-xs">
              <span className="text-foreground/85 tabular-nums">{describeEntry(e)}</span>
              <span className="text-muted-foreground/70 tabular-nums">{pagesIn(e)} p.</span>
              <button
                type="button"
                onClick={() => onRemove(e.id)}
                title="Remove this entry (the bookmark stays)"
                aria-label="Remove entry"
                className="ml-auto opacity-40 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {entries.length > SHOWN && (
        <button type="button" onClick={() => setAll(v => !v)} className="mt-1 text-[11px] text-muted-foreground hover:text-foreground">
          {all ? "Show fewer" : `Show all ${entries.length}`}
        </button>
      )}
    </div>
  );
}
