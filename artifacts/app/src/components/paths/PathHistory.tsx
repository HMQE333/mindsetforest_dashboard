import { useState } from "react";
import { motion } from "framer-motion";
import { Undo2, Bot, User, Sparkles, RotateCcw } from "lucide-react";
import { PathRevision, PathSnapshot, RevisionSource, describeRevision } from "@/lib/path-data";

interface Props {
  revisions: PathRevision[];
  /** The plan as it stands now, to describe each revision as a difference. */
  current: PathSnapshot;
  onRevert: (revisionId: string) => void;
}

const SOURCE_ICON: Record<RevisionSource, typeof User> = {
  user: User,
  assistant: Bot,
  ai_plan: Sparkles,
  revert: RotateCcw,
};

const SOURCE_LABEL: Record<RevisionSource, string> = {
  user: "you",
  assistant: "assistant",
  ai_plan: "AI plan",
  revert: "revert",
};

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

/**
 * Every version of the plan, with the reason it changed.
 *
 * The reason is the point. A list of diffs is a transcript nobody re-reads; a
 * list of diffs each carrying why it happened is the beginning of a record of
 * how this person re-plans - which is the raw material for everything the AI
 * will later be able to say about them.
 */
export default function PathHistory({ revisions, current, onRevert }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);

  if (revisions.length === 0) {
    return (
      <p className="mt-3 text-[11px] text-muted-foreground px-1">
        No changes yet. Once the plan is edited, every version lands here and one click brings it back.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-1.5">
      {revisions.map(rev => {
        const Icon = SOURCE_ICON[rev.source] || User;
        return (
          <motion.div
            key={rev.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg border border-white/8 bg-white/[0.02]"
          >
            <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground/85 leading-snug truncate">
                {rev.reason || "Plan changed"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {SOURCE_LABEL[rev.source] || rev.source} · {ago(rev.created_at)} · {describeRevision(rev.snapshot, current)}
              </p>
            </div>
            {confirming === rev.id ? (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => { onRevert(rev.id); setConfirming(null); }}
                  className="px-2 py-1 rounded-md text-[10px] font-bold gradient-purple text-primary-foreground"
                >
                  Restore
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  className="px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(rev.id)}
                title="Restore this version of the plan"
                className="p-1 text-muted-foreground hover:text-primary flex-shrink-0 transition-colors"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
            )}
          </motion.div>
        );
      })}
      <p className="text-[10px] text-muted-foreground px-1 pt-1">
        Restoring changes the plan, never the record: any step you have actually worked on stays, whatever the old version said.
      </p>
    </div>
  );
}
