import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ArchiveBlock } from "@/lib/archive-data";

interface Props {
  addBlock: (b: Partial<ArchiveBlock>) => Promise<ArchiveBlock | null>;
  addBlocks: (b: Partial<ArchiveBlock>[]) => Promise<void>;
}

const ArchiveInbox = ({ addBlock, addBlocks }: Props) => {
  const [text, setText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");

  const items = text.trim() ? text.split("---").map((s) => s.trim()).filter(Boolean) : [];
  const hasSplitItems = items.length > 1;

  // Quick Save — saves items as-is, no AI
  const handleQuickSave = async () => {
    if (items.length === 0) return;
    setProcessing(true);
    try {
      const blocks: Partial<ArchiveBlock>[] = items.map((content) => ({
        title: content.slice(0, 60).replace(/\n/g, " "),
        content,
        pillars: [],
        directions: [],
        tags: [],
      }));
      await addBlocks(blocks);
      toast.success(`${blocks.length} block(s) saved`);
      setText("");
    } catch {
      toast.error("Save failed");
    }
    setProcessing(false);
  };

  // AI Clean + Split — sends raw text, returns cleaned text with --- back into textarea
  const handleAIClean = async (prompt?: string) => {
    if (!text.trim()) return;
    setProcessing(true);
    try {
      const body: Record<string, string> = { rawText: text };
      if (prompt) body.customPrompt = prompt;

      const { data, error } = await supabase.functions.invoke("ai-archive-clean", { body });
      if (error) throw error;
      const cleaned = data?.cleanedText;
      if (cleaned) {
        setText(cleaned);
        toast.success("Text cleaned & split — review below, then save");
      } else {
        toast.error("AI returned no result");
      }
    } catch (e: any) {
      console.error(e);
      if (e?.message?.includes("Rate limit")) toast.error("Rate limit exceeded, try again later");
      else if (e?.message?.includes("Payment")) toast.error("Payment required — add credits");
      else toast.error(e?.message || "AI cleaning failed");
    }
    setProcessing(false);
  };

  // AI by Prompt — custom instructions
  const handleAIByPrompt = async () => {
    if (!customPrompt.trim()) return;
    await handleAIClean(customPrompt);
    setShowPromptInput(false);
    setCustomPrompt("");
  };

  // AI Organize + Save — takes split items, AI tags, saves to library
  const handleAIOrganize = async () => {
    if (items.length === 0) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-archive-process", {
        body: { items },
      });
      if (error) throw error;
      const processed = data?.blocks || [];
      if (processed.length > 0) {
        await addBlocks(processed);
        toast.success(`${processed.length} block(s) organized & saved`);
        setText("");
      } else {
        toast.error("AI returned no results");
      }
    } catch (e: any) {
      console.error(e);
      if (e?.message?.includes("Rate limit")) toast.error("Rate limit exceeded, try again later");
      else if (e?.message?.includes("Payment")) toast.error("Payment required — add credits");
      else toast.error(e?.message || "AI processing failed");
    }
    setProcessing(false);
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">📥 Paste your knowledge</h3>
          {items.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">
              {items.length} item{items.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste notes, Discord logs, ideas, links here...&#10;&#10;Use AI Clean + Split to auto-separate messy text, or manually separate with ---"
          className="min-h-[200px] bg-background/50 border-white/10 text-sm"
        />

        {/* Button row */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => handleAIClean()}
            disabled={!text.trim() || processing}
            className="gradient-purple text-primary-foreground font-bold glow-sm"
          >
            {processing ? "⏳ Processing..." : "🧹 AI Clean + Split"}
          </Button>
          <Button
            onClick={() => setShowPromptInput(!showPromptInput)}
            disabled={!text.trim() || processing}
            variant="outline"
            className="border-white/10 font-bold"
          >
            🤖 AI by Prompt
          </Button>
          <Button
            onClick={handleQuickSave}
            disabled={items.length === 0 || processing}
            variant="outline"
            className="border-white/10 font-bold"
          >
            ⚡ Quick Save
          </Button>
          {hasSplitItems && (
            <Button
              onClick={handleAIOrganize}
              disabled={processing}
              className="gradient-purple text-primary-foreground font-bold glow-sm"
            >
              {processing ? "⏳ AI Working..." : "🏷️ AI Organize + Save"}
            </Button>
          )}
        </div>

        {/* Custom prompt input */}
        {showPromptInput && (
          <div className="flex gap-2">
            <Input
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder='e.g. "Group by topic", "Translate to English", "Extract only links"'
              className="bg-background/50 border-white/10 text-sm flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleAIByPrompt()}
            />
            <Button
              onClick={handleAIByPrompt}
              disabled={!customPrompt.trim() || processing}
              size="sm"
              className="gradient-purple text-primary-foreground font-bold"
            >
              Run
            </Button>
          </div>
        )}
      </div>

      {/* Preview */}
      {items.length > 1 && (
        <div className="glass-card p-4 space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">Preview ({items.length} items)</h4>
          {items.map((item, i) => (
            <div key={i} className="p-3 rounded-xl bg-background/30 border border-white/5 text-sm text-foreground/80 line-clamp-2">
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ArchiveInbox;
