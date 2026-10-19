import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AI_ACTIONS } from "@/lib/archive-ai";
import { shortTitle } from "@/lib/archive-data";

/**
 * His own prompt, before it runs: on each selected note (every answer then
 * goes through the preview, note by note) or on all of them together (one
 * answer, saved as a new note). Nothing is written from here: the preview
 * decides.
 */

const EACH_IDEAS = ["Translate to English", "Turn it into a checklist", "Pull out the action items", "Format it as tidy Markdown"];

const TOGETHER_PRESETS = [
  { preset: "themes", label: "🔍 Common themes" },
  { preset: "action_plan", label: "📋 Action plan" },
  { preset: "compare", label: "⚖️ Compare" },
  { preset: "merge", label: "🔗 Merge into one" },
  { preset: "summarize", label: "📝 Summarize" },
] as const;

interface Props {
  open: boolean;
  mode: "each" | "together";
  titles: readonly string[];
  onRun: (prompt: string, preset?: string) => void;
  onClose: () => void;
}

const ArchiveAIPromptModal = ({ open, mode, titles, onRun, onClose }: Props) => {
  const [prompt, setPrompt] = useState("");
  useEffect(() => {
    if (open) setPrompt("");
  }, [open, mode]);
  const n = titles.length;
  const run = (p: string, preset?: string) => {
    if (!p.trim() && !preset) return;
    onRun(p.trim(), preset);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-card w-[calc(100vw-1rem)] max-w-lg max-h-[85vh] overflow-y-auto border-white/10" lang="en">
        <DialogHeader className="min-w-0 text-left">
          <DialogTitle className="text-gradient-purple">
            {mode === "each" ? `💬 Own prompt${n > 1 ? `, on each of ${n} notes` : ""}` : `🤖 Prompt on all ${n} notes`}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            {mode === "each" ? AI_ACTIONS.prompt.border : AI_ACTIONS.together.border}
          </DialogDescription>
        </DialogHeader>

        {n > 0 && (
          <div className="flex max-h-[72px] min-w-0 flex-wrap gap-1.5 overflow-y-auto">
            {titles.slice(0, 12).map((t, i) => (
              <span key={i} className="max-w-[12rem] truncate rounded-lg border border-white/10 bg-muted/50 px-2 py-0.5 text-[11px]" title={t}>
                {shortTitle(t, 40)}
              </span>
            ))}
            {n > 12 && <span className="text-[11px] text-muted-foreground">+{n - 12} more</span>}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {mode === "each"
            ? EACH_IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => setPrompt(idea)}
                  className="rounded-xl border border-white/10 bg-muted/50 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {idea}
                </button>
              ))
            : TOGETHER_PRESETS.map((p) => (
                <button
                  key={p.preset}
                  type="button"
                  onClick={() => run("", p.preset)}
                  className="rounded-xl border border-white/10 bg-muted/50 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {p.label}
                </button>
              ))}
        </div>

        <Textarea
          value={prompt}
          autoFocus
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              run(prompt);
            }
          }}
          placeholder={mode === "each" ? 'What should the AI do with the note? e.g. "translate to English"' : 'What should the AI do with these notes? e.g. "list every book mentioned"'}
          className="min-h-[80px] border-white/10 bg-background/50"
        />

        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-[10px] text-muted-foreground">Ctrl+Enter runs · the result opens in a preview first</span>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => run(prompt)}
            disabled={!prompt.trim()}
            className="rounded-lg px-4 py-2 text-sm font-bold gradient-purple text-primary-foreground glow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Run
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ArchiveAIPromptModal;
