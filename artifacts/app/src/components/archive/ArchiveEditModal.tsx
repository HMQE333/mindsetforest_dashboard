import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePillars } from "@/hooks/usePillars";
import PillarIcon from "@/components/shared/PillarIcon";
import { shortTitle, tagsFromInput, type ArchiveBlock } from "@/lib/archive-data";
import TagLibraryPopover from "@/components/shared/TagLibraryPopover";
import ArchiveConfirmDialog from "./ArchiveConfirmDialog";
import { deleteWithUndo } from "./pending-deletes";
import { keyedPillars } from "./TagChips";

const IMAGE_TAG_REGEX = /\[image\]\s*(https?:\/\/[^\s]+)/g;

interface Props {
  block: ArchiveBlock | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<ArchiveBlock>) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  semanticSearch?: (query: string) => Promise<ArchiveBlock[]>;
  onEditBlock?: (block: ArchiveBlock) => void;
}

const ArchiveEditModal = ({ block, open, onClose, onSave, onDelete, semanticSearch, onEditBlock }: Props) => {
  const allPillars = usePillars();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pillars, setPillars] = useState<string[]>([]);
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [relatedBlocks, setRelatedBlocks] = useState<ArchiveBlock[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Numbered as in the peek: 1-8 are his life areas (Uncategorized has no key).
  const keyed = useMemo(() => keyedPillars(allPillars), [allPillars]);

  useEffect(() => {
    if (block) {
      setTitle(block.title);
      setContent(block.content);
      setPillars(block.pillars);
      setTags(block.tags.join(", "));
    }
  }, [block]);

  const imageUrls = useMemo(() => {
    const urls: string[] = [];
    let match;
    const regex = new RegExp(IMAGE_TAG_REGEX.source, "g");
    while ((match = regex.exec(content)) !== null) {
      urls.push(match[1]);
    }
    return urls;
  }, [content]);

  const togglePillar = useCallback((id: string) =>
    setPillars((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id])), []);

  // Digits 1-8 toggle the pillar with that number on its chip (as in the peek), when not typing.
  // They replace the first-letter keys, which collided (M: Mind and Money, E: Expression and Exploration).
  const handlePillarKey = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
    const pillar = keyed[Number(e.key) - 1];
    if (!pillar) return;
    e.preventDefault();
    setPillars((prev) => (prev.includes(pillar.id) ? prev.filter((p) => p !== pillar.id) : [...prev, pillar.id]));
  }, [keyed]);

  useEffect(() => {
    if (!open || !block || confirmDelete) return;
    window.addEventListener("keydown", handlePillarKey);
    return () => window.removeEventListener("keydown", handlePillarKey);
  }, [open, block, confirmDelete, handlePillarKey]);

  if (!block) return null;

  const handleSave = async () => {
    setSaving(true);
    await onSave(block.id, {
      title,
      content,
      pillars,
      // Read with the tag rules: "Książki" is "książki", one type at most (the last one written wins).
      tags: tagsFromInput(tags, block.tags ?? []),
    });
    setSaving(false);
    onClose();
  };

  // Confirmed: the note hides at once and the Undo toast shows; the delete is sent when it ends.
  const handleDelete = () => {
    setConfirmDelete(false);
    deleteWithUndo([block.id], onDelete, { label: shortTitle(block.title, 48) });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-card border-white/10 w-[calc(100vw-1rem)] max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gradient-purple">Edit note</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="bg-background/50 border-white/10" onKeyDown={(e) => e.stopPropagation()} />
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Content" className="min-h-[120px] bg-background/50 border-white/10" onKeyDown={(e) => e.stopPropagation()} />

          {imageUrls.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {imageUrls.map((url, i) => (
                <div key={i} className="w-16 h-16 rounded-lg overflow-hidden border border-white/10 bg-muted/50">
                  <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Pillars {keyed.length > 0 && <span className="font-normal opacity-70">· keys 1-{keyed.length}</span>}</p>
            <div className="flex flex-wrap gap-1.5">
              {allPillars.map((p) => {
                const digit = keyed.indexOf(p) + 1;
                return (
                <button
                  key={p.id}
                  onClick={() => togglePillar(p.id)}
                  title={digit ? `${p.name} (key ${digit})` : p.name}
                  aria-pressed={pillars.includes(p.id)}
                  className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-all flex items-center gap-1.5 ${
                    pillars.includes(p.id) ? "text-white" : "opacity-40 hover:opacity-70"
                  }`}
                  style={{ backgroundColor: pillars.includes(p.id) ? p.color : p.color + "22", color: pillars.includes(p.id) ? "#fff" : p.color }}
                >
                  {digit > 0 && <span className="w-4 h-4 rounded-full bg-black/30 text-[9px] font-bold flex items-center justify-center shrink-0 tabular-nums" aria-hidden>{digit}</span>}
                  <PillarIcon icon={p.icon} iconUrl={p.iconUrl} size={14} className="inline-block" /> {p.name}
                </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-semibold text-muted-foreground">Tags</p>
              <TagLibraryPopover
                module="archive"
                currentTags={tags.split(",").map(t => t.trim()).filter(Boolean)}
                onAddTag={(tag) => setTags(prev => {
                  const current = prev.split(",").map(t => t.trim()).filter(Boolean);
                  if (current.includes(tag)) return prev;
                  return current.length > 0 ? `${prev}, ${tag}` : tag;
                })}
              />
            </div>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Custom tags (comma separated)" className="bg-background/50 border-white/10" onKeyDown={(e) => e.stopPropagation()} />
          </div>

          {semanticSearch && (
            <Collapsible open={relatedOpen} onOpenChange={async (isOpen) => {
              setRelatedOpen(isOpen);
              if (isOpen && relatedBlocks.length === 0 && block) {
                setRelatedLoading(true);
                const query = `${block.title} ${block.content}`.slice(0, 300);
                const results = await semanticSearch(query);
                setRelatedBlocks(results.filter((r) => r.id !== block.id).slice(0, 5));
                setRelatedLoading(false);
              }
            }}>
              <CollapsibleTrigger className="text-[11px] text-muted-foreground hover:text-foreground font-semibold transition-colors flex items-center gap-1">
                🔗 Related {relatedOpen ? "▾" : "▸"}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1.5">
                {relatedLoading ? (
                  <p className="text-[11px] text-muted-foreground animate-pulse">Finding related blocks...</p>
                ) : relatedBlocks.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No related blocks found.</p>
                ) : (
                  relatedBlocks.map((rb) => (
                    <button
                      key={rb.id}
                      onClick={() => onEditBlock?.(rb)}
                      className="w-full text-left px-3 py-2 rounded-lg bg-muted/30 border border-white/5 hover:border-primary/30 transition-all"
                    >
                      <p className="text-xs font-semibold text-foreground truncate">{rb.title || "Untitled"}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{rb.content.slice(0, 80)}</p>
                      {(rb as any).similarity !== undefined && (
                        <span className="text-[9px] text-primary font-bold">{Math.round((rb as any).similarity * 100)}%</span>
                      )}
                    </button>
                  ))
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          <div className="flex flex-wrap gap-2 sm:gap-3 pt-2">
            <Button variant="destructive" className="font-bold" onClick={() => setConfirmDelete(true)}>
              🗑️ Delete
            </Button>
            <ArchiveConfirmDialog
              open={confirmDelete}
              onOpenChange={setConfirmDelete}
              title="Delete this note?"
              description={<>“{shortTitle(block.title)}” will be deleted. You can undo it for a few seconds.</>}
              onConfirm={handleDelete}
            />
            <div className="flex-1" />
            <Button onClick={onClose} variant="outline" className="border-white/10 font-bold">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gradient-purple text-primary-foreground font-bold glow-sm">
              {saving ? "⏳ Saving..." : "💾 Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ArchiveEditModal;
