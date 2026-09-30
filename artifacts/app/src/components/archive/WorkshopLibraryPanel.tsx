import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react";
import { loadWorkshops, workshopsMarkdown, type WorkshopNote } from "@/hooks/useLinkSummaries";
import { Note } from "./VideoNote";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Opens one video's own panel (summary, transcript). */
  onOpenVideo?: (url: string, videoId: string) => void;
}

/**
 * The workshop notes of every video in one place: how each is made, built
 * up one video at a time into a layer to read, search and export (as one
 * Markdown file) for editing tools later.
 */
const WorkshopLibraryPanel = ({ open, onClose, onOpenVideo }: Props) => {
  const [notes, setNotes] = useState<WorkshopNote[] | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setNotes(null);
    void loadWorkshops().then(setNotes);
  }, [open]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!notes || !q) return notes || [];
    return notes.filter((n) => `${n.title}\n${n.channel}\n${n.workshop}`.toLowerCase().includes(q));
  }, [notes, search]);

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const download = () => {
    if (!notes || notes.length === 0) return;
    const blob = new Blob([workshopsMarkdown(notes)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workshop-notes-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="text-left pr-6">
          <SheetTitle>Workshop notes</SheetTitle>
          <SheetDescription>
            How your saved videos are made, one workshop at a time: hooks, structure, visuals, captions, b-roll, pacing, titles and thumbnails.
          </SheetDescription>
        </SheetHeader>

        {notes === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : notes.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No workshops yet. Open a YouTube link's menu in Links and choose Workshop.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search the notes (hook, captions, b-roll…)"
                className="bg-background/50 border-white/10"
              />
              <button
                onClick={download}
                title="Download every workshop as one Markdown file"
                className="shrink-0 inline-flex items-center gap-1.5 px-3 rounded-lg bg-muted/50 border border-white/10 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <Download className="w-3.5 h-3.5" /> .md
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {search.trim() ? `${shown.length} of ${notes.length}` : `${notes.length} ${notes.length === 1 ? "video" : "videos"}`}
            </p>
            {shown.map((n) => {
              const isOpen = expanded.has(n.video_id);
              return (
                <div key={n.video_id} className="rounded-xl border border-white/10 bg-muted/20">
                  <button onClick={() => toggle(n.video_id)} className="w-full flex items-start gap-2 p-3 text-left">
                    <span className="mt-0.5 text-muted-foreground">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-foreground leading-snug">{n.title}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {n.channel} · {new Date(n.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 space-y-3">
                      <Note text={n.workshop} videoId={n.video_id} />
                      {onOpenVideo && (
                        <button onClick={() => onOpenVideo(n.url, n.video_id)} className="text-xs text-primary hover:underline">
                          Open this video's summary and transcript →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default WorkshopLibraryPanel;
