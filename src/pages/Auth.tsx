import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

function getPasswordStrength(pw: string): { label: string; percent: number; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { label: "Weak", percent: 25, color: "bg-destructive" };
  if (score === 2) return { label: "Fair", percent: 50, color: "bg-yellow-500" };
  if (score === 3) return { label: "Good", percent: 75, color: "bg-emerald-400" };
  return { label: "Strong", percent: 100, color: "bg-emerald-500" };
}

function getPasswordErrors(pw: string): string[] {
  const errors: string[] = [];
  if (pw.length < 8) errors.push("Min. 8 characters");
  if (!/[A-Z]/.test(pw)) errors.push("1 uppercase letter");
  if (!/[0-9]/.test(pw)) errors.push("1 digit");
  return errors;
}

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const passwordErrors = useMemo(() => getPasswordErrors(password), [password]);
  const isPasswordValid = passwordErrors.length === 0;

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isLogin && !isPasswordValid) {
      setError("Password does not meet requirements");
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      }
      navigate("/");
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
          <p className="text-sm text-muted-foreground">Your Life. Your Quest.</p>
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
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                minLength={6}
                className="w-full bg-secondary/50 border-2 border-border rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground"
              />

              {/* Password strength indicator - signup only */}
              {!isLogin && password.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2 space-y-1.5">
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${strength.color}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${strength.percent}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">{strength.label}</span>
                    {passwordErrors.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        Need: {passwordErrors.join(", ")}
                      </span>
                    )}
                  </div>
                </motion.div>
              )}
            </div>

            {error && (
              <p className="text-xs text-destructive text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || (!isLogin && !isPasswordValid && password.length > 0)}
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
