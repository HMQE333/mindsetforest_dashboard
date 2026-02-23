import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
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

  const items = text.trim() ? text.split("---").map((s) => s.trim()).filter(Boolean) : [];

  const handleProcess = async () => {
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
      toast.success(`${blocks.length} block(s) added`);
      setText("");
    } catch {
      toast.error("Processing failed");
    }
    setProcessing(false);
  };

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
      toast.error(e?.message || "AI processing failed");
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
          placeholder="Paste notes, ideas, links here...&#10;&#10;Separate multiple items with ---"
          className="min-h-[200px] bg-background/50 border-white/10 text-sm"
        />
        <div className="flex gap-3">
          <Button
            onClick={handleProcess}
            disabled={items.length === 0 || processing}
            className="gradient-purple text-primary-foreground font-bold glow-sm"
          >
            {processing ? "⏳ Processing..." : "⚡ Quick Save"}
          </Button>
          <Button
            onClick={handleAIOrganize}
            disabled={items.length === 0 || processing}
            variant="outline"
            className="border-white/10 font-bold"
          >
            {processing ? "⏳ AI Working..." : "🤖 AI Organize"}
          </Button>
        </div>
      </div>

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
