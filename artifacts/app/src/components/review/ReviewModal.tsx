import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2, Mic, Square, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useVoiceNote } from "@/hooks/useVoiceNote";
import { useKindPalette } from "@/components/tracker/computer-time-shared";
import type { AppKind } from "@/lib/app-usage-classify";
import { formatDuration as formatHm, periodLabel, reviewTiles, type ReviewSnapshot, type ReviewTile } from "@/lib/review-data";
import type { useReview } from "@/hooks/useReview";

type Review = ReturnType<typeof useReview>;

const TONE_DOT: Record<ReviewTile["tone"], string> = {
  good: "bg-emerald-400",
  neutral: "bg-white/30",
  warn: "bg-amber-400",
};
const TONE_WORD: Record<ReviewTile["tone"], string> = { good: "good", neutral: "", warn: "watch this" };

/** The review is in English (the Stats labels for these kinds are still Polish). */
const KIND_NAMES: Record<AppKind | "unassigned", string> = {
  work: "Work", learning: "Learning", communication: "Communication", watching: "Watching",
  waste: "Wasted", neutral: "Neutral", unassigned: "Unassigned",
};

/**
 * Order of the computer-time bar: productive first, lost last. Neutral sits
 * between two saturated hues so the two greys (neutral, watching) never touch.
 */
const BAR_KINDS: AppKind[] = ["work", "learning", "neutral", "communication", "watching", "waste"];

function TimeBar({ computer }: { computer: NonNullable<ReviewSnapshot["computer"]> }) {
  const palette = useKindPalette();
  const parts = BAR_KINDS.map((k) => ({ kind: k, secs: computer.byKind[k] || 0 })).filter((p) => p.secs >= 60);
  if (computer.unassigned >= 60) parts.push({ kind: "unassigned" as AppKind, secs: computer.unassigned });
  const total = parts.reduce((n, p) => n + p.secs, 0);
  if (total <= 0) return null;
  const color = (k: string) => (k === "unassigned" ? palette.unassigned : palette[k as AppKind]);
  const label = (k: string) => KIND_NAMES[k as AppKind | "unassigned"] ?? k;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Time at the computer</span>
        <span className="text-xs text-foreground/80 tabular-nums">{formatHm(total)}</span>
      </div>
      {/* One stacked bar; 2px gaps separate segments, legend below carries the numbers. */}
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label="How computer time was split">
        {parts.map((p) => (
          <div
            key={p.kind}
            title={`${label(p.kind)}: ${formatHm(p.secs)} (${Math.round((p.secs / total) * 100)}%)`}
            style={{ width: `${(p.secs / total) * 100}%`, background: color(p.kind) }}
            className="h-full first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {parts.map((p) => (
          <span key={p.kind} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: color(p.kind) }} aria-hidden="true" />
            {label(p.kind)} <span className="text-foreground/80 tabular-nums">{formatHm(p.secs)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Tile({ t, i }: { t: ReviewTile; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * i, duration: 0.2 }}
      className="rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3 min-w-0"
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span aria-hidden="true">{t.icon}</span>
        <span className="truncate">{t.label}</span>
        <span className={`ml-auto h-1.5 w-1.5 rounded-full ${TONE_DOT[t.tone]}`} title={TONE_WORD[t.tone] || undefined} aria-hidden="true" />
      </div>
      <div className="mt-1 text-xl font-bold text-foreground tabular-nums leading-tight truncate">{t.value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground truncate" title={t.detail}>{t.detail}</div>
    </motion.div>
  );
}

function QuestionStep({
  index,
  total,
  question,
  suggestions,
  answer,
  onAnswer,
}: {
  index: number;
  total: number;
  question: string;
  suggestions: string[];
  answer: string;
  onAnswer: (v: string) => void;
}) {
  const voice = useVoiceNote((text) => onAnswer(answer.trim() ? `${answer.trim()} ${text}` : text));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5" aria-label={`Question ${index + 1} of ${total}`}>
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= index ? "bg-primary" : "bg-white/10"}`} />
        ))}
      </div>
      <p className="text-lg font-semibold text-foreground leading-snug">{question}</p>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => {
            const picked = answer.trim() === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onAnswer(picked ? "" : s)}
                aria-pressed={picked}
                className={`text-left text-sm px-3 py-1.5 rounded-xl border transition-colors ${
                  picked ? "border-primary/60 bg-primary/20 text-foreground" : "border-white/10 bg-white/[0.04] text-foreground/85 hover:bg-white/[0.08]"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      )}
      <div className="relative">
        <textarea
          value={answer}
          onChange={(e) => onAnswer(e.target.value)}
          rows={3}
          placeholder={suggestions.length ? "Pick a suggestion, add your own, or record (any language)" : "Write or record your answer (any language)"}
          className="w-full resize-none rounded-2xl border border-white/10 bg-background/60 px-4 py-3 pr-14 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary/40"
        />
        <button
          type="button"
          onClick={() => void voice.toggle()}
          disabled={voice.transcribing}
          aria-label={voice.recording ? "Stop recording" : "Record an answer"}
          title={voice.recording ? "Stop recording" : "Record your answer"}
          className={`absolute right-2.5 bottom-3 h-9 w-9 rounded-xl flex items-center justify-center transition-colors ${
            voice.recording ? "bg-red-500/25 text-red-300 animate-pulse" : voice.transcribing ? "bg-amber-500/20 text-amber-300" : "bg-white/[0.06] text-muted-foreground hover:text-foreground"
          }`}
        >
          {voice.transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : voice.recording ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

/**
 * The morning review popup: one screen of yesterday's numbers, then a few
 * questions with ready answers, then done. Also used for the monthly review.
 */
export default function ReviewModal({ review }: { review: Review }) {
  const { open, target, snapshot, headline, questions, initialAnswers, questionsLoading, questionsError } = review;
  const [step, setStep] = useState<"summary" | number | "done">("summary");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // A review reopened after saving comes back with its answers (initialAnswers
  // arrives with its questions, before the first question can be reached).
  useEffect(() => {
    if (open) { setStep("summary"); setAnswers(initialAnswers); }
  }, [open, target?.kind, target?.period, initialAnswers]);

  const tiles = useMemo(() => (snapshot ? reviewTiles(snapshot) : []), [snapshot]);
  const monthly = target?.kind === "monthly";

  const finish = async () => {
    setSaving(true);
    const qa = questions.map((q) => ({ question: q.question, answer: (answers[q.id] || "").trim() })).filter((x) => x.answer);
    const ok = await review.save(qa);
    setSaving(false);
    if (ok) setStep("done");
    else toast.error("Couldn't save the review");
  };

  const qIndex = typeof step === "number" ? step : -1;
  const current = qIndex >= 0 ? questions[qIndex] : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) review.later(); }}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[calc(100%-1.5rem)] max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border-white/10 bg-card/95 backdrop-blur-xl p-5 sm:p-6"
      >
        <div className="space-y-1 pr-6">
          <DialogTitle className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
            {monthly ? "Month in review" : "Yesterday"}
          </DialogTitle>
          <DialogDescription className="text-xl font-bold text-foreground first-letter:uppercase">
            {target ? periodLabel(target.kind, target.period) : ""}
          </DialogDescription>
        </div>

        <AnimatePresence mode="wait">
          {step === "summary" && (
            <motion.div key="summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              {headline ? (
                <p className="text-sm text-foreground/90 leading-relaxed">{headline}</p>
              ) : (
                <div className="h-5 w-4/5 rounded-md bg-white/[0.06] animate-pulse" aria-hidden="true" />
              )}

              {!snapshot ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[84px] rounded-2xl bg-white/[0.04] animate-pulse" />)}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {tiles.map((t, i) => <Tile key={t.key} t={t} i={i} />)}
                  </div>
                  {snapshot.computer && <TimeBar computer={snapshot.computer} />}
                </>
              )}

              <div className="flex items-center gap-2 pt-1">
                {review.streak > 0 && (
                  <span className="text-xs text-muted-foreground mr-auto" title="Days in a row with a review">
                    🔥 {review.streak}-day streak
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void review.skip()}
                  className={`px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground ${review.streak > 0 ? "" : "mr-auto"}`}
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  disabled={questions.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-purple text-primary-foreground text-sm font-bold disabled:opacity-60"
                >
                  {questionsLoading || questions.length === 0 ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Preparing questions…</>
                  ) : (
                    <>{questions.length} {questions.length === 1 ? "question" : "questions"} <ArrowRight className="h-4 w-4" /></>
                  )}
                </button>
              </div>
              {questionsError && (
                <button type="button" onClick={review.retryQuestions} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
                  <RefreshCw className="h-3 w-3" /> The AI didn't answer, so these are the basic questions. Try again
                </button>
              )}
            </motion.div>
          )}

          {current && (
            <motion.div key={`q-${qIndex}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-5">
              <QuestionStep
                index={qIndex}
                total={questions.length}
                question={current.question}
                suggestions={current.suggestions}
                answer={answers[current.id] || ""}
                onAnswer={(v) => setAnswers((a) => ({ ...a, [current.id]: v }))}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(qIndex === 0 ? "summary" : qIndex - 1)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => (qIndex < questions.length - 1 ? setStep(qIndex + 1) : void finish())}
                  disabled={saving}
                  className="ml-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-purple text-primary-foreground text-sm font-bold disabled:opacity-60"
                >
                  {qIndex < questions.length - 1 ? (
                    <>{(answers[current.id] || "").trim() ? "Next" : "Skip question"} <ArrowRight className="h-4 w-4" /></>
                  ) : saving ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Saving</>
                  ) : (
                    <><Check className="h-4 w-4" /> Save</>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {step === "done" && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="py-6 text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Check className="h-6 w-6 text-emerald-300" />
              </div>
              <p className="text-lg font-bold text-foreground">Saved</p>
              {review.streak > 0 && <p className="text-sm text-muted-foreground">🔥 {review.streak} {review.streak === 1 ? "day" : "days"} in a row you know where your time goes.</p>}
              <div className="flex justify-center gap-2 pt-2">
                {review.next && (
                  <button
                    type="button"
                    onClick={() => review.next && void review.start(review.next)}
                    className="px-4 py-2.5 rounded-xl gradient-purple text-primary-foreground text-sm font-bold"
                  >
                    {review.next.kind === "monthly" ? "Review the month" : "Next"}
                  </button>
                )}
                <button type="button" onClick={() => review.setOpen(false)} className="px-4 py-2.5 rounded-xl border border-white/10 text-sm text-muted-foreground hover:text-foreground">
                  Close
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {step === "summary" && (
          <label className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={review.autoOpen} onChange={(e) => review.setAutoOpen(e.target.checked)} className="accent-[hsl(var(--primary))]" />
            Open automatically every morning
          </label>
        )}
      </DialogContent>
    </Dialog>
  );
}
