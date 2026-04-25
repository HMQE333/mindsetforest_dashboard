import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { usePillars } from "@/hooks/usePillars";
import { useFriends } from "@/hooks/useFriends";
import { DIRECTIONS } from "@/lib/archive-data";
import PillarIcon from "@/components/shared/PillarIcon";
import { useForestState, type PlantInput } from "@/hooks/useForestState";
import type { ArchiveBlock } from "@/lib/archive-data";
import { Globe, Users, Target, X } from "lucide-react";

interface Props {
  open: boolean;
  blocks: ArchiveBlock[]; // 1+ blocks to plant
  onClose: () => void;
  onPlanted?: () => void;
}

const PlantSeedModal = ({ open, blocks, onClose, onPlanted }: Props) => {
  const allPillars = usePillars();
  const f = useFriends();
  const { plantSeed } = useForestState();

  const single = blocks.length === 1 ? blocks[0] : null;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pillars, setPillars] = useState<string[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const [tagsInput, setTagsInput] = useState("");
  const [visibility, setVisibility] = useState<"public" | "friends" | "custom">("friends");
  const [audience, setAudience] = useState<Set<string>>(new Set());
  const [planting, setPlanting] = useState(false);

  // Sync from source block when a single one is opened
  useEffect(() => {
    if (!open) return;
    if (single) {
      setTitle(single.title || "");
      setContent(single.content || "");
      setPillars(single.pillars || []);
      setDirections(single.directions || []);
      setTagsInput((single.tags || []).join(", "));
    } else {
      setTitle("");
      setContent("");
      setPillars([]);
      setDirections([]);
      setTagsInput("");
    }
    setVisibility("friends");
    setAudience(new Set());
  }, [open, single]);

  const tags = useMemo(
    () => tagsInput.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 12),
    [tagsInput],
  );

  const togglePillar = (id: string) =>
    setPillars((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleDirection = (id: string) =>
    setDirections((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  const toggleAudience = (uid: string) => {
    setAudience((s) => {
      const next = new Set(s);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  const canPlant =
    blocks.length > 0 &&
    !planting &&
    !(visibility === "custom" && audience.size === 0);

  const handlePlant = async () => {
    if (!canPlant) return;
    setPlanting(true);
    let plantedCount = 0;
    for (const block of blocks) {
      const input: PlantInput = single
        ? {
            blockId: block.id,
            visibility,
            audienceUserIds: visibility === "custom" ? Array.from(audience) : [],
            edits: { title, content, pillars, directions, tags },
          }
        : {
            blockId: block.id,
            visibility,
            audienceUserIds: visibility === "custom" ? Array.from(audience) : [],
          };
      const result = await plantSeed(input);
      if (result) plantedCount++;
    }
    setPlanting(false);
    if (plantedCount > 0) {
      onPlanted?.();
      onClose();
    }
  };

  const visibilityOptions: { id: typeof visibility; label: string; sub: string; Icon: any }[] = [
    { id: "friends", label: "All friends", sub: "Visible to people you've added", Icon: Users },
    { id: "public", label: "Everyone", sub: "Anyone in the Forest can find it", Icon: Globe },
    { id: "custom", label: "Specific people", sub: "Only the friends you pick", Icon: Target },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-card border-white/10 max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gradient-purple text-base flex items-center gap-2">
            🌱 Plant {blocks.length > 1 ? `${blocks.length} seeds` : "a seed"} in the Forest
          </DialogTitle>
        </DialogHeader>

        {single ? (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                className="bg-background/50 border-white/10 text-sm mt-1"
                placeholder="What is this seed about?"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Content</label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={8000}
                className="bg-background/50 border-white/10 text-sm mt-1 min-h-[160px] font-serif"
                placeholder="The knowledge you want to share..."
              />
              <div className="text-[10px] text-muted-foreground mt-1 text-right">{content.length} / 8000</div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">Pillars</label>
              <div className="flex flex-wrap gap-1.5">
                {allPillars.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => togglePillar(p.id)}
                    className="text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all flex items-center gap-1"
                    style={{
                      backgroundColor: pillars.includes(p.id) ? p.color : p.color + "18",
                      color: pillars.includes(p.id) ? "#fff" : p.color,
                    }}
                  >
                    <PillarIcon icon={p.icon} iconUrl={p.iconUrl} size={12} className="inline-block" />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">Directions</label>
              <div className="flex flex-wrap gap-1.5">
                {DIRECTIONS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => toggleDirection(d.id)}
                    className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all ${
                      directions.includes(d.id)
                        ? "gradient-purple text-primary-foreground"
                        : "bg-muted/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {d.icon} {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Tags (comma-separated)</label>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="bg-background/50 border-white/10 text-sm mt-1"
                placeholder="focus, deep-work, mornings…"
              />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {tags.map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-accent/30 text-accent-foreground font-semibold">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-muted/20 border border-white/5 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Planting <b className="text-foreground">{blocks.length}</b> blocks at once. Each will keep its own pillars, directions, and tags.</p>
            <div className="text-[11px] text-muted-foreground/80 max-h-24 overflow-y-auto space-y-0.5 mt-1">
              {blocks.slice(0, 8).map((b) => (
                <div key={b.id} className="truncate">• {b.title || "Untitled"}</div>
              ))}
              {blocks.length > 8 && <div>+ {blocks.length - 8} more…</div>}
            </div>
          </div>
        )}

        {/* Visibility */}
        <div className="space-y-2 pt-2">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">Who can see this?</label>
          <div className="grid grid-cols-3 gap-1.5">
            {visibilityOptions.map(({ id, label, sub, Icon }) => (
              <button
                key={id}
                onClick={() => setVisibility(id)}
                className={`flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-xl border transition-all text-left ${
                  visibility === id
                    ? "border-primary/60 bg-primary/15 glow-sm"
                    : "border-white/5 bg-muted/20 hover:bg-muted/40"
                }`}
              >
                <Icon className="w-3.5 h-3.5 text-foreground/80" />
                <span className="text-[11px] font-bold text-foreground">{label}</span>
                <span className="text-[9px] text-muted-foreground leading-tight">{sub}</span>
              </button>
            ))}
          </div>

          {visibility === "custom" && (
            <div className="rounded-xl bg-muted/20 border border-white/5 p-2 space-y-1.5 max-h-48 overflow-y-auto">
              {f.accepted.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-3">Add friends first to share with specific people.</p>
              ) : (
                f.accepted.map(({ friend }) => {
                  const picked = audience.has(friend.user_id);
                  return (
                    <button
                      key={friend.user_id}
                      onClick={() => toggleAudience(friend.user_id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${
                        picked ? "bg-primary/20 border border-primary/40" : "hover:bg-white/5 border border-transparent"
                      }`}
                    >
                      <span className="text-base">{friend.avatar_emoji || "🦊"}</span>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-xs font-bold text-foreground truncate">{friend.display_name || `@${friend.username}`}</p>
                        <p className="text-[10px] text-muted-foreground truncate">@{friend.username}</p>
                      </div>
                      {picked && <span className="text-[10px] font-bold text-primary">✓</span>}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-3 h-3" /> Cancel
          </Button>
          <Button
            onClick={handlePlant}
            disabled={!canPlant}
            size="sm"
            className="gradient-purple text-primary-foreground font-bold glow-sm"
          >
            {planting ? "🌱 Planting…" : `🌱 Plant ${blocks.length > 1 ? `${blocks.length} seeds` : "seed"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PlantSeedModal;