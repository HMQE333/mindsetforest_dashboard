import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { usePillars } from "@/hooks/usePillars";
import { DIRECTIONS } from "@/lib/archive-data";
import PillarIcon from "@/components/shared/PillarIcon";
import { useFriends } from "@/hooks/useFriends";
import { useForestState, type SeedWithAuthor } from "@/hooks/useForestState";
import { Globe, Users, Target } from "lucide-react";

interface Props {
  open: boolean;
  seed: SeedWithAuthor | null;
  onClose: () => void;
}

const EditSeedModal = ({ open, seed, onClose }: Props) => {
  const allPillars = usePillars();
  const f = useFriends();
  const { updateSeed, setAudience } = useForestState();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pillars, setPillars] = useState<string[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const [tagsInput, setTagsInput] = useState("");
  const [visibility, setVisibility] = useState<"public" | "friends" | "custom">("friends");
  const [audience, setAud] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!seed) return;
    setTitle(seed.title);
    setContent(seed.content);
    setPillars(seed.pillars);
    setDirections(seed.directions);
    setTagsInput(seed.tags.join(", "));
    setVisibility(seed.visibility);
    setAud(new Set());
  }, [seed]);

  const tags = useMemo(() => tagsInput.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 12), [tagsInput]);

  if (!seed) return null;

  const togglePillar = (id: string) => setPillars((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const toggleDirection = (id: string) => setDirections((d) => d.includes(id) ? d.filter((x) => x !== id) : [...d, id]);
  const toggleAud = (uid: string) => setAud((s) => { const n = new Set(s); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });

  const handleSave = async () => {
    setSaving(true);
    await updateSeed(seed.id, { title, content, pillars, directions, tags, visibility });
    if (visibility === "custom" && audience.size > 0) {
      await setAudience(seed.id, Array.from(audience));
    }
    setSaving(false);
    onClose();
  };

  const visOpts: { id: typeof visibility; label: string; Icon: any }[] = [
    { id: "friends", label: "Friends", Icon: Users },
    { id: "public", label: "Everyone", Icon: Globe },
    { id: "custom", label: "Specific", Icon: Target },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-card border-white/10 max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gradient-purple text-base">✏️ Edit seed</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="bg-background/50 border-white/10 text-sm" placeholder="Title" />
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={8000}
            className="min-h-[160px] bg-background/50 border-white/10 text-sm font-serif" placeholder="Content" />
          <div className="flex flex-wrap gap-1.5">
            {allPillars.map((p) => (
              <button key={p.id} onClick={() => togglePillar(p.id)}
                className="text-[11px] px-2.5 py-1 rounded-full font-semibold flex items-center gap-1"
                style={{ backgroundColor: pillars.includes(p.id) ? p.color : p.color + "18", color: pillars.includes(p.id) ? "#fff" : p.color }}>
                <PillarIcon icon={p.icon} iconUrl={p.iconUrl} size={12} className="inline-block" /> {p.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DIRECTIONS.map((d) => (
              <button key={d.id} onClick={() => toggleDirection(d.id)}
                className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${
                  directions.includes(d.id) ? "gradient-purple text-primary-foreground" : "bg-muted/40 text-muted-foreground"
                }`}>
                {d.icon} {d.label}
              </button>
            ))}
          </div>
          <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="tags, comma-separated" className="bg-background/50 border-white/10 text-sm" />

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Visibility</p>
            <div className="grid grid-cols-3 gap-1.5">
              {visOpts.map(({ id, label, Icon }) => (
                <button key={id} onClick={() => setVisibility(id)}
                  className={`flex items-center gap-1 justify-center px-2 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                    visibility === id ? "border-primary/60 bg-primary/15 text-foreground glow-sm" : "border-white/5 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  }`}>
                  <Icon className="w-3 h-3" /> {label}
                </button>
              ))}
            </div>
            {visibility === "custom" && (
              <div className="rounded-xl bg-muted/20 border border-white/5 p-2 max-h-40 overflow-y-auto space-y-1.5">
                {f.accepted.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-2">Add friends first.</p>
                ) : f.accepted.map(({ friend }) => {
                  const picked = audience.has(friend.user_id);
                  return (
                    <button key={friend.user_id} onClick={() => toggleAud(friend.user_id)}
                      className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg text-left ${picked ? "bg-primary/20 border border-primary/40" : "hover:bg-white/5"}`}>
                      <span>{friend.avatar_emoji || "🦊"}</span>
                      <span className="text-xs flex-1 truncate">@{friend.username}</span>
                      {picked && <span className="text-[10px] text-primary font-bold">✓</span>}
                    </button>
                  );
                })}
                <p className="text-[10px] text-muted-foreground text-center pt-1 border-t border-white/5">
                  Audience selection here is additive — saving will replace the existing list.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} size="sm" className="gradient-purple text-primary-foreground font-bold">
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditSeedModal;