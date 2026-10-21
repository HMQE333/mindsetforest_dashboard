import { memo, useCallback, useEffect, useMemo } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Search } from "lucide-react";
import { obsidianUri, sourceLabel, typeInfo, type KnowledgeNote, type LectureSummary, type VaultIndex, type WikiLink } from "@/lib/kos-vault";
import { resolveLink } from "@/lib/kos-vault";
import LectureMarkdown, { useLectureLayout, type LinkHandlers } from "./LectureMarkdown";
import { TYPE_PL } from "./KnowledgePopover";
import { slug } from "./markdown";
import { filterNotes, groupNotes, neighbours } from "./concepts";

export interface ConceptsViewProps {
  index: VaultIndex;
  query: string;
  onQuery: (q: string) => void;
  /** The note open in the reader (its name), or null for the cards. */
  openName: string | null;
  onOpenNote: (name: string | null) => void;
  onOpenLecture: (path: string) => void;
  onOpenRecording: (note: string, seconds: number | null, paragraph?: number) => void;
}

const typeLabel = (type: string) => (type ? `${typeInfo(type).icon} ${TYPE_PL[type] ?? typeInfo(type).label}` : "");

/**
 * Wykłady > Pojęcia: every atomic note of the vault's Knowledge/ folder as a
 * card, grouped by course, with a reader that walks them in the order shown.
 */
function ConceptsView({ index, query, onQuery, openName, onOpenNote, onOpenLecture, onOpenRecording }: ConceptsViewProps) {
  const shown = useMemo(() => filterNotes(index.notes, query), [index, query]);
  const groups = useMemo(() => groupNotes(shown), [shown]);
  const order = useMemo(() => groups.flatMap((g) => g.notes), [groups]);
  const open = openName ? index.byName.get(openName.toLowerCase()) ?? null : null;

  if (open) {
    // Walking past the filter's end is not possible; a note opened by a link outside it walks the whole set.
    const walk = order.some((n) => n.name === open.name) ? order : groupNotes(index.notes).flatMap((g) => g.notes);
    return (
      <ConceptReader
        note={open}
        index={index}
        order={walk}
        onOpenNote={onOpenNote}
        onOpenLecture={onOpenLecture}
        onOpenRecording={onOpenRecording}
      />
    );
  }

  return (
    <div className="space-y-4">
      <label className="glass-card flex min-w-0 items-center gap-2 px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Szukaj: pojęcie, kurs, treść"
          aria-label="Szukaj w pojęciach"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </label>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {index.notes.length === 0
          ? "Nie ma jeszcze pojęć. Rutyna Claude zapisuje je w skarbcu (folder Knowledge/)."
          : shown.length === 0
            ? "Żadne pojęcie nie pasuje."
            : query.trim()
              ? `Pasujące pojęcia: ${shown.length} z ${index.notes.length}`
              : `Pojęcia: ${index.notes.length}`}
      </p>
      {groups.map((g) => (
        <section key={g.course} className="space-y-2" aria-labelledby={`concepts-${slug(g.course)}`}>
          <h3 id={`concepts-${slug(g.course)}`} className="flex items-baseline gap-2 text-sm font-bold text-foreground">
            {g.course}
            <span className="text-xs font-normal text-muted-foreground">{g.notes.length}</span>
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {g.notes.map((n) => (
              <NoteCard key={n.path} note={n} onOpen={onOpenNote} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const NoteCard = memo(function NoteCard({ note, onOpen }: { note: KnowledgeNote; onOpen: (name: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(note.name)}
      data-note={note.name}
      className="glass-card flex flex-col gap-1 border border-transparent p-4 text-left transition-all [contain-intrinsic-size:auto_7rem] [content-visibility:auto] hover:border-primary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
        {note.type && <span className="shrink-0">{typeLabel(note.type)}</span>}
        {note.course && <span className="truncate">· {note.course}</span>}
      </span>
      <span className="text-sm font-semibold leading-snug text-foreground">{note.title}</span>
      {note.aliases.length > 0 && <span className="truncate text-[11px] text-muted-foreground">{note.aliases.join(", ")}</span>}
      {note.summary && <span className="line-clamp-3 text-xs leading-5 text-foreground/75">{note.summary}</span>}
    </button>
  );
});

function ConceptReader({
  note,
  index,
  order,
  onOpenNote,
  onOpenLecture,
  onOpenRecording,
}: {
  note: KnowledgeNote;
  index: VaultIndex;
  order: KnowledgeNote[];
  onOpenNote: (name: string | null) => void;
  onOpenLecture: (path: string) => void;
  onOpenRecording: (note: string, seconds: number | null, paragraph?: number) => void;
}) {
  const layout = useLectureLayout(note.body);
  const { prev, next } = useMemo(() => neighbours(order, note.name), [order, note.name]);
  const back = useCallback(() => onOpenNote(null), [onOpenNote]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [note.path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      // A popover or dialog open on the page takes its own keys.
      if (document.querySelector("[role=dialog][data-state=open]")) return;
      if (e.key === "Escape") back();
      else if (e.key === "ArrowLeft" && prev) onOpenNote(prev.name);
      else if (e.key === "ArrowRight" && next) onOpenNote(next.name);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, prev, next, onOpenNote]);

  const links: LinkHandlers = useMemo(
    () => ({
      resolve: (l: WikiLink) => resolveLink(index, l),
      onMoment: (ref) => onOpenRecording(ref.note, ref.seconds, ref.paragraph),
      onLecture: onOpenLecture,
      onNote: (name) => onOpenNote(name),
    }),
    [index, onOpenLecture, onOpenRecording, onOpenNote],
  );

  const related = useMemo(() => {
    const out = note.links.map((l) => index.byName.get(l.toLowerCase())).filter((n): n is KnowledgeNote => !!n);
    const seen = new Set(out.map((n) => n.name));
    const backs = (index.backlinks.get(note.name) ?? [])
      .map((l) => index.byName.get(l.toLowerCase()))
      .filter((n): n is KnowledgeNote => !!n && !seen.has(n.name));
    return { out, backs };
  }, [note, index]);

  // The lectures whose text links to this note.
  const lectures = useMemo(() => {
    const needle = `[[${note.name.toLowerCase()}`;
    return [...index.lectures, ...index.textbooks].filter((l: LectureSummary) => l.body.toLowerCase().includes(needle));
  }, [note.name, index]);

  const chip = "rounded-md border border-border/50 px-2 py-1 hover:border-primary/40 hover:text-foreground";
  const pos = order.findIndex((n) => n.name === note.name);

  return (
    <article className="space-y-4" aria-labelledby="concept-title">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button type="button" onClick={back} className="inline-flex items-center gap-1.5 hover:text-foreground" title="Esc">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Pojęcia
        </button>
        <span className="ml-auto text-xs tabular-nums">{pos >= 0 ? `${pos + 1} / ${order.length}` : ""}</span>
        <button type="button" onClick={() => prev && onOpenNote(prev.name)} disabled={!prev} className="rounded p-1 hover:text-foreground disabled:opacity-30" aria-label="Poprzednie pojęcie" title={prev ? `← ${prev.title}` : undefined}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => next && onOpenNote(next.name)} disabled={!next} className="rounded p-1 hover:text-foreground disabled:opacity-30" aria-label="Następne pojęcie" title={next ? `${next.title} →` : undefined}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <header className="glass-card space-y-2 p-4 sm:p-5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {note.type && <span>{typeLabel(note.type)} ·</span>}
          <span className="font-semibold text-foreground/85">{note.course ?? "Inne"}</span>
          <a href={obsidianUri(note.vault, note.path)} className="ml-auto inline-flex items-center gap-1.5 hover:text-foreground">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Obsidian
          </a>
        </p>
        <h2 id="concept-title" className="text-xl font-bold leading-tight text-foreground sm:text-2xl">{note.title}</h2>
        {note.aliases.length > 0 && <p className="text-xs text-muted-foreground">Też: <span className="text-foreground/85">{note.aliases.join(", ")}</span></p>}
      </header>

      <div className="glass-card p-4 sm:p-6">
        <LectureMarkdown layout={layout} lang="pl" links={links} />
      </div>

      {note.sources.length > 0 && (
        <footer className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Źródło:</span>
          {note.sources.map((s) => (
            <button key={`${s.note}|${s.seconds}|${s.paragraph ?? ""}`} type="button" onClick={() => onOpenRecording(s.note, s.seconds, s.paragraph)} className={chip}>
              🎙 {sourceLabel(s, "pl-PL")} →
            </button>
          ))}
        </footer>
      )}
      {lectures.length > 0 && (
        <footer className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>W wykładach:</span>
          {lectures.map((l) => (
            <button key={l.path} type="button" onClick={() => onOpenLecture(l.path)} className={chip} lang={l.language}>
              🎓 {l.date ? `${l.date} · ` : ""}{l.topic}
            </button>
          ))}
        </footer>
      )}
      {related.out.length > 0 && (
        <footer className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Powiązane:</span>
          {related.out.map((n) => (
            <button key={n.path} type="button" onClick={() => onOpenNote(n.name)} className={chip}>{n.title}</button>
          ))}
        </footer>
      )}
      {related.backs.length > 0 && (
        <footer className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Linkują tutaj:</span>
          {related.backs.map((n) => (
            <button key={n.path} type="button" onClick={() => onOpenNote(n.name)} className={chip}>{n.title}</button>
          ))}
        </footer>
      )}
      <p className="text-center text-[11px] text-muted-foreground">← → poprzednie / następne · Esc wraca do listy</p>
    </article>
  );
}

export default memo(ConceptsView);
