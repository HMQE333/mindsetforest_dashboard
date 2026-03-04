import { motion } from "framer-motion";
import { CATEGORIES } from "@/lib/dashboard-data";
import { Mission } from "@/lib/dashboard-data";
import { UserProject } from "@/hooks/useUserProjects";

interface CategoryGridProps {
  getMissions: (categoryId: string) => Mission[];
  getCompletedCount: (categoryId: string) => number;
  onSelectCategory: (categoryId: string) => void;
  projects?: UserProject[];
}

export default function CategoryGrid({ getMissions, getCompletedCount, onSelectCategory, projects = [] }: CategoryGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {CATEGORIES.map((cat, i) => {
        const missions = getMissions(cat.id);
        const completed = getCompletedCount(cat.id);

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

            <span
              className="text-5xl block mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[5deg]"
              style={{ filter: `drop-shadow(0 0 10px ${cat.color})` }}
            >
              {cat.icon}
            </span>
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

      {/* User Projects */}
      {projects.map((proj, i) => {
        const key = `project-${proj.id}`;
        const missions = getMissions(key);
        const completed = getCompletedCount(key);
        const color = "#8B5CF6";

        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 * (CATEGORIES.length + i), duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => onSelectCategory(key)}
            className="glass-card-hover p-8 cursor-pointer relative overflow-hidden group"
          >
            <div
              className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity duration-300"
              style={{ background: `linear-gradient(135deg, ${color}, transparent)` }}
            />
            <span
              className="text-5xl block mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[5deg]"
              style={{ filter: `drop-shadow(0 0 10px ${color})` }}
            >
              {proj.emoji}
            </span>
            <h3 className="text-xl font-bold mb-2" style={{ color }}>
              {proj.name}
            </h3>
            <p className="text-sm text-foreground/70 mb-4">Project</p>
            <p className="text-xs text-foreground/50">
              {completed}/{missions.length} completed
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}
