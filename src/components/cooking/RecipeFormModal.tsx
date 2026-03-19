import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Camera, Loader2, ImagePlus } from "lucide-react";
import { CookingRecipe } from "@/hooks/useCookingState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface RecipeFormModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (recipe: Partial<CookingRecipe>) => Promise<void>;
  initial?: CookingRecipe | null;
}

const DIFFICULTIES = ["easy", "medium", "hard", "pro"];
const STATUSES = ["tried", "want-to-try", "favourite", "failed"];
const STATUS_LABELS: Record<string, string> = { tried: "✅ Tried", "want-to-try": "🔖 Want to Try", favourite: "⭐ Favourite", failed: "❌ Failed" };

export default function RecipeFormModal({ open, onClose, onSave, initial }: RecipeFormModalProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    title: "", description: "", ingredients: "", instructions: "",
    notes: "", tags: "", rating: 0, servings: 4, cookTime: "",
    difficulty: "medium", status: "tried", costPerServing: "",
  });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (initial) {
      setForm({
        title: initial.title, description: initial.description,
        ingredients: initial.ingredients, instructions: initial.instructions,
        notes: initial.notes, tags: initial.tags.join(", "),
        rating: initial.rating || 0, servings: initial.servings,
        cookTime: initial.cookTime, difficulty: initial.difficulty,
        status: initial.status, costPerServing: initial.costPerServing?.toString() || "",
      });
      setPhotoUrl(initial.photoUrl || null);
    } else {
      setForm({ title: "", description: "", ingredients: "", instructions: "", notes: "", tags: "", rating: 0, servings: 4, cookTime: "", difficulty: "medium", status: "tried", costPerServing: "" });
      setPhotoUrl(null);
    }
  }, [initial, open]);

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Photo must be under 5MB"); return; }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("recipe-photos").upload(path, file, { upsert: true });
    if (error) { toast.error("Failed to upload photo"); setUploading(false); return; }

    const { data } = supabase.storage.from("recipe-photos").getPublicUrl(path);
    setPhotoUrl(data.publicUrl);
    setUploading(false);
    toast.success("Photo uploaded!");
  };

  const handleRemovePhoto = async () => {
    setPhotoUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    await onSave({
      ...(initial ? { id: initial.id } : {}),
      title: form.title.trim(),
      description: form.description,
      ingredients: form.ingredients,
      instructions: form.instructions,
      notes: form.notes,
      tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      rating: form.rating || null,
      servings: form.servings,
      cookTime: form.cookTime,
      difficulty: form.difficulty,
      status: form.status,
      costPerServing: form.costPerServing ? parseFloat(form.costPerServing) : null,
      photoUrl: photoUrl ?? null,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[300] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-xl max-h-[90vh] bg-card/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <h2 className="text-lg font-bold text-foreground">🍳 {initial ? "Edit Recipe" : "New Recipe"}</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5"><X className="w-5 h-5" /></button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            {/* Photo upload */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">📸 Photo</label>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              {photoUrl ? (
                <div className="relative group rounded-xl overflow-hidden border border-white/10 h-40">
                  <img src={photoUrl} alt="Recipe" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-muted/80 text-foreground text-xs font-medium flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5" /> Change
                    </button>
                    <button
                      onClick={handleRemovePhoto}
                      className="px-3 py-1.5 rounded-lg bg-destructive/80 text-white text-xs font-medium flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" /> Remove
                    </button>
                  </div>
                  {uploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-28 rounded-xl border border-dashed border-white/20 bg-muted/10 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  {uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  ) : (
                    <>
                      <ImagePlus className="w-5 h-5" />
                      <span className="text-xs font-medium">Click to upload a photo</span>
                      <span className="text-[10px] text-muted-foreground/60">JPG, PNG, WEBP · max 5MB</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Recipe Name *</label>
              <input value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Mushroom Risotto" className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
            </div>

            {/* Status + Difficulty */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Status</label>
                <div className="flex flex-wrap gap-1">
                  {STATUSES.map(s => (
                    <button key={s} onClick={() => set("status", s)} className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${form.status === s ? "bg-primary/20 border border-primary/50 text-primary" : "bg-muted/30 border border-white/5 text-muted-foreground hover:border-white/20"}`}>
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Difficulty</label>
                <div className="flex gap-1">
                  {DIFFICULTIES.map(d => (
                    <button key={d} onClick={() => set("difficulty", d)} className={`flex-1 px-2 py-1 rounded-lg text-xs font-medium transition-all capitalize ${form.difficulty === d ? "bg-primary/20 border border-primary/50 text-primary" : "bg-muted/30 border border-white/5 text-muted-foreground hover:border-white/20"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Cook time, Servings, Cost */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">⏱ Cook Time</label>
                <input value={form.cookTime} onChange={e => set("cookTime", e.target.value)} placeholder="e.g. 30 min" className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">🍽 Servings</label>
                <input type="number" min={1} value={form.servings} onChange={e => set("servings", parseInt(e.target.value) || 1)} className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">💰 Cost/Serving</label>
                <input type="number" min={0} step={0.01} value={form.costPerServing} onChange={e => set("costPerServing", e.target.value)} placeholder="€0.00" className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
              </div>
            </div>

            {/* Rating */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => set("rating", form.rating === n ? 0 : n)} className="transition-transform hover:scale-110">
                    <Star className={`w-6 h-6 ${n <= form.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Ingredients */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Ingredients</label>
              <textarea value={form.ingredients} onChange={e => set("ingredients", e.target.value)} placeholder="2 cups flour&#10;1 tsp salt&#10;..." rows={4} className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none" />
            </div>

            {/* Instructions */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Instructions</label>
              <textarea value={form.instructions} onChange={e => set("instructions", e.target.value)} placeholder="Step 1: Preheat oven to 180°C..." rows={5} className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none" />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Personal Notes</label>
              <textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="What worked, what to improve next time..." rows={3} className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none" />
            </div>

            {/* Tags */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Tags (comma separated)</label>
              <input value={form.tags} onChange={e => set("tags", e.target.value)} placeholder="italian, pasta, weeknight" className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
            </div>
          </div>

          <div className="px-5 py-4 border-t border-white/10 shrink-0">
            <button onClick={handleSubmit} disabled={!form.title.trim() || uploading} className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all disabled:opacity-40">
              {initial ? "Save Changes" : "Add Recipe"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
