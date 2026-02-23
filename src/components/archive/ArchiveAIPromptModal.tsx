import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ArchiveBlock } from "@/lib/archive-data";

interface Props {
  open: boolean;
  onClose: () => void;
  selectedBlocks: ArchiveBlock[];
  onResult: (result: { title: string; content: string }) => Promise<ArchiveBlock | null>;
}

const ArchiveAIPromptModal = ({ open, onClose, selectedBlocks, onResult }: Props) => {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleRun = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const notes = selectedBlocks.map((b) => ({ title: b.title, content: b.content }));
      const { data, error } = await supabase.functions.invoke("ai-archive-multi", {
        body: { notes, prompt: prompt.trim() },
      });
      if (error) throw error;
      setResult(data?.content || "No result returned.");
    } catch (e: any) {
      toast.error(e?.message || "AI failed");
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const saved = await onResult({ title: `AI: ${prompt.slice(0, 50)}`, content: result });
      if (saved) {
        toast.success("Saved as new block ✅");
        setPrompt("");
        setResult(null);
        onClose();
      } else {
        toast.error("Failed to save — please try again");
      }
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
        <p className="text-xs text-muted-foreground">{selectedBlocks.length} notes selected</p>

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What do you want to do with these notes? e.g. 'find common themes', 'create action plan', 'merge into one'"
          className="min-h-[80px] bg-background/50 border-white/10"
        />

        <Button onClick={handleRun} disabled={loading || !prompt.trim()} className="gradient-purple text-primary-foreground font-bold glow-sm">
          {loading ? "⏳ Processing..." : "🚀 Run AI"}
        </Button>

        {result && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-background/30 border border-white/10 text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto">
              {result}
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full gradient-purple text-primary-foreground font-bold">
              {saving ? "⏳ Saving..." : "💾 Save as New Block"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ArchiveAIPromptModal;
