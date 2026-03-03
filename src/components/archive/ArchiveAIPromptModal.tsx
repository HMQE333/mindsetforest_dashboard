import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ArchiveBlock } from "@/lib/archive-data";

const PRESET_CHIPS = [
  { id: "themes", label: "🔍 Find common themes", preset: "themes" },
  { id: "action_plan", label: "📋 Create action plan", preset: "action_plan" },
  { id: "merge", label: "🔗 Merge into one", preset: "merge" },
  { id: "compare", label: "⚖️ Compare & contrast", preset: "compare" },
  { id: "summarize", label: "📝 Summarize all", preset: "summarize" },
];

type SaveMode = "new" | "replace";

interface Props {
  open: boolean;
  onClose: () => void;
  selectedBlocks: ArchiveBlock[];
  onResult: (result: { title: string; content: string }) => Promise<ArchiveBlock | null>;
  onReplaceBlocks?: (blockIds: string[], result: { title: string; content: string }) => Promise<void>;
  onRemoveFromSelection?: (id: string) => void;
}

const ArchiveAIPromptModal = ({ open, onClose, selectedBlocks, onResult, onReplaceBlocks, onRemoveFromSelection }: Props) => {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMode, setSaveMode] = useState<SaveMode>("new");

  const runAI = async (customPrompt?: string, preset?: string) => {
    const finalPrompt = customPrompt || prompt.trim();
    if (!finalPrompt && !preset) return;
    setLoading(true);
    setResult(null);
    try {
      const notes = selectedBlocks.map((b) => ({ title: b.title, content: b.content }));
      const { data, error } = await supabase.functions.invoke("ai-archive-multi", {
        body: { notes, prompt: finalPrompt, preset },
      });
      if (error) throw error;
      setResult(data?.content || "No result returned.");
    } catch (e: any) {
      toast.error(e?.message || "AI failed");
    }
    setLoading(false);
  };

  const handleRun = () => runAI();

  const handlePresetClick = (preset: string) => {
    runAI(undefined, preset);
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      if (saveMode === "replace" && onReplaceBlocks) {
        await onReplaceBlocks(
          selectedBlocks.map((b) => b.id),
          { title: `AI: ${prompt.slice(0, 50) || "Merged"}`, content: result }
        );
        toast.success("Replaced selected blocks with AI result ✅");
      } else {
        const saved = await onResult({ title: `AI: ${prompt.slice(0, 50) || "Result"}`, content: result });
        if (saved) {
          toast.success("Saved as new block ✅");
        } else {
          toast.error("Failed to save");
          setSaving(false);
          return;
        }
      }
      setPrompt("");
      setResult(null);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setResult(null); onClose(); } }}>
      <DialogContent className="glass-card border-white/10 max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gradient-purple">🤖 AI Multi-Note Prompt</DialogTitle>
        </DialogHeader>

        {/* Included blocks list */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground font-semibold">{selectedBlocks.length} notes included:</p>
          <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto">
            {selectedBlocks.map((b) => (
              <span key={b.id} className="text-[11px] px-2 py-1 rounded-lg bg-muted/50 border border-white/10 flex items-center gap-1">
                <span className="truncate max-w-[120px]">{b.title || "Untitled"}</span>
                {onRemoveFromSelection && (
                  <button
                    onClick={() => onRemoveFromSelection(b.id)}
                    className="text-muted-foreground hover:text-foreground ml-0.5"
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Preset chips */}
        <div className="flex flex-wrap gap-1.5">
          {PRESET_CHIPS.map((chip) => (
            <button
              key={chip.id}
              onClick={() => handlePresetClick(chip.preset)}
              disabled={loading}
              className="text-[11px] px-3 py-1.5 rounded-xl bg-muted/50 border border-white/10 hover:bg-muted hover:border-white/20 text-muted-foreground hover:text-foreground transition-all disabled:opacity-40 font-semibold"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Custom prompt */}
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Or write a custom prompt... e.g. 'extract all action items'"
          className="min-h-[70px] bg-background/50 border-white/10"
        />

        <Button onClick={handleRun} disabled={loading || !prompt.trim()} className="gradient-purple text-primary-foreground font-bold glow-sm">
          {loading ? "⏳ Processing..." : "🚀 Run AI"}
        </Button>

        {result && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-background/30 border border-white/10 text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto">
              {result}
            </div>

            {/* Save mode selector */}
            <div className="flex gap-2">
              <button
                onClick={() => setSaveMode("new")}
                className={`text-[11px] px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  saveMode === "new" ? "gradient-purple text-primary-foreground" : "bg-muted/40 text-muted-foreground"
                }`}
              >
                💾 Save as new block
              </button>
              {onReplaceBlocks && (
                <button
                  onClick={() => setSaveMode("replace")}
                  className={`text-[11px] px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    saveMode === "replace" ? "bg-destructive/80 text-destructive-foreground" : "bg-muted/40 text-muted-foreground"
                  }`}
                >
                  🔄 Replace selected
                </button>
              )}
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full gradient-purple text-primary-foreground font-bold">
              {saving ? "⏳ Saving..." : saveMode === "replace" ? "🔄 Replace & Save" : "💾 Save as New Block"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ArchiveAIPromptModal;
