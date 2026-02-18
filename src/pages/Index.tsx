import { Link } from "react-router-dom";
import { motion } from "framer-motion";

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-cat-spirit/8 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="text-center relative z-10"
      >
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl gradient-purple border-2 border-primary/40 glow-md animate-pulse-glow mb-8">
          <span className="text-2xl animate-fire">🔥</span>
          <span className="text-lg font-bold text-primary-foreground">Gamified Productivity</span>
        </div>

        <h1 className="mb-4 text-4xl font-bold text-gradient-purple">MindsetForest</h1>
        <p className="text-lg text-muted-foreground mb-10">Track. Grind. Level Up.</p>

        <Link
          to="/tracker"
          className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl gradient-purple text-primary-foreground font-bold text-lg glow-md hover:opacity-90 transition-all hover:-translate-y-1"
        >
          📊 Stats Tracker
        </Link>
      </motion.div>
    </div>
  );
};

export default Index;
