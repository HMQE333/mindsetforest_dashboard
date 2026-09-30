import { useEffect, useState } from "react";
import { EyeOff, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * What the computer tracker never records. Adult sites and words are built
 * in (agent and database trigger, see 20260930120000_app_usage_privacy.sql);
 * here the user adds their own keywords, which the database applies at once
 * and the agent picks up at its next sync. Time recorded before a keyword
 * existed is cleared on request (app_usage_forget_private).
 */
export default function ComputerTimePrivacy({ onForgotten }: { onForgotten: () => void }) {
  const { user } = useAuth();
  const [keywords, setKeywords] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);

  useEffect(() => {
    if (!user) return;
    void (supabase.from("app_tracking_privacy" as never) as any)
      .select("keywords")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: { data: { keywords?: string[] } | null }) => setKeywords(data?.keywords ?? []));
  }, [user]);

  const save = async (next: string[]) => {
    if (!user) return false;
    setSaving(true);
    const { error } = await (supabase.from("app_tracking_privacy" as never) as any)
      .upsert({ user_id: user.id, keywords: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast.error("Couldn't save the private keywords", { description: error.message });
      return false;
    }
    setKeywords(next);
    return true;
  };

  const add = async () => {
    const k = draft.trim().toLowerCase();
    if (k.length < 2 || keywords.includes(k)) { setDraft(""); return; }
    if (await save([...keywords, k])) {
      setDraft("");
      toast.success(`"${k}" won't be tracked`, { description: "Use “Clear past private time” to remove what was recorded before." });
    }
  };

  const forget = async () => {
    const { data, error } = await (supabase.rpc as any)("app_usage_forget_private");
    if (error) {
      toast.error("Couldn't clear past private time", { description: error.message });
      return;
    }
    const n = Number(data) || 0;
    toast.success(n > 0 ? `Removed ${n} private ${n === 1 ? "session" : "sessions"}` : "Nothing private was recorded");
    onForgotten();
  };

  return (
    <div className="mt-6 rounded-xl border border-border/50 bg-secondary/20 px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h4 className="text-sm font-semibold text-foreground">Private: never tracked</h4>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Adult sites and words are never recorded: the tracker skips those windows and the database refuses them.
        Add your own keywords below; a window whose title contains one is not recorded either. Your tracker picks
        them up at its next sync.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 rounded-full bg-muted/50 border border-white/10 pl-2.5 pr-1 py-0.5 text-xs">
            {k}
            <button
              type="button"
              onClick={() => void save(keywords.filter((x) => x !== k))}
              disabled={saving}
              aria-label={`Track "${k}" again`}
              className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {keywords.length === 0 && <span className="text-xs text-muted-foreground/70 italic">No keywords of your own yet.</span>}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); void add(); }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Keyword or site, e.g. tinder"
          maxLength={60}
          className="flex-1 min-w-0 bg-secondary/40 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs text-foreground"
        />
        <button
          type="submit"
          disabled={saving || draft.trim().length < 2}
          className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/25 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </form>
      <button
        type="button"
        onClick={() => setConfirmForget(true)}
        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive"
      >
        Clear past private time
      </button>

      <AlertDialog open={confirmForget} onOpenChange={setConfirmForget}>
        <AlertDialogContent className="glass-card border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear past private time?</AlertDialogTitle>
            <AlertDialogDescription>
              Every recorded session that matches the built-in adult list or your keywords is deleted from your
              computer time. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void forget()}
            >
              Clear it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
