import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link2, RefreshCw, Check, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Props {
  onDataFetched?: () => void;
}

export default function IntervalsIntegration({ onDataFetched }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [athleteId, setAthleteId] = useState("");
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loadingCreds, setLoadingCreds] = useState(true);

  // Load saved credentials on mount
  useEffect(() => {
    if (!user) return;
    const loadCreds = async () => {
      const { data } = await supabase
        .from("user_onboarding")
        .select("preferences")
        .eq("user_id", user.id)
        .maybeSingle();
      const prefs = (data?.preferences || {}) as Record<string, unknown>;
      if (prefs.intervals_api_key && prefs.intervals_athlete_id) {
        setApiKey(prefs.intervals_api_key as string);
        setAthleteId(prefs.intervals_athlete_id as string);
        setConfigured(true);
        setOpen(true);
      }
      if (prefs.intervals_last_sync) {
        setLastSync(prefs.intervals_last_sync as string);
      }
      setLoadingCreds(false);
    };
    loadCreds();
  }, [user]);

  const handleSave = async () => {
    if (!apiKey.trim() || !athleteId.trim()) {
      toast.error("Wprowadź API key i Athlete ID");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("fetch-intervals-icu", {
        body: { action: "save", apiKey: apiKey.trim(), athleteId: athleteId.trim() },
      });
      if (error) throw error;
      setConfigured(true);
      setLastSync(null);
      toast.success("Intervals.icu skonfigurowany!");
    } catch (e: any) {
      toast.error(e?.message || "Błąd zapisywania");
    }
    setSaving(false);
  };

  const handleFetch = async () => {
    if (!apiKey.trim() || !athleteId.trim()) {
      toast.error("Najpierw zapisz konfigurację");
      return;
    }
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-intervals-icu", {
        body: { action: "fetch", apiKey: apiKey.trim(), athleteId: athleteId.trim() },
      });
      if (error) throw error;
      const now = new Date().toLocaleString("pl-PL");
      setLastSync(now);
      toast.success(data?.message || "Dane pobrane!");
      onDataFetched?.();
    } catch (e: any) {
      toast.error(e?.message || "Błąd pobierania");
    }
    setFetching(false);
  };

  if (loadingCreds) return null;

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/20 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground">
              intervals.icu. Automatyczny import z Garmina
            </div>
            <div className="text-xs text-muted-foreground">
              {configured
                ? lastSync
                  ? `Ostatnia synchronizacja: ${lastSync}`
                  : "Skonfigurowany. Kliknij Pobierz dane"
                : "Podepnij dane z zegarka automatycznie"}
            </div>
          </div>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
      </button>

      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="px-4 pb-4 space-y-4 border-t border-white/10 pt-4"
        >
          <div className="bg-muted/30 rounded-xl p-4 text-sm space-y-2">
            <div className="font-bold text-foreground">📋 Jak podpiąć intervals.icu:</div>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Zaloguj się na <a href="https://intervals.icu" target="_blank" className="text-primary underline">intervals.icu</a> i połącz z Garmin Connect</li>
              <li>Wejdź w <strong>Ustawienia → API</strong> (kliknij swoje zdjęcie profilowe → Settings)</li>
              <li>Skopiuj <strong>Athlete ID</strong> i wygeneruj <strong>API Key</strong></li>
              <li>Wklej je poniżej i kliknij <strong>Zapisz i pobierz</strong></li>
            </ol>
            <div className="text-xs text-muted-foreground mt-2 italic">
              Importowane: tętno spoczynkowe, HRV, sen (score + jakość), waga, kroki, SpO₂.
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
                Athlete ID
              </label>
              <input
                type="text"
                value={athleteId}
                onChange={(e) => setAthleteId(e.target.value)}
                placeholder="np. I12345"
                className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="xxxxxxxxxx"
                className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {saving ? "⏳" : <Check className="w-4 h-4" />}
              Zapisz konfigurację
            </button>
            <button
              onClick={handleFetch}
              disabled={fetching || !configured}
              className="flex-1 py-2.5 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-400 font-bold text-sm hover:bg-orange-500/30 transition-all disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              {fetching ? "⏳" : <RefreshCw className="w-4 h-4" />}
              Pobierz dane
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}