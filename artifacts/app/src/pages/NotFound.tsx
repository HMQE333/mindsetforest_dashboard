import { Link } from "react-router-dom";
import { motion } from "framer-motion";

const NotFound = () => (
  <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
    <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
    <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-cat-spirit/8 rounded-full blur-3xl" />

    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative z-10 text-center max-w-md px-4"
    >
      <div className="text-7xl mb-4">🌲</div>
      <h1 className="text-5xl font-bold text-gradient-purple mb-3">404</h1>
      <p className="text-lg text-muted-foreground mb-8">Lost in the forest. This path doesn't exist.</p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold gradient-purple text-primary-foreground hover:opacity-90 transition-all glow-sm"
      >
        🏠 Return Home
      </Link>
    </motion.div>
  </div>
);

export default NotFound;
