import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useArchiveState } from "@/hooks/useArchiveState";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
}

const QuickCaptureModal = ({ open, onClose }: Props) => {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const { addBlock } = useArchiveState();

  const handleSave = async () => {
    if (!content.trim() && !title.trim()) return;
    setSaving(true);
    const result = await addBlock({
      title: title.trim() || "Quick capture",
      content: content.trim(),
      pillars: [],
      directions: [],
      tags: ["quick-capture"],
    });
    setSaving(false);
    if (result) {
      toast.success("Captured! 📥");
      setTitle("");
      setContent("");
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-card border-white/10 max-w-md" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="text-gradient-purple text-sm">⚡ Quick Capture</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="bg-background/50 border-white/10 text-sm"
            autoFocus
          />
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste or type anything..."
            className="min-h-[100px] bg-background/50 border-white/10 text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">⌘/Ctrl + Enter to save</span>
            <Button
              onClick={handleSave}
              disabled={saving || (!content.trim() && !title.trim())}
              className="gradient-purple text-primary-foreground font-bold text-sm glow-sm"
              size="sm"
            >
              {saving ? "⏳" : "📥 Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickCaptureModal;
