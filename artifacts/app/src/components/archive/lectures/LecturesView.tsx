import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import {
  fold,
  groupLectures,
  staleSessions,
  type CourseGroup,
  type LectureSummary,
  type RecordingRow,
  type VaultIndex,
} from "@/lib/kos-vault";
import HealthLine from "./HealthLine";
import KnowledgePopover from "./KnowledgePopover";
import LectureReader from "./LectureReader";
import { InlineMarkdown } from "./LectureMarkdown";
import { slug } from "./markdown";
import { LanguageFlag, longDate } from "./lecture-meta";
import { downloadCoursePack, type StudySource } from "./study-actions";
import { readMode, saveMode, type LecturesMode } from "./concepts";

// The Pojęcia view is its own chunk, fetched when the list is first shown so the switch feels instant.
const loadConcepts = () => import("./ConceptsView");
const ConceptsView = lazy(loadConcepts);

export interface LecturesViewProps {
  index: VaultIndex | null;
  loading: boolean;
  failed: boolean;
  recordings: RecordingRow[];
  /** The summary open in the reader (its vault path), or null for the list. */
  openPath: string | null;
  onOpen: (path: string | null) => void;
  onOpenRecording: (note: string, seconds: number | null, paragraph?: number) => void;
  /** The settings and transcripts behind the reader's ChatGPT / Claude buttons. */
  study: StudySource;
  onRefresh: () => void;
}

const SOURCE_ICON = { recording: "🎙", import: "📄", youtube: "▶️" } as const;
const NOTE_CHIPS = 12;

/**
 * Archive > Wykłady: one summary per lecture, grouped by course, newest
 * first, the course's textbook first in its group, and a reader for one of
 * them. They come from the Claude routine in the Obsidian vault (Lectures/,
 * older ones in Sessions/Summary …), mirrored by the PC tracker; the vault
 * stays the place to edit them. Each course downloads as one study pack.
 */
function LecturesView({ index, loading, failed, recordings, openPath, onOpen, onOpenRecording, study, onRefresh }: LecturesViewProps) {
  const [query, setQuery] = useState("");
  const [mode, setModeState] = useState<LecturesMode>(readMode);
  const [conceptQuery, setConceptQuery] = useState("");
  const [noteName, setNoteName] = useState<string | null>(null);
  const setMode = useCallback((m: LecturesMode) => {
    setModeState(m);
    saveMode(m);
  }, []);
  useEffect(() => {
    void loadConcepts();
  }, []);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const lectures = useMemo(() => index?.lectures ?? [], [index]);
  const textbooks = useMemo(() => index?.textbooks ?? [], [index]);
  const groups = useMemo(() => groupLectures(lectures, query, textbooks), [lectures, query, textbooks]);
  // A course pack holds the whole course, whatever the search shows.
  const fullGroups = useMemo(() => new Map(groupLectures(lectures, "", textbooks).map((g) => [g.course, g])), [lectures, textbooks]);
  const open = openPath ? index?.lectureByPath.get(openPath.replace(/\.md$/i, "").toLowerCase()) ?? null : null;
  const waiting = useMemo(() => (index ? [...index.sessions.values()].filter((s) => s.status === "new").length : 0), [index]);
  const stale = useMemo(() => (index ? staleSessions(index, now) : []), [index, now]);

  const notes = useMemo(() => {
    const words = fold(query).split(/\s+/).filter((w) => w.length >= 2);
    if (!index || words.length === 0) return [];
    return index.notes
      .filter((n) => {
        const hay = fold(`${n.title}\n${n.aliases.join("\n")}\n${n.body}`);
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => Number(fold(b.title).includes(words[0])) - Number(fold(a.title).includes(words[0])) || a.title.localeCompare(b.title));
  }, [index, query]);

  const openLecture = useCallback((path: string) => onOpen(path), [onOpen]);
  const back = useCallback(() => onOpen(null), [onOpen]);

  if (loading) return <p className="py-12 text-center text-sm text-muted-foreground">Wczytuję wykłady…</p>;
  if (failed) {
    return (
      <div className="space-y-2 py-12 text-center text-sm text-muted-foreground">
        <p>Nie udało się wczytać notatek ze skarbca.</p>
        <button onClick={onRefresh} className="text-primary hover:underline">Spróbuj ponownie</button>
      </div>
    );
  }

  if (open && index) {
    return (
      <LectureReader
        lecture={open}
        index={index}
        recordings={recordings}
        onBack={back}
        onOpenLecture={openLecture}
        onOpenRecording={onOpenRecording}
        study={study}
      />
    );
  }

  const toggle = (
    <div role="tablist" aria-label="Widok" className="glass-card inline-flex gap-1 p-1 text-sm">
      {(
        [
          ["lectures", "🎓 Wykłady"],
          ["concepts", `💡 Pojęcia${index ? ` ${index.notes.length}` : ""}`],
        ] as const
      ).map(([m, label]) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          onClick={() => setMode(m)}
          data-mode={m}
          className={`rounded-lg px-3 py-1 transition-colors ${mode === m ? "bg-primary/20 font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (mode === "concepts" && index) {
    return (
      <div className="space-y-4">
        {!noteName && toggle}
        <Suspense fallback={<p className="py-12 text-center text-sm text-muted-foreground">Wczytuję pojęcia…</p>}>
          <ConceptsView
            index={index}
            query={conceptQuery}
            onQuery={setConceptQuery}
            openName={noteName}
            onOpenNote={setNoteName}
            onOpenLecture={openLecture}
            onOpenRecording={onOpenRecording}
          />
        </Suspense>
      </div>
    );
  }

  const health = <HealthLine log={index?.routineLog ?? null} waiting={waiting} stale={stale} now={now} />;

  if (!lectures.length && !textbooks.length) {
    return (
      <div className="space-y-4">
        {toggle}
        {health}
        <div className="space-y-2 py-10 text-center text-muted-foreground">
          <span className="block text-3xl">🎓</span>
          <p>Nie ma jeszcze podsumowań wykładów.</p>
          <p className="mx-auto max-w-md text-xs">
            Rutyna Claude pisze je w skarbcu Obsidiana (folder Lectures/) z nagrań i plików wrzuconych do folderu Import. Tracker na
            komputerze kopiuje je tutaj co minutę.
          </p>
        </div>
      </div>
    );
  }

  const count = groups.reduce((n, g) => n + g.lectures.length, 0);
  return (
    <div className="space-y-4">
      {toggle}
      {health}
      <div className="flex flex-wrap items-center gap-2">
        <label className="glass-card flex min-w-0 flex-[1_1_14rem] items-center gap-2 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj: kurs, temat, treść"
            aria-label="Szukaj w wykładach"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <button onClick={onRefresh} className="glass-card p-2 text-muted-foreground hover:text-foreground" title="Wczytaj ponownie" aria-label="Wczytaj ponownie">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {query.trim() && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {count === 0 ? "Żaden wykład nie pasuje." : `Pasujące wykłady: ${count}`}
        </p>
      )}

      {notes.length > 0 && (
        <section className="space-y-1.5" aria-label="Pasujące pojęcia">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pojęcia ({notes.length})</h3>
          <div className="flex flex-wrap gap-1.5">
            {notes.slice(0, NOTE_CHIPS).map((n) => (
              <KnowledgePopover
                key={n.path}
                note={n}
                lang="pl"
                className="rounded-md border border-border/50 px-2 py-1 text-xs text-foreground/85 hover:border-primary/40 hover:text-foreground"
              >
                {n.title}
              </KnowledgePopover>
            ))}
            {notes.length > NOTE_CHIPS && <span className="self-center text-xs text-muted-foreground">+{notes.length - NOTE_CHIPS}</span>}
          </div>
        </section>
      )}

      {groups.map((g) => {
        const whole = fullGroups.get(g.course) ?? g;
        return (
          <section key={g.course} className="space-y-2" aria-labelledby={`course-${slug(g.course)}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 id={`course-${slug(g.course)}`} className="flex items-baseline gap-2 text-sm font-bold text-foreground">
                {g.course}
                <span className="text-xs font-normal text-muted-foreground">{g.lectures.length}</span>
              </h3>
              {whole.lectures.length + (whole.textbook ? 1 : 0) > 0 && (
                <button
                  type="button"
                  onClick={() => downloadCoursePack(whole)}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  title="Cały przedmiot w jednym pliku .md: podręcznik, wszystkie podsumowania i słowniczek. Do projektu w ChatGPT albo Claude."
                  data-course-pack={g.course}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> Pakiet przedmiotu
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {g.textbook && <TextbookCard textbook={g.textbook} group={whole} onOpen={() => onOpen(g.textbook!.path)} />}
              {g.lectures.map((l) => (
                <LectureCard key={l.path} lecture={l} onOpen={() => onOpen(l.path)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LectureCard({ lecture, onOpen }: { lecture: LectureSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass-card flex flex-col gap-1 border border-transparent p-4 text-left transition-all hover:border-primary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{lecture.course ?? "Inne"}</span>
        {lecture.date && <span className="shrink-0">· {longDate(lecture.date, "pl-PL", "short")}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <LanguageFlag lang={lecture.language} />
          <span title={lecture.source} aria-hidden="true">{SOURCE_ICON[lecture.source]}</span>
        </span>
      </span>
      <span className="text-sm font-semibold leading-snug text-foreground" lang={lecture.language}>{lecture.topic}</span>
      {lecture.short && (
        <span className="line-clamp-3 text-xs leading-5 text-foreground/75" lang={lecture.language}>
          <InlineMarkdown text={lecture.short} lang={lecture.language} />
        </span>
      )}
    </button>
  );
}

/** The course's textbook, first in its group: how many of the course's lectures it already covers. */
function TextbookCard({ textbook, group, onOpen }: { textbook: LectureSummary; group: CourseGroup; onOpen: () => void }) {
  const pl = textbook.language === "pl";
  const names = new Set(textbook.summaries.map((s) => (s.split("/").pop() ?? s).toLowerCase()));
  const covered = group.lectures.filter((l) => names.has(l.name.toLowerCase())).length;
  const total = group.lectures.length;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-textbook={textbook.path}
      className="glass-card flex flex-col gap-1 border border-sky-400/30 bg-sky-400/[0.04] p-4 text-left transition-all hover:border-sky-300/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-semibold text-sky-200">📘 {pl ? "Podręcznik" : "Textbook"}</span>
        {textbook.date && <span className="shrink-0">· {longDate(textbook.date, pl ? "pl-PL" : "en-GB", "short")}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <LanguageFlag lang={textbook.language} />
        </span>
      </span>
      <span className="text-sm font-semibold leading-snug text-foreground" lang={textbook.language}>{textbook.topic}</span>
      {textbook.short && (
        <span className="line-clamp-2 text-xs leading-5 text-foreground/75" lang={textbook.language}>
          <InlineMarkdown text={textbook.short} lang={textbook.language} />
        </span>
      )}
      {textbook.summaries.length > 0 && total > 0 && (
        <span className={`text-[11px] ${covered < total ? "text-amber-200/90" : "text-muted-foreground"}`} lang={textbook.language}>
          {pl
            ? covered < total
              ? `Obejmuje ${covered} z ${total} ${total === 1 ? "wykładu" : "wykładów"}; rutyna go uzupełni.`
              : `Obejmuje wszystkie wykłady (${total}).`
            : covered < total
              ? `Covers ${covered} of ${total} ${total === 1 ? "lecture" : "lectures"}; the routine will update it.`
              : `Covers every lecture (${total}).`}
        </span>
      )}
    </button>
  );
}

export default memo(LecturesView);
