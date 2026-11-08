import { motion, AnimatePresence } from "framer-motion";
import { CATEGORIES, Category } from "@/lib/dashboard-data";
import { Mission } from "@/lib/dashboard-data";
import PillarIcon from "@/components/shared/PillarIcon";
import { Check } from "lucide-react";

interface CategoryGridProps {
  getMissions: (categoryId: string) => Mission[];
  getCompletedCount: (categoryId: string) => number;
  onSelectCategory: (categoryId: string) => void;
  projectCount?: number;
  categories?: Category[];
  showCompletionBadge?: boolean;
  /** "grid": the cards; "list": one compact row per category with a progress bar. */
  view?: "grid" | "list";
}

export default function CategoryGrid({ getMissions, getCompletedCount, onSelectCategory, projectCount = 0, categories, showCompletionBadge = true, view = "grid" }: CategoryGridProps) {
  const cats = categories || CATEGORIES;
  if (view === "list") {
    return (
      <div className="flex flex-col gap-2">
        {cats.map((cat, i) => {
          const missions = getMissions(cat.id);
          const completed = getCompletedCount(cat.id);
          const isAllDone = missions.length > 0 && completed === missions.length;
          const pct = missions.length ? Math.round((completed / missions.length) * 100) : 0;
          return (
            <motion.button
              key={cat.id}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.02 * i, duration: 0.3 }}
              onClick={() => onSelectCategory(cat.id)}
              className="glass-card-hover w-full px-4 py-3 flex items-center gap-3 text-left relative overflow-hidden group"
            >
              <span className="shrink-0" style={{ filter: `drop-shadow(0 0 6px ${cat.color})` }}>
                <PillarIcon icon={cat.icon} iconUrl={cat.iconUrl} size={30} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="font-semibold truncate" style={{ color: cat.color }}>{cat.name}</span>
                  <span className="hidden sm:inline text-xs text-foreground/50 truncate">{cat.tagline}</span>
                </span>
                <span className="mt-1.5 block h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                  <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: cat.color }} />
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-foreground/60 w-12 text-right">{completed}/{missions.length}</span>
              <span className="shrink-0 w-5 flex justify-center">
                {isAllDone && showCompletionBadge && <Check className="w-4 h-4" style={{ color: cat.color }} strokeWidth={3} />}
              </span>
            </motion.button>
          );
        })}
        {projectCount > 0 && (
          <button
            type="button"
            onClick={() => onSelectCategory("__projects__")}
            className="glass-card-hover w-full px-4 py-3 flex items-center gap-3 text-left"
          >
            <span className="text-2xl shrink-0">📂</span>
            <span className="flex-1 font-semibold" style={{ color: "#8B5CF6" }}>Projects</span>
            <span className="text-xs text-foreground/60">{projectCount} project{projectCount !== 1 ? "s" : ""}</span>
            <span className="w-5" />
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {cats.map((cat, i) => {
        const missions = getMissions(cat.id);
        const completed = getCompletedCount(cat.id);
        const isAllDone = missions.length > 0 && completed === missions.length;

        return (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => onSelectCategory(cat.id)}
            className="glass-card-hover p-8 cursor-pointer relative overflow-hidden group"
            style={{ "--card-color": cat.color } as React.CSSProperties}
          >
            {/* Gradient overlay */}
            <div
              className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity duration-300"
              style={{ background: `linear-gradient(135deg, ${cat.color}, transparent)` }}
            />

            {/* Completion badge */}
            <AnimatePresence>
              {isAllDone && showCompletionBadge && (
                <motion.div
                  key="badge"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18 }}
                  className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center z-10"
                  style={{
                    background: `color-mix(in srgb, ${cat.color} 20%, transparent)`,
                    border: `1.5px solid color-mix(in srgb, ${cat.color} 60%, transparent)`,
                    boxShadow: `0 0 10px color-mix(in srgb, ${cat.color} 40%, transparent)`,
                  }}
                >
                  <Check className="w-4 h-4" style={{ color: cat.color }} strokeWidth={3} />
                </motion.div>
              )}
            </AnimatePresence>

            <div
              className="block mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[5deg]"
              style={{ filter: `drop-shadow(0 0 10px ${cat.color})` }}
            >
              <PillarIcon icon={cat.icon} iconUrl={cat.iconUrl} size={48} />
            </div>
            <h3
              className="text-xl font-bold mb-2"
              style={{ color: cat.color }}
            >
              {cat.name}
            </h3>
            <p className="text-sm text-foreground/70 mb-4">{cat.tagline}</p>
            <p className="text-xs text-foreground/50">
              {completed}/{missions.length} completed
            </p>
          </motion.div>
        );
      })}

      {/* Projects Folder */}
      {projectCount > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 * cats.length, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          onClick={() => onSelectCategory("__projects__")}
          className="glass-card-hover p-8 cursor-pointer relative overflow-hidden group"
        >
          <div
            className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity duration-300"
            style={{ background: "linear-gradient(135deg, #8B5CF6, transparent)" }}
          />
          <span
            className="text-5xl block mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[5deg]"
            style={{ filter: "drop-shadow(0 0 10px #8B5CF6)" }}
          >
            📂
          </span>
          <h3 className="text-xl font-bold mb-2" style={{ color: "#8B5CF6" }}>
            Projects
          </h3>
          <p className="text-sm text-foreground/70 mb-4">Your custom projects</p>
          <p className="text-xs text-foreground/50">
            {projectCount} project{projectCount !== 1 ? "s" : ""}
          </p>
        </motion.div>
      )}
    </div>
  );
}
