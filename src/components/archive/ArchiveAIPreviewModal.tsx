import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PILLARS, DIRECTIONS } from "@/lib/archive-data";

interface PreviewData {
  action: string;
  original: { title: string; content: string; pillars?: string[]; directions?: string[]; tags?: string[] };
  proposed: { title?: string; content?: string; pillars?: string[]; directions?: string[]; tags?: string[] };
}

interface Props {
  open: boolean;
  data: PreviewData | null;
  onAccept: (data: PreviewData["proposed"]) => void;
  onReject: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  expand: "💡 Expand",
  shorten: "✂️ Shorten",
  summarize: "📝 Summary",
  organize: "🏷️ Organize",
};

const ArchiveAIPreviewModal = ({ open, data, onAccept, onReject }: Props) => {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");

  if (!data) return null;

  const isOrganize = data.action === "organize";

  const handleEdit = () => {
    setEditTitle(data.proposed.title || data.original.title);
    setEditContent(data.proposed.content || data.original.content);
    setEditing(true);
  };

  const handleAcceptEdit = () => {
    onAccept({ ...data.proposed, title: editTitle, content: editContent });
    setEditing(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setEditing(false); onReject(); } }}>
      <DialogContent className="glass-card border-white/10 max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gradient-purple">
            {ACTION_LABELS[data.action] || "AI"} Preview
          </DialogTitle>
        </DialogHeader>

        {isOrganize ? (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-semibold">Current tags</p>
              <div className="flex flex-wrap gap-1.5">
                {(data.original.pillars || []).map((p) => {
                  const pl = PILLARS.find((x) => x.id === p);
                  return pl ? (
                    <span key={p} className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: pl.color + "22", color: pl.color }}>
                      {pl.icon} {pl.name}
                    </span>
                  ) : null;
                })}
                {(data.original.directions || []).map((d) => {
                  const dir = DIRECTIONS.find((x) => x.id === d);
                  return (
                    <span key={d} className="text-[11px] px-2 py-0.5 rounded-full bg-accent/30 text-accent-foreground font-semibold">
                      {dir?.icon} {d}
                    </span>
                  );
                })}
                {(data.original.pillars || []).length === 0 && (data.original.directions || []).length === 0 && (
                  <span className="text-xs text-muted-foreground">None</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-semibold">AI suggests →</p>
              <div className="flex flex-wrap gap-1.5">
                {(data.proposed.pillars || []).map((p) => {
                  const pl = PILLARS.find((x) => x.id === p);
                  return pl ? (
                    <span key={p} className="text-[11px] px-2.5 py-1 rounded-full font-semibold border-2 border-dashed" style={{ borderColor: pl.color, color: pl.color }}>
                      {pl.icon} {pl.name}
                    </span>
                  ) : null;
                })}
                {(data.proposed.directions || []).map((d) => {
                  const dir = DIRECTIONS.find((x) => x.id === d);
                  return (
                    <span key={d} className="text-[11px] px-2.5 py-1 rounded-full font-semibold border-2 border-dashed border-accent text-accent-foreground">
                      {dir?.icon} {d}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        ) : editing ? (
          <div className="space-y-3">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full bg-background/50 border border-white/10 rounded-lg px-3 py-2 text-sm font-semibold"
            />
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[200px] bg-background/50 border-white/10 text-sm"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-semibold">Original</p>
              <div className="p-3 rounded-xl bg-background/30 border border-white/10 text-sm space-y-2 max-h-[300px] overflow-y-auto">
                <p className="font-semibold text-xs">{data.original.title}</p>
                <p className="whitespace-pre-wrap text-muted-foreground text-xs">{data.original.content}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-semibold">AI Proposed →</p>
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm space-y-2 max-h-[300px] overflow-y-auto">
                <p className="font-semibold text-xs">{data.proposed.title || data.original.title}</p>
                <p className="whitespace-pre-wrap text-xs">{data.proposed.content || data.original.content}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onReject} className="text-sm">
            ✕ Reject
          </Button>
          {!isOrganize && !editing && (
            <Button variant="outline" onClick={handleEdit} className="text-sm border-white/20">
              ✏️ Edit then Accept
            </Button>
          )}
          {editing ? (
            <Button onClick={handleAcceptEdit} className="gradient-purple text-primary-foreground font-bold text-sm">
              ✓ Accept Edited
            </Button>
          ) : (
            <Button onClick={() => onAccept(data.proposed)} className="gradient-purple text-primary-foreground font-bold text-sm">
              ✓ Accept
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ArchiveAIPreviewModal;
