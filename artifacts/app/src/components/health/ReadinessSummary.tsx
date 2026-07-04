import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import ReadinessRing from "./ReadinessRing";
import {
  SIGNAL,
  VERDICT_META,
  computeReadiness,
  whatToImprove,
  type WatchEntry,
} from "@/lib/watch-data";

interface Props {
  latest: WatchEntry | null;
  previous: WatchEntry | null;
}

const TONE_DOT: Record<string, string> = {
  good: SIGNAL.good,
  watch: SIGNAL.watch,
  info: SIGNAL.info,
};

export default function ReadinessSummary({ latest, previous }: Props) {
  const readiness = computeReadiness(latest, previous);
  const meta = VERDICT_META[readiness.verdict];
  const improvements = whatToImprove(latest, previous);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card p-5 sm:p-6 relative overflow-hidden"
    >
      {/* Ambient verdict glow */}
      <div
        className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full blur-3xl"
        style={{ background: meta.color, opacity: 0.1 }}
      />

      <div className="flex flex-col md:flex-row md:items-center gap-6 relative">
        {/* Ring */}
        <div className="shrink-0 mx-auto md:mx-0">
          <ReadinessRing score={readiness.score} verdict={readiness.verdict} />
        </div>

        {/* Verdict + what to improve */}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground mb-1">
            Morning Report
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">
            Today:{" "}
            <span style={{ color: meta.color }}>
              {readiness.verdict === "hard" ? "go hard" : readiness.verdict === "easy" ? "take it easy" : "rest"}
            </span>
            .
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">{meta.line}</p>

          <div className="mt-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> What to improve
            </div>

            {improvements.length === 0 ? (
              <div
                className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 border text-sm"
                style={{ background: `${SIGNAL.good}12`, borderColor: `${SIGNAL.good}33` }}
              >
                <span className="shrink-0 mt-1.5 w-2 h-2 rounded-full" style={{ background: SIGNAL.good }} />
                <span className="text-foreground/90">
                  {readiness.hasData
                    ? "Every signal is in the healthy zone — green light. Keep the routine you're on."
                    : "Log today's Morning Report numbers to get a readiness read and personalised actions."}
                </span>
              </div>
            ) : (
              <ul className="space-y-2">
                {improvements.map((imp, i) => (
                  <motion.li
                    key={imp.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.08 }}
                    className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 border text-sm"
                    style={{ background: `${TONE_DOT[imp.tone]}10`, borderColor: `${TONE_DOT[imp.tone]}2e` }}
                  >
                    <span
                      className="shrink-0 mt-1.5 w-2 h-2 rounded-full"
                      style={{ background: TONE_DOT[imp.tone], boxShadow: `0 0 8px ${TONE_DOT[imp.tone]}` }}
                    />
                    <span className="text-foreground/90 leading-relaxed">{imp.text}</span>
                  </motion.li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
