import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Course, CourseStatus, COURSE_STATUS_LABELS, PLATFORM_SUGGESTIONS } from "@/lib/course-data";
import { DIRECTION_TAGS } from "@/lib/library-data";
import { usePillars } from "@/hooks/usePillars";
import PillarIcon from "@/components/shared/PillarIcon";
import { Star, Trash2, ExternalLink, X } from "lucide-react";
import TagLibraryPopover from "@/components/shared/TagLibraryPopover";
import { toast } from "sonner";

interface CourseDetailModalProps {
  course: Course | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Course>) => void;
  onDelete: (id: string) => void;
}

export default function CourseDetailModal({ course, open, onClose, onUpdate, onDelete }: CourseDetailModalProps) {
  const allPillars = usePillars();
  const [notes, setNotes] = useState("");
  const [progressPct, setProgressPct] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [status, setStatus] = useState<CourseStatus>("to-start");
  const [platform, setPlatform] = useState("");
  const [instructor, setInstructor] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pillars, setPillars] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");

  useEffect(() => {
    if (course) {
      setNotes(course.notes);
      setProgressPct(String(course.progress_pct));
      setRating(course.rating);
      setStatus(course.status);
      setPlatform(course.platform);
      setInstructor(course.instructor);
      setUrl(course.url);
      setTags(course.tags || []);
      setPillars(course.pillars || []);
      setCustomTag("");
    }
  }, [course]);

  if (!course) return null;

  const addTag = (tag: string) => { const t = tag.trim(); if (t && !tags.includes(t)) setTags(prev => [...prev, t]); };
  const removeTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag));
  const handleCustomTagKey = (e: React.KeyboardEvent) => { if (e.key === "Enter" && customTag.trim()) { e.preventDefault(); addTag(customTag); setCustomTag(""); } };
  const togglePillar = (id: string) => setPillars(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  const handleSave = () => {
    onUpdate(course.id, { notes, progress_pct: Math.min(100, Math.max(0, parseInt(progressPct) || 0)), rating, status, platform, instructor, url, tags, pillars });
    toast.success("Course updated");
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="glass-card border-white/10 max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="w-3 h-12 rounded-full shrink-0" style={{ backgroundColor: course.cover_color }} />
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-foreground text-lg leading-tight">{course.title}</DialogTitle>
              <div className="flex items-center gap-2 mt-0.5">
                {course.platform && <span className="text-xs text-muted-foreground">{course.platform}</span>}
                {course.instructor && <span className="text-xs text-muted-foreground">• {course.instructor}</span>}
              </div>
            </div>
            {course.url && (
              <a href={course.url} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1.5 rounded-lg bg-muted/30 text-muted-foreground hover:text-foreground transition-all">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Status */}
          <div className="flex gap-2">
            {(["to-start", "in-progress", "completed"] as CourseStatus[]).map(s => (
              <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${status === s ? "gradient-purple text-primary-foreground" : "bg-muted/30 text-muted-foreground"}`}>
                {COURSE_STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          {/* Progress */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Progress %</label>
            <div className="flex items-center gap-3">
              <Input type="number" value={progressPct} onChange={e => setProgressPct(e.target.value)} min={0} max={100} className="bg-muted/30 border-white/10 w-24" />
              <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(parseInt(progressPct) || 0, 100)}%`, backgroundColor: course.cover_color }} />
              </div>
              <span className="text-xs text-muted-foreground w-10 text-right">{Math.min(parseInt(progressPct) || 0, 100)}%</span>
            </div>
          </div>

          {/* Platform & Instructor */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Platform</label>
              <Input value={platform} onChange={e => setPlatform(e.target.value)} className="bg-muted/30 border-white/10 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Instructor</label>
              <Input value={instructor} onChange={e => setInstructor(e.target.value)} className="bg-muted/30 border-white/10 text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">URL</label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." className="bg-muted/30 border-white/10 text-sm" />
          </div>

          {/* Rating */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Rating</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setRating(rating === s ? null : s)}>
                  <Star className={`w-5 h-5 transition-all ${s <= (rating || 0) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30 hover:text-yellow-400/50"}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Pillars */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Pillars</label>
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
            <div className="flex items-center gap-2 mb-1">
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
              {DIRECTION_TAGS.filter(t => !tags.includes(t)).slice(0, 6).map(t => (
                <button key={t} onClick={() => addTag(t)} className="px-2 py-0.5 rounded-full bg-muted/30 text-muted-foreground text-xs hover:text-foreground hover:bg-muted/50 transition-all">+ {t}</button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Your notes about this course..." className="bg-muted/30 border-white/10 min-h-[100px]" />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all">Save Changes</button>
            <button onClick={() => { onDelete(course.id); onClose(); }} className="px-4 py-2.5 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
