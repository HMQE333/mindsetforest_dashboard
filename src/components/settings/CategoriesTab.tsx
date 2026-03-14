import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Camera, X } from "lucide-react";
import { CATEGORIES } from "@/lib/dashboard-data";
import { CustomCategory } from "@/hooks/useUserSettings";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import PillarIcon from "@/components/shared/PillarIcon";

const COLOR_PRESETS = [
  { color: "#8B5CF6", lightColor: "#A78BFA", label: "Purple" },
  { color: "#EF4444", lightColor: "#F87171", label: "Red" },
  { color: "#F97316", lightColor: "#FB923C", label: "Orange" },
  { color: "#06B6D4", lightColor: "#22D3EE", label: "Cyan" },
  { color: "#FBBF24", lightColor: "#FCD34D", label: "Gold" },
  { color: "#6366F1", lightColor: "#818CF8", label: "Indigo" },
  { color: "#D946EF", lightColor: "#E879F9", label: "Pink" },
  { color: "#A1A1AA", lightColor: "#D4D4D8", label: "Gray" },
  { color: "#10B981", lightColor: "#34D399", label: "Green" },
  { color: "#EC4899", lightColor: "#F472B6", label: "Rose" },
];

const MAX_FILE_SIZE = 256 * 1024; // 256KB

async function resizeToSquare(file: File, size: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      }, "image/png");
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

interface CategoriesTabProps {
  customCategories: CustomCategory[];
  onSave: (cats: CustomCategory[]) => Promise<void>;
}

export default function CategoriesTab({ customCategories, onSave }: CategoriesTabProps) {
  const { user } = useAuth();
  const [editing, setEditing] = useState<CustomCategory[]>([]);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const merged = CATEGORIES.map(cat => {
      const custom = customCategories.find(c => c.id === cat.id);
      return {
        id: cat.id,
        name: custom?.name || cat.name,
        tagline: custom?.tagline || cat.tagline,
        icon: custom?.icon || cat.icon,
        iconUrl: custom?.iconUrl || undefined,
        color: custom?.color || cat.color,
        lightColor: custom?.lightColor || cat.lightColor,
      };
    });
    setEditing(merged);
  }, [customCategories]);

  const update = (id: string, field: keyof CustomCategory, value: string) => {
    setEditing(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    setDirty(true);
  };

  const updateColor = (id: string, color: string, lightColor: string) => {
    setEditing(prev => prev.map(c => c.id === id ? { ...c, color, lightColor } : c));
    setDirty(true);
  };

  const handleIconUpload = async (catId: string, file: File) => {
    if (!user) return;
    if (file.type !== "image/png") {
      toast.error("Only PNG files accepted");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Icon must be under 256KB");
      return;
    }

    setUploading(catId);
    try {
      const resized = await resizeToSquare(file, 64);
      const path = `${user.id}/${catId}.png`;

      // Remove old file first (ignore errors)
      await supabase.storage.from("pillar-icons").remove([path]);

      const { error } = await supabase.storage.from("pillar-icons").upload(path, resized, {
        contentType: "image/png",
        upsert: true,
      });
      if (error) throw error;

      const { data: urlData } = supabase.storage.from("pillar-icons").getPublicUrl(path);
      const iconUrl = urlData.publicUrl + "?t=" + Date.now(); // cache bust

      setEditing(prev => prev.map(c => c.id === catId ? { ...c, iconUrl } : c));
      setDirty(true);
      toast.success("Icon uploaded");
    } catch (e: any) {
      toast.error("Upload failed: " + (e.message || "Unknown error"));
    } finally {
      setUploading(null);
    }
  };

  const handleRemoveIcon = async (catId: string) => {
    if (!user) return;
    const path = `${user.id}/${catId}.png`;
    await supabase.storage.from("pillar-icons").remove([path]);
    setEditing(prev => prev.map(c => c.id === catId ? { ...c, iconUrl: undefined } : c));
    setDirty(true);
  };

  const handleSave = async () => {
    await onSave(editing);
    setDirty(false);
  };

  const handleReset = () => {
    setEditing(CATEGORIES.map(cat => ({
      id: cat.id,
      name: cat.name,
      tagline: cat.tagline,
      icon: cat.icon,
      iconUrl: undefined,
      color: cat.color,
      lightColor: cat.lightColor,
    })));
    setDirty(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <p className="text-xs text-muted-foreground">Customize your life pillars</p>
        <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Reset to defaults
        </button>
      </div>

      <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
        {editing.map((cat, i) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="glass-card p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              {/* Icon area: emoji input or uploaded image */}
              <div className="relative w-10 h-10 flex-shrink-0">
                {cat.iconUrl ? (
                  <>
                    <PillarIcon icon={cat.icon} iconUrl={cat.iconUrl} size={40} className="rounded-lg" />
                    <button
                      onClick={() => handleRemoveIcon(cat.id)}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[10px] hover:scale-110 transition-transform"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      value={cat.icon}
                      onChange={e => update(cat.id, "icon", e.target.value)}
                      className="w-10 h-10 text-center text-xl bg-transparent border border-white/10 rounded-lg focus:outline-none focus:border-primary/50"
                      maxLength={4}
                    />
                    <button
                      onClick={() => fileInputRefs.current[cat.id]?.click()}
                      disabled={uploading === cat.id}
                      className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-muted border border-border flex items-center justify-center hover:bg-accent transition-colors"
                      title="Upload PNG icon"
                    >
                      <Camera className="w-2.5 h-2.5 text-muted-foreground" />
                    </button>
                  </>
                )}
                <input
                  ref={el => { fileInputRefs.current[cat.id] = el; }}
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleIconUpload(cat.id, f);
                    e.target.value = "";
                  }}
                />
              </div>

              <div className="flex-1 space-y-1">
                <input
                  value={cat.name}
                  onChange={e => update(cat.id, "name", e.target.value)}
                  className="w-full bg-transparent text-sm font-bold text-foreground border-b border-white/10 focus:outline-none focus:border-primary/50 pb-0.5"
                  maxLength={30}
                  placeholder="Name"
                />
                <input
                  value={cat.tagline}
                  onChange={e => update(cat.id, "tagline", e.target.value)}
                  className="w-full bg-transparent text-xs text-muted-foreground border-b border-white/10 focus:outline-none focus:border-primary/50 pb-0.5"
                  maxLength={50}
                  placeholder="Tagline"
                />
              </div>
            </div>
            {/* Color picker */}
            <div className="flex gap-1.5 flex-wrap">
              {COLOR_PRESETS.map(cp => (
                <button
                  key={cp.color}
                  onClick={() => updateColor(cat.id, cp.color, cp.lightColor)}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${
                    cat.color === cp.color ? "border-foreground scale-125" : "border-transparent"
                  }`}
                  style={{ backgroundColor: cp.color }}
                  title={cp.label}
                />
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground/60 text-center">PNG only · max 256KB · square recommended</p>

      {dirty && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleSave}
          className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all"
        >
          Save Categories
        </motion.button>
      )}
    </div>
  );
}
