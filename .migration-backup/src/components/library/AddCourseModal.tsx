import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { COVER_COLORS, DIRECTION_TAGS } from "@/lib/library-data";
import { CourseStatus, PLATFORM_SUGGESTIONS } from "@/lib/course-data";
import { usePillars } from "@/hooks/usePillars";
import PillarIcon from "@/components/shared/PillarIcon";
import { X } from "lucide-react";
import TagLibraryPopover from "@/components/shared/TagLibraryPopover";

interface AddCourseModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (course: {
    title: string; platform: string; instructor: string; url: string;
    status: CourseStatus; cover_color: string; tags: string[]; pillars: string[]; directions: string[];
  }) => void;
}

export default function AddCourseModal({ open, onClose, onAdd }: AddCourseModalProps) {
  const allPillars = usePillars();
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("");
  const [instructor, setInstructor] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<CourseStatus>("to-start");
  const [color, setColor] = useState(COVER_COLORS[1]);
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [pillars, setPillars] = useState<string[]>([]);

  const addTag = (tag: string) => { const t = tag.trim(); if (t && !tags.includes(t)) setTags(prev => [...prev, t]); };
  const removeTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag));
  const handleCustomTagKey = (e: React.KeyboardEvent) => { if (e.key === "Enter" && customTag.trim()) { e.preventDefault(); addTag(customTag); setCustomTag(""); } };
  const togglePillar = (id: string) => setPillars(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), platform: platform.trim(), instructor: instructor.trim(), url: url.trim(), status, cover_color: color, tags, pillars, directions: [] });
    setTitle(""); setPlatform(""); setInstructor(""); setUrl(""); setStatus("to-start"); setColor(COVER_COLORS[1]); setTags([]); setCustomTag(""); setPillars([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="glass-card border-white/10 max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">🎓 Add Course</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input placeholder="Course title *" value={title} onChange={e => setTitle(e.target.value)} className="bg-muted/30 border-white/10" />
          
          {/* Platform */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Platform</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PLATFORM_SUGGESTIONS.map(p => (
                <button key={p} onClick={() => setPlatform(p)} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${platform === p ? "bg-primary/20 text-primary ring-1 ring-primary/30" : "bg-muted/30 text-muted-foreground hover:text-foreground"}`}>
                  {p}
                </button>
              ))}
            </div>
            <Input placeholder="Or type custom platform..." value={platform} onChange={e => setPlatform(e.target.value)} className="bg-muted/30 border-white/10 text-sm" />
          </div>

          <Input placeholder="Instructor" value={instructor} onChange={e => setInstructor(e.target.value)} className="bg-muted/30 border-white/10" />
          <Input placeholder="URL (optional)" value={url} onChange={e => setUrl(e.target.value)} className="bg-muted/30 border-white/10" />

          {/* Status */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Status</label>
            <div className="flex gap-2">
              {(["to-start", "in-progress", "completed"] as CourseStatus[]).map(s => (
                <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${status === s ? "gradient-purple text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"}`}>
                  {s === "to-start" ? "To Start" : s === "in-progress" ? "In Progress" : "Completed"}
                </button>
              ))}
            </div>
          </div>

          {/* Pillars */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Pillars</label>
            <div className="flex flex-wrap gap-1.5">
              {allPillars.map(p => (
                <button key={p.id} onClick={() => togglePillar(p.id)} className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${pillars.includes(p.id) ? "bg-primary/20 text-primary ring-1 ring-primary/30" : "bg-muted/30 text-muted-foreground hover:text-foreground"}`}>
                  <PillarIcon icon={p.icon} iconUrl={p.iconUrl} size={14} className="inline-block" /> {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <label className="text-xs text-muted-foreground">Tags</label>
              <TagLibraryPopover module="library" currentTags={tags} onAddTag={addTag} />
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium">
                    {tag}<button onClick={() => removeTag(tag)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <Input value={customTag} onChange={e => setCustomTag(e.target.value)} onKeyDown={handleCustomTagKey} placeholder="Type custom tag + Enter" className="bg-muted/30 border-white/10 text-sm mb-2" />
            <div className="flex flex-wrap gap-1.5">
              {DIRECTION_TAGS.filter(t => !tags.includes(t)).slice(0, 8).map(t => (
                <button key={t} onClick={() => addTag(t)} className="px-2 py-0.5 rounded-full bg-muted/30 text-muted-foreground text-xs hover:text-foreground hover:bg-muted/50 transition-all">+ {t}</button>
              ))}
            </div>
          </div>

          {/* Cover Color */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Accent Color</label>
            <div className="flex gap-2 flex-wrap">
              {COVER_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full transition-all ${color === c ? "ring-2 ring-white scale-110" : "hover:scale-105"}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          <button onClick={handleSubmit} disabled={!title.trim()} className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all disabled:opacity-40">
            Add Course
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
