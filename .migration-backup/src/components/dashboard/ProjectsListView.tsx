import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { UserProject } from "@/hooks/useUserProjects";
import { Mission } from "@/lib/dashboard-data";

interface ProjectsListViewProps {
  projects: UserProject[];
  getMissions: (categoryId: string) => Mission[];
  getCompletedCount: (categoryId: string) => number;
  onSelectProject: (projectKey: string) => void;
  onBack: () => void;
}

export default function ProjectsListView({ projects, getMissions, getCompletedCount, onSelectProject, onBack }: ProjectsListViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="flex items-center gap-3 mb-8">
        <span className="text-4xl">📂</span>
        <h2 className="text-2xl font-bold" style={{ color: "#8B5CF6" }}>Projects</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {projects.map((proj, i) => {
          const key = `project-${proj.id}`;
          const missions = getMissions(key);
          const completed = getCompletedCount(key);

          return (
            <motion.div
              key={proj.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => onSelectProject(key)}
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
                {proj.emoji}
              </span>
              <h3 className="text-xl font-bold mb-2" style={{ color: "#8B5CF6" }}>
                {proj.name}
              </h3>
              <p className="text-xs text-foreground/50">
                {completed}/{missions.length} completed
              </p>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
