import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Target, Flag, ListChecks, Zap, Check, Calendar, Gauge, BatteryMedium, Pencil, Globe, ExternalLink, Paperclip } from "lucide-react";
import { PlanningTask, TaskLevel, PlanningMention } from "@/hooks/usePlanningState";
import PlanningMentions from "./PlanningMentions";

const levelMeta: Record<TaskLevel, { label: string; icon: React.ComponentType<{ className?: string }>; gradient: string }> = {
  goal: { label: "Goal", icon: Target, gradient: "from-purple-500 to-pink-500" },
  phase: { label: "Phase", icon: Flag, gradient: "from-blue-500 to-purple-500" },
  task: { label: "Task", icon: ListChecks, gradient: "from-cyan-500 to-blue-500" },
  action: { label: "Action", icon: Zap, gradient: "from-green-500 to-cyan-500" },
  link: { label: "Link", icon: Globe, gradient: "from-orange-500 to-yellow-500" },
};

function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface Props {
  task: PlanningTask | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<PlanningTask>) => void;
}

export default function PlanningNodeDetail({ task, open, onClose, onUpdate }: Props) {
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [taskUrl, setTaskUrl] = useState("");
  const [editingUrl, setEditingUrl] = useState(false);
  const notesRef = useRef("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (task) {
      setNotes(task.notes || "");
      setTitle(task.title);
      setTaskUrl(task.url || "");
      notesRef.current = task.notes || "";
      setEditingTitle(false);
      setEditingUrl(false);
    }
  }, [task]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  const saveNotes = () => {
    if (task && notes !== notesRef.current) {
      onUpdate(task.id, { notes });
      notesRef.current = notes;
    }
  };

  const saveTitle = () => {
    if (task && title.trim() && title !== task.title) {
      onUpdate(task.id, { title: title.trim() });
    }
    setEditingTitle(false);
  };

  if (!task) return null;

  const meta = levelMeta[task.level];
  const Icon = meta.icon;
  const isLink = task.level === "link";
  const url = task.url || "";
  const domain = isLink ? extractDomain(url) : "";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { saveNotes(); onClose(); } }}>
      <SheetContent side="right" className="w-[340px] sm:w-[400px] bg-background border-l border-border/30 overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center shadow-lg flex-shrink-0`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={e => {
                    if (e.key === "Enter") saveTitle();
                    if (e.key === "Escape") { setTitle(task.title); setEditingTitle(false); }
                  }}
                  className="w-full bg-transparent border-b border-primary/50 text-base font-semibold text-foreground outline-none py-0.5"
                />
              ) : (
                <SheetTitle
                  className="text-foreground text-base leading-tight cursor-pointer hover:text-primary transition-colors"
                  onClick={() => setEditingTitle(true)}
                >
                  {task.title}
                  <Pencil className="inline-block h-3 w-3 ml-1.5 opacity-40" />
                </SheetTitle>
              )}
              <SheetDescription className="text-xs mt-0.5">
                <Badge variant="outline" className={`text-[10px] px-2 py-0 border-0 bg-gradient-to-r ${meta.gradient} text-white`}>
                  {meta.label}
                </Badge>
                {task.done && (
                  <Badge variant="outline" className="text-[10px] px-2 py-0 ml-1.5 border-green-500/40 text-green-500">
                    <Check className="h-2.5 w-2.5 mr-0.5" /> Done
                  </Badge>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-5">
          {isLink && url && (
            <div className="rounded-xl border border-orange-500/30 bg-muted/10 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-muted/20 border border-orange-500/20 flex items-center justify-center overflow-hidden">
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                    alt=""
                    className="w-8 h-8"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{domain}</p>
                  <p className="text-xs text-muted-foreground truncate">{url}</p>
                </div>
              </div>
              <button
                onClick={() => window.open(url, "_blank")}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 text-sm transition-all"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open Link
              </button>
            </div>
          )}

          {!isLink && (
            <>
              {/* URL / Link field */}
              <div className="rounded-xl bg-muted/10 border border-white/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Linked URL</p>
                </div>
                {editingUrl ? (
                  <input
                    autoFocus
                    value={taskUrl}
                    onChange={e => setTaskUrl(e.target.value)}
                    onBlur={() => { onUpdate(task.id, { url: taskUrl.trim() || null }); setEditingUrl(false); }}
                    onKeyDown={e => {
                      if (e.key === "Enter") { onUpdate(task.id, { url: taskUrl.trim() || null }); setEditingUrl(false); }
                      if (e.key === "Escape") { setTaskUrl(task.url || ""); setEditingUrl(false); }
                    }}
                    placeholder="https://..."
                    className="w-full bg-muted/20 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
                  />
                ) : taskUrl ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => window.open(taskUrl.startsWith("http") ? taskUrl : `https://${taskUrl}`, "_blank")}
                      className="flex-1 flex items-center gap-1.5 text-xs text-primary hover:underline truncate text-left"
                    >
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{taskUrl}</span>
                    </button>
                    <button onClick={() => setEditingUrl(true)} className="text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setEditingUrl(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    + Add link
                  </button>
                )}
              </div>

              {/* Mentions — Ladder & Habit Loop cross-references */}
              <PlanningMentions
                mentions={task.mentions || []}
                onChange={(next: PlanningMention[]) => onUpdate(task.id, { mentions: next })}
              />

              <div className="grid grid-cols-2 gap-2">
                {task.deadline && (
                  <div className="rounded-xl bg-muted/10 p-3 flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Deadline</p>
                      <p className="text-xs text-foreground">{new Date(task.deadline).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}
                {task.leverage && (
                  <div className="rounded-xl bg-muted/10 p-3 flex items-center gap-2">
                    <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Leverage</p>
                      <p className="text-xs text-foreground capitalize">{task.leverage}</p>
                    </div>
                  </div>
                )}
                {task.energy && (
                  <div className="rounded-xl bg-muted/10 p-3 flex items-center gap-2">
                    <BatteryMedium className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Energy</p>
                      <p className="text-xs text-foreground capitalize">{task.energy}</p>
                    </div>
                  </div>
                )}
                {task.time_minutes && (
                  <div className="rounded-xl bg-muted/10 p-3 flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Time</p>
                      <p className="text-xs text-foreground">{task.time_minutes}m</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Notes</p>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Add notes, details, context..."
              className="min-h-[120px] bg-muted/10 border-white/10 text-sm resize-none focus:border-primary/50"
            />
          </div>

          <p className="text-[10px] text-muted-foreground">
            Created {new Date(task.created_at).toLocaleDateString()}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
