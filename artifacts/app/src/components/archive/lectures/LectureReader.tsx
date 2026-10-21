import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, X } from "lucide-react";
import {
  obsidianUri,
  recordingNote,
  resolveLink,
  sourceLabel,
  type LectureSummary,
  type RecordingRow,
  type SourceRef,
  type VaultIndex,
  type WikiLink,
} from "@/lib/kos-vault";
import type { StudyMode } from "@/lib/lecture-tutor";
import TranscriptPanel from "../kos/TranscriptPanel";
import LectureMarkdown, { useLectureLayout, type LinkHandlers } from "./LectureMarkdown";
import { LanguageFlag, SourceBadge, longDate } from "./lecture-meta";
import { studyInChatGpt, talkInClaude, type Material, type StudySource } from "./study-actions";

export interface ReaderProps {
  lecture: LectureSummary;
  index: VaultIndex;
  recordings: RecordingRow[];
  onBack: () => void;
  onOpenLecture: (path: string) => void;
  onOpenRecording: (note: string, seconds: number | null, paragraph?: number) => void;
  /** The settings and transcripts the hand-off buttons put in the study pack. */
  study: StudySource;
}

const T = {
  pl: { transcript: "Zapis", full: "Cały zapis", around: "Tylko fragment", inRecordings: "W Nagraniach", close: "Zamknij zapis", recording: "Nagranie", sessions: "Źródło", builtFrom: "Zbudowany z", textbook: "Podręcznik przedmiotu" },
  en: { transcript: "Transcript", full: "Whole transcript", around: "Only this part", inRecordings: "In Recordings", close: "Close the transcript", recording: "Recording", sessions: "Source", builtFrom: "Built from", textbook: "Course textbook" },
};

type Busy = StudyMode | "claude" | null;

/**
 * One lecture summary (or a course's textbook), rendered for reading, with
 * the hand-off to ChatGPT and Claude Desktop: studying runs there, on the
 * user's own subscriptions.
 */
export default function LectureReader({ lecture, index, recordings, onBack, onOpenLecture, onOpenRecording, study }: ReaderProps) {
  const lang = lecture.language;
  const t = T[lang];
  const textbook = lecture.kind === "textbook";
  const layout = useLectureLayout(lecture.body);
  const top = useRef<HTMLDivElement>(null);
  const [moment, setMoment] = useState<{ key: string; ref: SourceRef; full: boolean } | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  // The transcript passages go into the study pack: loaded when the lecture opens and kept while
  // it is open, so a press copies at once (Safari refuses a copy that waits for the network).
  const { recordings: loadRecordings } = study;
  const [material, setMaterial] = useState<{ path: string; m: Material }>({ path: "", m: { state: "loading" } });
  useEffect(() => {
    if (lecture.kind !== "summary") return;
    let live = true;
    const path = lecture.path;
    setMaterial((cur) => (cur.path === path && cur.m.state === "ready" ? cur : { path, m: { state: "loading" } }));
    loadRecordings(lecture).then(
      (rows) => live && setMaterial({ path, m: { state: "ready", rows } }),
      () => live && setMaterial((cur) => (cur.path === path && cur.m.state === "ready" ? cur : { path, m: { state: "failed" } })),
    );
    return () => {
      live = false;
    };
  }, [lecture, loadRecordings]);
  const held: Material = material.path === lecture.path ? material.m : { state: "loading" };

  const run = async (what: Exclude<Busy, null>) => {
    if (busy) return;
    setBusy(what);
    try {
      // Called inside the click, with no await before the copy.
      if (what === "claude") await talkInClaude(lecture, study.learningMode);
      else await studyInChatGpt(study, lecture, what, held);
    } finally {
      setBusy(null);
    }
  };

  const byNote = useMemo(() => new Map(recordings.map((r) => [recordingNote(r).toLowerCase(), r])), [recordings]);
  const sessionParts = useMemo(
    () =>
      lecture.sessions.map((key) => ({
        key,
        parts: recordings.filter((r) => r.session_key === key).sort((a, b) => a.part - b.part),
      })),
    [lecture.sessions, recordings],
  );

  useEffect(() => {
    setMoment(null);
    top.current?.scrollIntoView({ block: "start" });
  }, [lecture.path]);

  const links: LinkHandlers = useMemo(
    () => ({
      resolve: (l: WikiLink) => resolveLink(index, l),
      onMoment: (ref, key) =>
        setMoment((cur) =>
          cur && cur.key === key && cur.ref.note === ref.note && cur.ref.seconds === ref.seconds && cur.ref.paragraph === ref.paragraph
            ? null
            : { key, ref, full: false },
        ),
      onLecture: onOpenLecture,
    }),
    [index, onOpenLecture],
  );

  const locale = lang === "pl" ? "pl-PL" : "en-GB";
  const builtFrom = useMemo(
    () =>
      lecture.summaries
        // As Obsidian resolves a link: the path, else the file name.
        .map((target) => index.lectureByPath.get(target.toLowerCase()) ?? index.lectureByName.get((target.split("/").pop() ?? target).toLowerCase()))
        .filter((l): l is LectureSummary => !!l && l.kind === "summary"),
    [lecture.summaries, index],
  );

  const after = (key: string) => {
    if (!moment || moment.key !== key) return null;
    const row = byNote.get(moment.ref.note.toLowerCase()) ?? null;
    return (
      <div className="my-3 space-y-2 rounded-xl border border-primary/30 bg-background/60 p-3" role="region" aria-label={`${t.transcript}: ${sourceLabel(moment.ref, locale)}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="font-semibold text-foreground">🎙 {sourceLabel(moment.ref, locale)}</span>
          {row && (
            <button type="button" onClick={() => setMoment({ ...moment, full: !moment.full })} className="text-primary hover:underline">
              {moment.full ? t.around : t.full}
            </button>
          )}
          {row && (
            <button type="button" onClick={() => onOpenRecording(moment.ref.note, moment.ref.seconds, moment.ref.paragraph)} className="text-muted-foreground hover:text-foreground">
              {t.inRecordings} →
            </button>
          )}
          <button type="button" onClick={() => setMoment(null)} className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground" aria-label={t.close} title={t.close}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <TranscriptPanel
          recordingId={row?.id ?? null}
          at={moment.ref.seconds}
          paragraph={moment.ref.paragraph ?? null}
          context={!moment.full}
          lang={lang}
        />
      </div>
    );
  };

  const toc = layout.toc;
  const shortToc = (s: string) => (s.length > 34 ? `${s.slice(0, 33)}…` : s);

  return (
    <article ref={top} className="scroll-mt-24 space-y-4" aria-labelledby="lecture-title">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Lectures
      </button>

      <header className="glass-card space-y-3 p-4 sm:p-5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground/85">{lecture.course ?? (lang === "pl" ? "Inne" : "Other")}</span>
          {textbook && (
            <span className="rounded-md border border-sky-400/40 bg-sky-400/10 px-1.5 py-px text-[11px] text-sky-200">
              📘{lecture.topic === t.textbook ? "" : ` ${t.textbook}`}
            </span>
          )}
          {lecture.date && <span>· {longDate(lecture.date, locale)}</span>}
          <LanguageFlag lang={lang} />
          {!textbook && <SourceBadge source={lecture.source} lang={lang} />}
        </p>
        <h2 id="lecture-title" className="text-xl font-bold leading-tight text-foreground sm:text-2xl">
          {lecture.topic}
        </h2>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ucz się w ChatGPT albo w Claude">
          <button
            type="button"
            onClick={() => void run("explain")}
            disabled={busy !== null}
            data-handoff="explain"
            className="gradient-purple glow-sm inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-70"
            title="Kopiuje pakiet do nauki (tryb nauki, podsumowanie, ważne fragmenty zapisu) i otwiera ChatGPT"
          >
            {busy === "explain" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <span aria-hidden="true">📚</span>} Ucz się w ChatGPT
          </button>
          <button
            type="button"
            onClick={() => void run("test")}
            disabled={busy !== null}
            data-handoff="test"
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-bold text-foreground hover:bg-primary/20 disabled:opacity-70"
            title="To samo, ale ChatGPT zaczyna od pytań A/B/C/D"
          >
            {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <span aria-hidden="true">🎯</span>} Test w ChatGPT
          </button>
          <button
            type="button"
            onClick={() => void run("claude")}
            disabled={busy !== null}
            data-handoff="claude"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-70"
            title="Kopiuje krótkie polecenie dla Claude Desktop: Claude sam czyta notatkę ze skarbca"
          >
            <span aria-hidden="true">💬</span> Przegadaj w Claude
          </button>
          <a
            href={obsidianUri(lecture.vault, lecture.path)}
            className="ml-auto inline-flex items-center gap-1.5 self-center text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Obsidian
          </a>
        </div>
        {toc.length >= 3 && (
          <nav aria-label={lang === "pl" ? "Spis treści" : "Contents"} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {toc.map((e) => (
              <a
                key={e.id}
                href={`#${e.id}`}
                onClick={(ev) => {
                  ev.preventDefault();
                  document.getElementById(e.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs whitespace-nowrap hover:text-foreground ${
                  e.kind === "stressed" ? "border-amber-400/40 text-amber-200" : "border-border/60 text-muted-foreground"
                }`}
                title={e.title}
              >
                {e.kind === "stressed" ? "⭐ " : e.kind === "map" ? "🗺️ " : ""}
                {shortToc(e.title)}
              </a>
            ))}
          </nav>
        )}
      </header>

      <div className="glass-card p-4 sm:p-6">
        <LectureMarkdown layout={layout} lang={lang} links={links} after={after} />
      </div>

      {builtFrom.length > 0 && (
        <footer className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{t.builtFrom}:</span>
          {builtFrom.map((l) => (
            <button
              key={l.path}
              type="button"
              onClick={() => onOpenLecture(l.path)}
              className="rounded-md border border-border/50 px-2 py-1 hover:border-primary/40 hover:text-foreground"
              lang={l.language}
            >
              🎓 {l.date ? `${l.date} · ` : ""}{l.topic}
            </button>
          ))}
        </footer>
      )}

      {sessionParts.some((s) => s.parts.length > 0) && (
        <footer className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{t.sessions}:</span>
          {sessionParts
            .filter((s) => s.parts.length > 0)
            .map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onOpenRecording(recordingNote(s.parts[0]), null)}
                className="rounded-md border border-border/50 px-2 py-1 hover:border-primary/40 hover:text-foreground"
              >
                {s.parts[0].source === "import" ? "📄" : "🎙"} {s.parts[0].original_name || longDate(s.key, locale)} →
              </button>
            ))}
        </footer>
      )}
    </article>
  );
}
