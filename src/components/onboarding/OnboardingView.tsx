import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { Check, Loader2, X } from "lucide-react";
import { CATEGORIES, Mission } from "@/lib/dashboard-data";
import { CustomCategory } from "@/hooks/useOnboarding";
import { useUserProfile, isValidUsername } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import TaskCustomizationStep from "./TaskCustomizationStep";

const DEFAULT_ICONS = ["🧠", "💪", "🎨", "🔭", "👑", "📊", "✨", "⚙️"];
const AVATAR_EMOJIS = ["🦊", "🐺", "🦉", "🐯", "🦁", "🐻", "🐼", "🐨", "🦄", "🐉", "🦅", "🦋", "🌸", "🌿", "🌲", "🔥", "⚡", "✨", "🌙", "☀️", "🌊", "🏔️"];

const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Min 3 characters")
    .max(20, "Max 20 characters")
    .regex(/^[a-z0-9_]+$/, "Only a-z, 0-9 and _"),
  display_name: z.string().trim().max(40, "Max 40 characters").optional(),
});

interface Props {
  onComplete: (categories?: CustomCategory[], customMissions?: Record<string, Mission[]>) => void;
}

export default function OnboardingView({ onComplete }: Props) {
  const { profile, needsSetup, updateProfile, checkUsernameAvailable } = useUserProfile();
  const initialStep = needsSetup ? "profile" : "choice";
  const [step, setStep] = useState<"profile" | "choice" | "custom" | "tasks">(initialStep);

  // If profile loads after mount and needs setup, jump to the profile step.
  useEffect(() => {
    if (needsSetup && step === "choice") setStep("profile");
  }, [needsSetup]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- Profile-step state -----
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarEmoji, setAvatarEmoji] = useState("🦊");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [profileError, setProfileError] = useState<string>("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Seed avatar from existing profile when it lands.
  useEffect(() => {
    if (profile?.avatar_emoji) setAvatarEmoji(profile.avatar_emoji);
    if (profile?.display_name) setDisplayName(profile.display_name);
  }, [profile?.avatar_emoji, profile?.display_name]);

  // Debounced availability check
  useEffect(() => {
    const u = username.trim().toLowerCase();
    setProfileError("");
    if (!u) { setAvailable(null); return; }
    if (!isValidUsername(u)) { setAvailable(false); return; }
    setChecking(true);
    const t = setTimeout(async () => {
      const ok = await checkUsernameAvailable(u);
      setAvailable(ok);
      setChecking(false);
    }, 350);
    return () => clearTimeout(t);
  }, [username, checkUsernameAvailable]);

  const usernameValid = useMemo(() => isValidUsername(username.trim().toLowerCase()), [username]);

  const handleProfileNext = async () => {
    const parsed = profileSchema.safeParse({ username, display_name: displayName });
    if (!parsed.success) {
      setProfileError(parsed.error.issues[0]?.message || "Invalid input");
      return;
    }
    if (available === false) {
      setProfileError("Username already taken");
      return;
    }
    setSavingProfile(true);
    const ok = await updateProfile({
      username: parsed.data.username,
      display_name: parsed.data.display_name || "",
      avatar_emoji: avatarEmoji,
    });
    setSavingProfile(false);
    if (!ok) return; // toast shown by hook
    toast.success("Profile saved");
    setStep("choice");
  };

  const [customs, setCustoms] = useState<CustomCategory[]>(
    CATEGORIES.map((c, i) => ({
      id: c.id,
      name: c.name,
      tagline: c.tagline,
      icon: DEFAULT_ICONS[i] || "📌",
    }))
  );
  // Track whether user chose defaults or custom categories
  const [useDefaults, setUseDefaults] = useState(false);

  const updateCustom = (index: number, field: keyof CustomCategory, value: string) => {
    setCustoms(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const getCategories = () => {
    if (useDefaults) {
      return CATEGORIES.map((c, i) => ({ id: c.id, name: c.name, icon: DEFAULT_ICONS[i] || "📌" }));
    }
    return customs.map(c => ({ id: c.id, name: c.name, icon: c.icon }));
  };

  const getDefaultMissions = (): Record<string, Mission[]> => {
    const result: Record<string, Mission[]> = {};
    CATEGORIES.forEach(c => { result[c.id] = c.missions; });
    return result;
  };

  const handleTasksComplete = (customMissions: Record<string, Mission[]>) => {
    const hasAny = Object.values(customMissions).some(m => m.length > 0);
    onComplete(
      useDefaults ? undefined : customs,
      hasAny ? customMissions : undefined
    );
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden px-4">
      <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-cat-spirit/8 rounded-full blur-3xl" />

      <AnimatePresence mode="wait">
        {step === "profile" ? (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative z-10 w-full max-w-md"
          >
            <div className="text-center mb-6">
              <motion.div
                key={avatarEmoji}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-6xl mb-3"
              >
                {avatarEmoji}
              </motion.div>
              <h1 className="text-2xl font-bold text-gradient-purple mb-1">Pick your handle</h1>
              <p className="text-xs text-muted-foreground">
                This is how friends find you and how the Forest credits your seeds.
              </p>
            </div>

            <div className="glass-card p-5 border-white/15 space-y-4">
              {/* Username */}
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">@</span>
                  <input
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    placeholder="your_handle"
                    maxLength={20}
                    className="w-full bg-secondary/50 border-2 border-border rounded-xl pl-7 pr-10 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {checking ? (
                      <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                    ) : username && usernameValid && available === true ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : username && (available === false || !usernameValid) ? (
                      <X className="w-4 h-4 text-destructive" />
                    ) : null}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  3–20 chars · letters, numbers, underscores
                </p>
              </div>

              {/* Display name */}
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                  Display name <span className="text-muted-foreground/60 normal-case font-normal">(optional)</span>
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="What should we call you?"
                  maxLength={40}
                  className="w-full bg-secondary/50 border-2 border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground"
                />
              </div>

              {/* Emoji picker */}
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                  Avatar
                </label>
                <div className="grid grid-cols-8 gap-1.5">
                  {AVATAR_EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setAvatarEmoji(e)}
                      className={`aspect-square rounded-lg text-xl transition-all ${
                        avatarEmoji === e
                          ? "bg-primary/20 border-2 border-primary scale-110"
                          : "bg-muted/40 border-2 border-transparent hover:bg-muted/70"
                      }`}
                      aria-label={`Pick ${e} avatar`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {profileError && (
                <p className="text-xs text-destructive">{profileError}</p>
              )}

              <button
                onClick={handleProfileNext}
                disabled={savingProfile || !usernameValid || available === false || checking}
                className="w-full py-3 rounded-xl text-sm font-bold gradient-purple text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all glow-sm"
              >
                {savingProfile ? "Saving…" : "Continue →"}
              </button>
            </div>
          </motion.div>
        ) : step === "choice" ? (
          <motion.div
            key="choice"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative z-10 w-full max-w-md text-center"
          >
            <div className="text-5xl mb-6">🌲</div>
            <h1 className="text-2xl font-bold text-gradient-purple mb-2">Welcome to MindsetForest</h1>
            <p className="text-sm text-muted-foreground mb-10">
              How would you like to set up your life categories?
            </p>

            <div className="space-y-4">
              <button
                onClick={() => { setUseDefaults(true); setStep("tasks"); }}
                className="w-full glass-card p-5 border-white/15 hover:border-primary/40 transition-all text-left group"
              >
                <div className="flex items-center gap-4">
                  <span className="text-3xl">⚡</span>
                  <div>
                    <p className="font-bold text-foreground group-hover:text-primary transition-colors">Use defaults</p>
                    <p className="text-xs text-muted-foreground">8 pre-configured life categories with ready-to-go missions</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setStep("custom")}
                className="w-full glass-card p-5 border-white/15 hover:border-primary/40 transition-all text-left group"
              >
                <div className="flex items-center gap-4">
                  <span className="text-3xl">✏️</span>
                  <div>
                    <p className="font-bold text-foreground group-hover:text-primary transition-colors">Customize my own</p>
                    <p className="text-xs text-muted-foreground">Define your own 8 life pillars and what they mean to you</p>
                  </div>
                </div>
              </button>
            </div>
          </motion.div>
        ) : step === "custom" ? (
          <motion.div
            key="custom"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative z-10 w-full max-w-lg"
          >
            <button
              onClick={() => setStep("choice")}
              className="text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
            >
              ← Back
            </button>

            <h2 className="text-xl font-bold text-foreground mb-1">Your 8 Life Pillars</h2>
            <p className="text-xs text-muted-foreground mb-6">
              Name each category and describe what it means to you. You can change these later.
            </p>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              {customs.map((cat, i) => (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card p-4 border-white/10"
                >
                  <div className="flex items-start gap-3">
                    <input
                      value={cat.icon}
                      onChange={e => updateCustom(i, "icon", e.target.value)}
                      className="w-10 h-10 text-center text-xl bg-muted/50 rounded-lg border border-border outline-none focus:border-primary transition-colors flex-shrink-0"
                      maxLength={2}
                    />
                    <div className="flex-1 space-y-2">
                      <input
                        value={cat.name}
                        onChange={e => updateCustom(i, "name", e.target.value)}
                        placeholder="Category name"
                        className="w-full bg-transparent text-sm font-bold text-foreground outline-none border-b border-border/50 focus:border-primary pb-1 transition-colors"
                        maxLength={20}
                      />
                      <input
                        value={cat.tagline}
                        onChange={e => updateCustom(i, "tagline", e.target.value)}
                        placeholder="What does this mean to you?"
                        className="w-full bg-transparent text-xs text-muted-foreground outline-none border-b border-border/30 focus:border-primary/50 pb-1 transition-colors"
                        maxLength={40}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <button
              onClick={() => { setUseDefaults(false); setStep("tasks"); }}
              className="w-full mt-6 py-3 rounded-xl text-sm font-bold gradient-purple text-primary-foreground hover:opacity-90 transition-all glow-sm"
            >
              Next: Customize Tasks →
            </button>
          </motion.div>
        ) : (
          <TaskCustomizationStep
            key="tasks"
            categories={getCategories()}
            defaultMissions={getDefaultMissions()}
            onComplete={handleTasksComplete}
            onBack={() => setStep(useDefaults ? "choice" : "custom")}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
