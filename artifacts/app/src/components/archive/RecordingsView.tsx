import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { useTranscriptSearch } from "@/hooks/useKnowledgeOS";
import { clock, durationLabel, obsidianUri, recordingNote, type RecordingRow, type Session } from "@/lib/kos-vault";
import TranscriptPanel, { highlight } from "./kos/TranscriptPanel";

export interface RecordingFocus {
  note: string;
  seconds: number | null;
  /** Changes on every request, so asking for the same moment twice still scrolls. */
  n: number;
}

interface Props {
  sessions: Session[];
  loading: boolean;
  failed: boolean;
  /** The vault's name, for Obsidian links; null until the tracker has mirrored a note. */
  vault: string | null;
  focus: RecordingFocus | null;
  onShowKnowledge: (sessionKey: string) => void;
  onRefresh: () => void;
}

const PAGE = 20;

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "⏳ Waiting for Claude", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  processed: { label: "✓ Processed", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
};

const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const day = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/**
 * Recorded sessions (one lecture recorded in parts is one session), kept out of
 * the Library so they never crowd it. A transcript stays folded until asked
 * for: it is the source the knowledge notes cite, not something to read.
 */
export default function RecordingsView({ sessions, loading, failed, vault, focus, onShowKnowledge, onRefresh }: Props) {
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState<Map<string, number | null>>(new Map());
  const [limit, setLimit] = useState(PAGE);
  const cards = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const t = setTimeout(() => setTerm(query), 400);
    return () => clearTimeout(t);
  }, [query]);
  const search = useTranscriptSearch(term);

  const rows = useMemo(() => new Map(sessions.flatMap((s) => s.parts.map((p) => [p.id, { row: p, session: s }] as const))), [sessions]);

  const showPart = (id: string, at: number | null) => setOpen((m) => new Map(m).set(id, at));
  const togglePart = (id: string) =>
    setOpen((m) => {
      const next = new Map(m);
      if (next.has(id)) next.delete(id);
      else next.set(id, null);
      return next;
    });

  // A knowledge note asked for a moment: open that part there and bring its session into view.
  useEffect(() => {
    if (!focus) return;
    const i = sessions.findIndex((s) => s.parts.some((p) => recordingNote(p) === focus.note));
    if (i < 0) return;
    const part = sessions[i].parts.find((p) => recordingNote(p) === focus.note)!;
    if (i >= limit) setLimit(i + 1);
    showPart(part.id, focus.seconds);
    requestAnimationFrame(() => cards.current.get(sessions[i].key)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, sessions]);

  if (loading) return <p className="text-center py-12 text-muted-foreground text-sm">Loading recordings…</p>;
  if (failed) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm space-y-2">
        <p>Could not load the recordings.</p>
        <button onClick={onRefresh} className="text-primary hover:underline">Try again</button>
      </div>
    );
  }
  if (!sessions.length) {
    return (
      <div className="text-center py-12 text-muted-foreground space-y-2">
        <span className="text-3xl block">🎙️</span>
        <p>No recordings yet.</p>
        <p className="text-xs max-w-md mx-auto">
          The PC tracker transcribes every new MP3 in your recordings folder (Documents\Bandicam) and files it in the Obsidian vault.
          Installed the tracker before 7 Oct? Download it again from Stats → Komputer i telefon.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 glass-card px-3 py-2 flex-[1_1_14rem] min-w-0">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search what was said (3+ letters)"
            aria-label="Search transcripts"
            className="bg-transparent outline-none text-sm flex-1 min-w-0"
          />
        </label>
        <button onClick={onRefresh} className="glass-card p-2 text-muted-foreground hover:text-foreground" title="Reload" aria-label="Reload">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {search.results && (
        <section className="glass-card p-4 space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {search.results.length ? `Said in ${search.results.length} recording${search.results.length === 1 ? "" : "s"}` : search.loading ? "Searching…" : "Not found in any transcript"}
          </h3>
          {search.results.map((r) => {
            const hit = rows.get(r.id);
            if (!hit) return null;
            const needle = term.trim().toLowerCase();
            const segs = r.segments.filter((s) => s.text.toLowerCase().includes(needle)).slice(0, 3);
            return (
              <div key={r.id} className="space-y-1">
                <p className="text-xs font-medium">
                  {hit.session.note?.topic || day(hit.session.start)} · part {hit.row.part}
                </p>
                {(segs.length ? segs : r.segments.slice(0, 1)).map((s) => (
                  <button
                    key={s.start}
                    onClick={() => {
                      showPart(r.id, s.start);
                      cards.current.get(hit.session.key)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="flex w-full gap-2 text-left text-[13px] text-foreground/80 hover:text-foreground"
                  >
                    <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground pt-[3px]">{clock(s.start)}</span>
                    <span className="line-clamp-2">{highlight(s.text, term)}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </section>
      )}

      <div className="space-y-3">
        {sessions.slice(0, limit).map((s) => {
          const status = s.note ? STATUS[s.note.status] ?? { label: s.note.status, cls: "border-border/50 text-muted-foreground" } : null;
          return (
            <div
              key={s.key}
              ref={(el) => {
                if (el) cards.current.set(s.key, el);
                else cards.current.delete(s.key);
              }}
              className="glass-card p-4 space-y-3 scroll-mt-24"
            >
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{s.note?.topic || `Recorded ${time(s.start)}`}</p>
                  <p className="text-xs text-muted-foreground">
                    {day(s.start)}, {time(s.start)} · {s.parts.length} part{s.parts.length === 1 ? "" : "s"} · {durationLabel(s.seconds)}
                    {s.parts[0].language && ` · ${s.parts[0].language.toUpperCase().slice(0, 2)}`}
                  </p>
                </div>
                {status && <span className={`text-[11px] rounded-md border px-2 py-0.5 ${status.cls}`}>{status.label}</span>}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                {s.knowledge.length > 0 && (
                  <button onClick={() => onShowKnowledge(s.key)} className="rounded-md bg-primary/10 px-2 py-1 text-primary hover:bg-primary/20">
                    🧠 {s.knowledge.length} note{s.knowledge.length === 1 ? "" : "s"}
                  </button>
                )}
                {s.note && (
                  <a href={obsidianUri(s.note.vault, s.note.path)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Session note
                  </a>
                )}
              </div>

              <ul className="space-y-2">
                {s.parts.map((p) => (
                  <Part key={p.id} row={p} vault={s.note?.vault ?? vault} at={open.get(p.id)} isOpen={open.has(p.id)} onToggle={() => togglePart(p.id)} mark={term} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {sessions.length > limit && (
        <button onClick={() => setLimit(limit + PAGE)} className="mx-auto block text-xs text-primary hover:underline">
          Show older ({sessions.length - limit})
        </button>
      )}
    </div>
  );
}

function Part({
  row,
  vault,
  at,
  isOpen,
  onToggle,
  mark,
}: {
  row: RecordingRow;
  vault: string | null;
  at: number | null | undefined;
  isOpen: boolean;
  onToggle: () => void;
  mark: string;
}) {
  const start = new Date(row.recorded_at);
  return (
    <li className="rounded-lg border border-border/40 px-3 py-2 space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-medium text-foreground">Part {row.part}</span>
        <span className="text-muted-foreground">
          {time(start)} · {durationLabel(row.duration_seconds)}
        </span>
        <span className="text-muted-foreground/70 truncate max-w-[16rem]" title={row.file_name}>{row.file_name}</span>
        <span className="ml-auto flex items-center gap-3">
          {vault && (
            <a href={obsidianUri(vault, `Recordings/${recordingNote(row)}.md`)} className="text-muted-foreground hover:text-foreground" title="Open in Obsidian">
              <ExternalLink className="h-3.5 w-3.5" aria-label="Open in Obsidian" />
            </a>
          )}
          <button onClick={onToggle} className="text-primary hover:underline">
            {isOpen ? "Hide transcript" : "Transcript"}
          </button>
        </span>
      </div>
      {isOpen && <TranscriptPanel recordingId={row.id} at={at ?? null} mark={mark.trim().length >= 3 ? mark : undefined} />}
    </li>
  );
}
