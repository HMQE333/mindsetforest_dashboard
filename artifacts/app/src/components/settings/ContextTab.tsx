import { useState, useEffect } from "react";
import { useUserContext } from "@/hooks/useUserContext";

const PLACEHOLDER = `Write it like you would explain yourself to a good coach on day one.

Worth including:
- what you do, and what you are actually trying to build right now
- when you realistically have time, and when you are useless
- constraints: work hours, family, injuries, equipment you do or don't have
- what you already tried that didn't stick
- what you never want suggested`;

/**
 * The one place the AI learns who it is planning for. Deliberately a single
 * text area: a structured form would be more decisions for the same signal.
 */
export default function ContextTab() {
  const { notes, loading, saving, save } = useUserContext();
  const [draft, setDraft] = useState(notes);

  useEffect(() => { setDraft(notes); }, [notes]);

  const dirty = draft !== notes;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-foreground mb-1">Personal context</h3>
        <p className="text-xs text-muted-foreground">
          Sent with every AI request — task suggestions, path drafts, the assistant.
          Written once, it is the difference between generic advice and advice for you.
        </p>
      </div>

      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        disabled={loading}
        rows={16}
        placeholder={PLACEHOLDER}
        className="w-full bg-background/60 border border-white/10 rounded-xl px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary/40 resize-y leading-relaxed"
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">
          {draft.length > 0 ? `${draft.length} characters` : "Empty — the planner will keep suggestions generic."}
        </span>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={() => setDraft(notes)}
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
    </div>
  );
}
