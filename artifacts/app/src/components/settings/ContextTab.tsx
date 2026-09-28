import { useState, useEffect } from "react";
import { useUserContext, ContextShelves } from "@/hooks/useUserContext";
import { fetchAssistantStatus, prettyModelName, type AssistantStatus } from "@/lib/assistant-api";

interface Shelf {
  key: keyof ContextShelves;
  label: string;
  /** How fast this shelf changes. The whole reason there are three of them. */
  halfLife: string;
  hint: string;
  placeholder: string;
  rows: number;
}

const SHELVES: Shelf[] = [
  {
    key: "notes",
    label: "Constants",
    halfLife: "changes over years",
    hint: "Who you are when nothing in particular is going on.",
    placeholder:
      "What you do, and what you are actually building.\n" +
      "When you are sharp and when you are useless.\n" +
      "Standing constraints - work, family, body.\n" +
      "Things you never want suggested.",
    rows: 8,
  },
  {
    key: "lenses",
    label: "How you think",
    halfLife: "changes slowly",
    hint: "What has repeatedly worked, and what repeatedly hasn't. The planner uses this to pick the shape of a suggestion, not its subject.",
    placeholder:
      "I finish things I start in public and abandon private ones.\n" +
      "Streaks work on me; deadlines don't.\n" +
      "I over-plan when I'm anxious - shorter lists are better for me.",
    rows: 6,
  },
  {
    key: "season",
    label: "Right now",
    halfLife: "changes monthly",
    hint: "What is temporarily true. Kept apart from the shelves above on purpose, so one hard month cannot rewrite who you are.",
    placeholder:
      "Wrist injury until roughly mid-October - no pressing.\n" +
      "Crunch at work through the end of the quarter.\n" +
      "Staying at my parents' place, no gym nearby.",
    rows: 5,
  },
];

/**
 * Personal context, on three shelves ordered by rate of change.
 *
 * The split is not tidiness. It gives the planner a conflict rule: when "Right
 * now" disagrees with "Constants", the fast shelf is right about this month and
 * the slow one is right about the person - so a bad season changes what gets
 * suggested without changing what the system believes about you.
 */
export default function ContextTab() {
  const { shelves, loading, saving, save } = useUserContext();
  const [draft, setDraft] = useState<ContextShelves>(shelves);

  useEffect(() => { setDraft(shelves); }, [shelves]);

  const dirty = SHELVES.some(s => draft[s.key] !== shelves[s.key]);
  const empty = SHELVES.every(s => !draft[s.key].trim());

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-foreground mb-1">Personal context</h3>
        <p className="text-xs text-muted-foreground">
          Sent with every AI request — task suggestions, path drafts, the assistant.
          Three boxes rather than one because these things change at very different speeds.
        </p>
      </div>

      {SHELVES.map(shelf => (
        <div key={shelf.key}>
          <div className="flex items-baseline gap-2 mb-1">
            <label className="text-xs font-bold text-foreground">{shelf.label}</label>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{shelf.halfLife}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">{shelf.hint}</p>
          <textarea
            value={draft[shelf.key]}
            onChange={e => setDraft(prev => ({ ...prev, [shelf.key]: e.target.value }))}
            disabled={loading}
            rows={shelf.rows}
            placeholder={shelf.placeholder}
            className="w-full bg-background/60 border border-white/10 rounded-xl px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 resize-y leading-relaxed"
          />
        </div>
      ))}

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-[11px] text-muted-foreground">
          {empty ? "Empty — the planner will keep suggestions generic." : "Saved context is used by every AI feature."}
        </span>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={() => setDraft(shelves)}
              className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-xs text-muted-foreground hover:text-foreground transition-all"
            >
              Revert
            </button>
          )}
          <button
            onClick={() => save(draft)}
            disabled={!dirty || saving}
            className="px-4 py-2 rounded-xl gradient-purple text-primary-foreground text-xs font-bold glow-sm hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:translate-y-0"
          >
            {saving ? "Saving..." : "Save context"}
          </button>
        </div>
      </div>

      <AssistantStatusCard />
    </div>
  );
}

/** Which models the assistant runs on and what this month has cost so far. */
function AssistantStatusCard() {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAssistantStatus()
      .then((s) => { if (!cancelled) setStatus(s); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const pct = status && status.budgetUsd > 0 ? Math.min(100, Math.round((status.monthCostUsd / status.budgetUsd) * 100)) : 0;

  return (
    <div className="rounded-xl border border-white/10 bg-background/40 px-4 py-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-bold text-foreground">Assistant model &amp; budget</h4>
        {status && (
          <span className="text-[10px] text-muted-foreground">
            {status.monthRequests} request{status.monthRequests === 1 ? "" : "s"} this month
          </span>
        )}
      </div>
      {failed && <p className="text-[11px] text-muted-foreground">Could not reach the assistant function.</p>}
      {!status && !failed && <p className="text-[11px] text-muted-foreground animate-pulse">Loading…</p>}
      {status && (
        <>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
            <span className="text-muted-foreground">Chat</span>
            <span className="text-foreground font-medium">
              {prettyModelName(status.smartModel)}
              {status.overBudget && <span className="ml-1 text-amber-300">(budget reached, using {prettyModelName(status.cheapModel)})</span>}
            </span>
            <span className="text-muted-foreground">After the cap</span>
            <span className="text-foreground/80">{prettyModelName(status.cheapModel)}</span>
            <span className="text-muted-foreground">Context router</span>
            <span className="text-foreground/80">{prettyModelName(status.routerModel)}</span>
          </div>
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-muted-foreground">This month</span>
              <span className="text-foreground font-medium">
                ${status.monthCostUsd.toFixed(2)} / ${status.budgetUsd.toFixed(0)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full ${pct >= 100 ? "bg-amber-400" : "bg-primary"}`} style={{ width: `${pct}%` }} />
            </div>
            {!status.usageTableReady && (
              <p className="mt-1 text-[10px] text-amber-300/90">
                Spend tracking needs the migration <code className="font-mono">20260928200000_ai_usage_log.sql</code>; until then the cap is not enforced.
              </p>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Change models or the cap with the Supabase secrets <code className="font-mono">ASSISTANT_MODEL</code>,{" "}
            <code className="font-mono">ASSISTANT_FALLBACK_MODEL</code>, <code className="font-mono">ASSISTANT_BUDGET_USD</code> (OpenRouter slugs), then redeploy <code className="font-mono">ai-assistant-chat</code>.
          </p>
        </>
      )}
    </div>
  );
}
