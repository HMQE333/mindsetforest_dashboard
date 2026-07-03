import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bookmark, Plus, X, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSavedTags } from "@/hooks/useSavedTags";

interface Props {
  module: "archive" | "library";
  currentTags: string[];
  onAddTag: (tag: string) => void;
}

export default function TagLibraryPopover({ module, currentTags, onAddTag }: Props) {
  const { savedTags, saveTag, removeTag } = useSavedTags(module);
  const [newTag, setNewTag] = useState("");
  const [open, setOpen] = useState(false);

  const handleSaveNew = () => {
    const t = newTag.trim();
    if (t && !savedTags.includes(t)) {
      saveTag(t);
      setNewTag("");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="p-1.5 rounded-lg bg-muted/30 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
          title="Tag library"
        >
          <Bookmark className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 glass-card border-white/10" align="start" side="bottom">
        <div className="space-y-2">
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Tag className="w-3 h-3" /> Saved Tags
          </p>

          {savedTags.length === 0 ? (
            <p className="text-[10px] text-muted-foreground py-2 text-center">No saved tags yet</p>
          ) : (
            <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto">
              {savedTags.map(tag => {
                const isApplied = currentTags.includes(tag);
                return (
                  <div key={tag} className="group flex items-center gap-0.5">
                    <button
                      onClick={() => { if (!isApplied) onAddTag(tag); }}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                        isApplied
                          ? "bg-primary/20 text-primary cursor-default"
                          : "bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      }`}
                    >
                      {isApplied ? "✓ " : "+ "}{tag}
                    </button>
                    <button
                      onClick={() => removeTag(tag)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-1.5 pt-1 border-t border-white/5">
            <Input
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSaveNew(); } }}
              placeholder="Save new tag..."
              className="h-7 text-[11px] bg-muted/30 border-white/10 flex-1"
            />
            <button
              onClick={handleSaveNew}
              disabled={!newTag.trim()}
              className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all disabled:opacity-30"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Save current tags shortcut */}
          {currentTags.length > 0 && (
            <button
              onClick={() => currentTags.forEach(t => { if (!savedTags.includes(t)) saveTag(t); })}
              className="w-full text-[10px] text-muted-foreground hover:text-primary py-1 transition-all"
            >
              Save all current tags to library
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
