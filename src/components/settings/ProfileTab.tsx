import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Loader2, RefreshCw, X } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserProfile, isValidUsername } from "@/hooks/useUserProfile";

const AVATAR_EMOJIS = [
  "🦊", "🐺", "🦉", "🐯", "🦁", "🐻", "🐼", "🐨", "🦄", "🐉", "🦅", "🦋",
  "🌸", "🌿", "🌲", "🔥", "⚡", "✨", "🌙", "☀️", "🌊", "🏔️",
];

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

export default function ProfileTab() {
  const { profile, loading, updateProfile, regenerateFriendCode, checkUsernameAvailable } = useUserProfile();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarEmoji, setAvatarEmoji] = useState("🦊");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Seed from current profile
  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username?.startsWith("user_") ? "" : profile.username || "");
    setDisplayName(profile.display_name || "");
    setAvatarEmoji(profile.avatar_emoji || "🦊");
  }, [profile?.username, profile?.display_name, profile?.avatar_emoji]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced availability check
  useEffect(() => {
    const u = username.trim().toLowerCase();
    setError("");
    if (!u) { setAvailable(null); return; }
    if (!isValidUsername(u)) { setAvailable(false); return; }
    if (profile && profile.username === u) { setAvailable(true); return; }
    setChecking(true);
    const t = setTimeout(async () => {
      const ok = await checkUsernameAvailable(u);
      setAvailable(ok);
      setChecking(false);
    }, 350);
    return () => clearTimeout(t);
  }, [username, checkUsernameAvailable, profile?.username]); // eslint-disable-line react-hooks/exhaustive-deps

  const usernameValid = useMemo(
    () => isValidUsername(username.trim().toLowerCase()),
    [username]
  );

  const dirty = useMemo(() => {
    if (!profile) return false;
    const u = username.trim().toLowerCase();
    return (
      (u && u !== profile.username) ||
      displayName !== (profile.display_name || "") ||
      avatarEmoji !== (profile.avatar_emoji || "🦊")
    );
  }, [profile, username, displayName, avatarEmoji]);

  const handleSave = async () => {
    const parsed = profileSchema.safeParse({ username, display_name: displayName });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Invalid input");
      return;
    }
    if (available === false) {
      setError("Username already taken");
      return;
    }
    setSaving(true);
    const ok = await updateProfile({
      username: parsed.data.username,
      display_name: parsed.data.display_name || "",
      avatar_emoji: avatarEmoji,
    });
    setSaving(false);
    if (ok) toast.success("Profile saved");
  };

  const handleCopyCode = async () => {
    if (!profile?.friend_code) return;
    try {
      await navigator.clipboard.writeText(profile.friend_code);
      toast.success("Friend code copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    await regenerateFriendCode();
    setRegenerating(false);
  };

  if (loading || !profile) {
    return <div className="text-center py-10 text-muted-foreground animate-pulse">Loading profile…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Hero card */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-primary/15 via-card/40 to-card/10 p-5">
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <motion.div
            key={avatarEmoji}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="flex items-center justify-center w-20 h-20 rounded-2xl bg-card/70 border border-white/15 text-5xl shadow-lg backdrop-blur-sm"
          >
            {avatarEmoji}
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground/80">Your identity</div>
            <div className="text-xl font-bold text-foreground truncate">
              {displayName || (username ? `@${username}` : `@${profile.username}`)}
            </div>
            <div className="text-sm text-muted-foreground truncate">
              @{(username.trim().toLowerCase() || profile.username)}
            </div>
          </div>
        </div>
      </div>

      {/* Avatar picker */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-foreground">Avatar</Label>
        <div className="grid grid-cols-8 gap-2">
          {AVATAR_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setAvatarEmoji(e)}
              className={`aspect-square flex items-center justify-center text-2xl rounded-xl border transition-all ${
                avatarEmoji === e
                  ? "border-primary bg-primary/15 scale-105 glow-sm"
                  : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
              }`}
              aria-label={`Choose ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Username */}
      <div className="space-y-2">
        <Label htmlFor="username" className="text-sm font-semibold text-foreground">Username</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground select-none">@</span>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="your_handle"
            maxLength={20}
            className="pl-7 pr-10 bg-white/5 border-white/10"
            autoComplete="off"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {checking && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            {!checking && username && usernameValid && available === true && (
              <Check className="w-4 h-4 text-emerald-400" />
            )}
            {!checking && username && (available === false || !usernameValid) && (
              <X className="w-4 h-4 text-destructive" />
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">3–20 chars · lowercase letters, digits, underscore</p>
      </div>

      {/* Display name */}
      <div className="space-y-2">
        <Label htmlFor="display" className="text-sm font-semibold text-foreground">Display name <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input
          id="display"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="How friends see you"
          maxLength={40}
          className="bg-white/5 border-white/10"
        />
      </div>

      {/* Friend code */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-foreground">Friend code</Label>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 font-mono text-lg tracking-[0.25em] text-foreground text-center">
            {profile.friend_code}
          </div>
          <Button type="button" variant="outline" size="icon" onClick={handleCopyCode} title="Copy">
            <Copy className="w-4 h-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={handleRegenerate} disabled={regenerating} title="Generate new code">
            <RefreshCw className={`w-4 h-4 ${regenerating ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Share this with friends so they can add you.</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={!dirty || saving || checking || (username !== "" && available === false)}
          className="gradient-purple text-primary-foreground"
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save changes"}
        </Button>
      </div>
    </div>
  );
}