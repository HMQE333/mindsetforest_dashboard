import { useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate("/tracker");
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      }
      navigate("/tracker");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-cat-spirit/8 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-sm mx-4"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gradient-purple mb-2">MindsetForest</h1>
          <p className="text-sm text-muted-foreground">Track. Grind. Level Up.</p>
        </div>

        <div className="glass-card p-8 border-white/15">
          <h2 className="text-lg font-bold text-foreground mb-6 text-center">
            {isLogin ? "Welcome back" : "Create account"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full bg-secondary/50 border-2 border-border rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={6}
              className="w-full bg-secondary/50 border-2 border-border rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground"
            />

            {error && (
              <p className="text-xs text-destructive text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-bold gradient-purple text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-all glow-sm"
            >
              {loading ? "..." : isLogin ? "Sign In" : "Sign Up"}
            </button>
          </form>

          <button
            onClick={() => { setIsLogin(!isLogin); setError(""); }}
            className="w-full mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
