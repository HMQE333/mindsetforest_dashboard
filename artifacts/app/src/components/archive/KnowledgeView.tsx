import { useMemo, useState, type ReactNode } from "react";
import { ExternalLink, RefreshCw, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  obsidianUri,
  recordingNote,
  sourceLabel,
  typeInfo,
  type KnowledgeNote,
  type RecordingRow,
  type Session,
  type SourceRef,
  type VaultIndex,
} from "@/lib/kos-vault";
import VaultMarkdown from "./kos/VaultMarkdown";
import TranscriptPanel from "./kos/TranscriptPanel";

interface Props {
  index: VaultIndex | null;
  loading: boolean;
  failed: boolean;
  recordings: RecordingRow[];
  sessions: Session[];
  sessionFilter: string | null;
  onClearSession: () => void;
  onOpenRecording: (note: string, seconds: number | null) => void;
  onRefresh: () => void;
}

const CONFIDENCE: Record<string, { dot: string; label: string }> = {
  high: { dot: "bg-emerald-400", label: "High confidence" },
  medium: { dot: "bg-amber-400", label: "Medium confidence" },
  low: { dot: "bg-rose-400", label: "Low confidence" },
};

const PAGE = 60;

/**
 * The atomic notes the Claude routine writes in the vault's Knowledge/ folder,
 * as the tracker mirrors them. Read-only: the vault is the source, so every note
 * has "Open in Obsidian" for editing. Each cited moment opens the transcript
 * right there, which is what the raw transcripts are kept for.
 */
export default function KnowledgeView({
  index,
  loading,
  failed,
  recordings,
  sessions,
  sessionFilter,
  onClearSession,
  onOpenRecording,
  onRefresh,
}: Props) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [openName, setOpenName] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const notes = index?.notes ?? [];
  const session = sessionFilter ? sessions.find((s) => s.key === sessionFilter) ?? null : null;
  const pool = useMemo(() => (session ? session.knowledge : notes), [session, notes]);

  const types = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of pool) m.set(n.type, (m.get(n.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [pool]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool
      .filter((n) => (type === null || n.type === type) && (!q || `${n.title}\n${n.body}`.toLowerCase().includes(q)))
      .sort((a, b) => (b.created ?? b.modified).localeCompare(a.created ?? a.modified) || a.title.localeCompare(b.title));
  }, [pool, type, query]);

  const open = openName ? index?.byName.get(openName.toLowerCase()) ?? null : null;

  if (loading) return <p className="text-center py-12 text-muted-foreground text-sm">Loading knowledge…</p>;
  if (failed) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm space-y-2">
        <p>Could not load the vault notes.</p>
        <button onClick={onRefresh} className="text-primary hover:underline">Try again</button>
      </div>
    );
  }
  if (!notes.length) {
    return (
      <div className="text-center py-12 text-muted-foreground space-y-2">
        <span className="text-3xl block">🧠</span>
        <p>No knowledge notes yet.</p>
        <p className="text-xs max-w-md mx-auto">
          The Claude routine turns each recording into atomic notes in your Obsidian vault (Knowledge/). The PC tracker copies them here
          every minute. Installed the tracker before 7 Oct? Download it again from Stats → Komputer i telefon.
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
            onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
            placeholder="Search knowledge"
            aria-label="Search knowledge"
            className="bg-transparent outline-none text-sm flex-1 min-w-0"
          />
        </label>
        <button onClick={onRefresh} className="glass-card p-2 text-muted-foreground hover:text-foreground" title="Reload from the vault copy" aria-label="Reload">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {session && (
        <div className="flex items-center gap-2 text-xs rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
          <span className="truncate">
            From the session <span className="font-semibold">{session.note?.topic || session.key}</span> ({session.knowledge.length})
          </span>
          <button onClick={onClearSession} className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Show all notes">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Chip active={type === null} onClick={() => setType(null)}>All {pool.length}</Chip>
        {types.map(([t, n]) => (
          <Chip key={t} active={type === t} onClick={() => setType(type === t ? null : t)}>
            {typeInfo(t).icon} {typeInfo(t).label} {n}
          </Chip>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground text-sm">No notes match.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {shown.slice(0, limit).map((n) => (
            <NoteCard key={n.path} note={n} linked={linkedCount(n, index)} onOpen={() => setOpenName(n.name)} />
          ))}
        </div>
      )}
      {shown.length > limit && (
        <button onClick={() => setLimit(limit + PAGE)} className="mx-auto block text-xs text-primary hover:underline">
          Show more ({shown.length - limit})
        </button>
      )}

      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpenName(null)}>
        {open && (
          <NoteDialog
            key={open.path}
            note={open}
            index={index!}
            recordings={recordings}
            onNote={setOpenName}
            onOpenRecording={(note, s) => { setOpenName(null); onOpenRecording(note, s); }}
          />
        )}
      </Dialog>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
        active ? "bg-primary/20 text-foreground border border-primary/40" : "text-muted-foreground border border-border/50 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** Other notes this one is connected to, either way, each counted once. */
function linkedCount(n: KnowledgeNote, index: VaultIndex | null): number {
  const names = new Set([...n.links, ...(index?.backlinks.get(n.name) ?? [])].map((x) => x.toLowerCase()));
  return [...names].filter((x) => index?.byName.has(x)).length;
}

function NoteCard({ note, linked, onOpen }: { note: KnowledgeNote; linked: number; onOpen: () => void }) {
  const t = typeInfo(note.type);
  const conf = note.confidence ? CONFIDENCE[note.confidence] : null;
  return (
    <button
      onClick={onOpen}
      className={`flex flex-col text-left glass-card p-4 border transition-all hover:border-primary/30 ${
        note.type === "contradiction" ? "border-rose-500/30" : "border-transparent"
      }`}
    >
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{t.icon} {t.label}</span>
        {conf && <span className={`h-1.5 w-1.5 rounded-full ${conf.dot}`} title={conf.label} aria-label={conf.label} />}
        <span className="ml-auto tabular-nums">
          {[note.sources.length > 0 && `🎙 ${note.sources.length}`, linked > 0 && `↔ ${linked}`].filter(Boolean).join(" · ")}
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold text-foreground">{note.title}</p>
      {note.summary && <p className="mt-1 text-xs text-foreground/75 line-clamp-3">{note.summary}</p>}
      {note.quote && <p className="mt-2 text-xs italic text-muted-foreground line-clamp-2 border-l-2 border-primary/40 pl-2">“{note.quote}”</p>}
    </button>
  );
}

function NoteDialog({
  note,
  index,
  recordings,
  onNote,
  onOpenRecording,
}: {
  note: KnowledgeNote;
  index: VaultIndex;
  recordings: RecordingRow[];
  onNote: (name: string) => void;
  onOpenRecording: (note: string, seconds: number | null) => void;
}) {
  const [shownSource, setShownSource] = useState<string | null>(null);
  const t = typeInfo(note.type);
  const conf = note.confidence ? CONFIDENCE[note.confidence] : null;
  const byNote = useMemo(() => new Map(recordings.map((r) => [recordingNote(r), r.id])), [recordings]);
  const backlinks = index.backlinks.get(note.name) ?? [];
  const has = (name: string) => index.byName.has(name.toLowerCase());
  const key = (s: SourceRef) => `${s.note}|${s.seconds}`;
  const show = (s: SourceRef) => setShownSource((cur) => (cur === key(s) ? null : key(s)));

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogDescription className="flex items-center gap-2 text-xs">
          <span>{t.icon} {t.label}</span>
          {conf && <span className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${conf.dot}`} />{conf.label}</span>}
          {note.created && <span>· {note.created}</span>}
        </DialogDescription>
        <DialogTitle className="text-lg">{note.title}</DialogTitle>
      </DialogHeader>

      <VaultMarkdown text={note.body} hasNote={has} onNote={onNote} onSource={show} />

      {note.sources.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Said in</h4>
          {note.sources.map((s) => {
            const open = shownSource === key(s);
            const id = byNote.get(s.note) ?? null;
            return (
              <div key={key(s)} className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <button onClick={() => show(s)} className="rounded-md bg-primary/10 px-2 py-1 text-primary hover:bg-primary/20">
                    🎙 {sourceLabel(s)} {open ? "▴" : "▾"}
                  </button>
                  {id && (
                    <button onClick={() => onOpenRecording(s.note, s.seconds)} className="text-muted-foreground hover:text-foreground">
                      Full transcript →
                    </button>
                  )}
                </div>
                {open && <TranscriptPanel recordingId={id} at={s.seconds} context />}
              </div>
            );
          })}
        </section>
      )}

      {backlinks.length > 0 && (
        <section className="space-y-1">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Linked from</h4>
          <div className="flex flex-wrap gap-1.5">
            {backlinks.map((b) => (
              <button key={b} onClick={() => onNote(b)} className="text-xs rounded-md border border-border/50 px-2 py-1 hover:border-primary/40">
                {typeInfo(index.byName.get(b.toLowerCase())?.type ?? "").icon} {b}
              </button>
            ))}
          </div>
        </section>
      )}

      <a href={obsidianUri(note.vault, note.path)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        Open in Obsidian (edit there)
      </a>
    </DialogContent>
  );
}
