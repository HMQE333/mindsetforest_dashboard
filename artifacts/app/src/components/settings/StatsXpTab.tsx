import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, RotateCcw } from "lucide-react";
import { useTrackerXp } from "@/hooks/useTrackerXp";
import { useUserSettings } from "@/hooks/useUserSettings";
import { ACHIEVEMENTS, TIER_DEFAULT_XP } from "@/lib/tracker-achievements";
import { TrackerXpConfig, computeEntryXp } from "@/lib/tracker-xp";

export default function StatsXpTab() {
  const { config, saveConfig, resetConfig, totalXp, todayEntryXp, refundAllGrants } = useTrackerXp();
  const { getMetrics } = useUserSettings();
  const metrics = getMetrics();

  const [draft, setDraft] = useState<TrackerXpConfig>(config);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setDraft(config); setDirty(false); }, [config]);

  const grouped = useMemo(() => {
    const out: Record<string, typeof metrics> = {};
    metrics.forEach(m => { (out[m.categoryName] = out[m.categoryName] || []).push(m); });
    return out;
  }, [metrics]);

  const update = (patch: Partial<TrackerXpConfig>) => {
    setDraft(prev => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const updateMetric = (id: string, patch: Partial<TrackerXpConfig["perMetric"][string]>) => {
    setDraft(prev => ({
      ...prev,
      perMetric: { ...prev.perMetric, [id]: { ...prev.perMetric[id], ...patch } },
    }));
    setDirty(true);
  };

  const updateMilestone = (id: string, xp: number) => {
    setDraft(prev => ({ ...prev, milestones: { ...prev.milestones, [id]: Math.max(0, Math.round(xp)) } }));
    setDirty(true);
  };

  const handleSave = async () => {
    await saveConfig(draft);
    setDirty(false);
  };

  const handleReset = async () => {
    await resetConfig();
  };

  const handleRefund = async () => {
    if (!confirm(`Refund ${totalXp} XP earned from Stats and wipe all grants? This cannot be undone.`)) return;
    const refunded = await refundAllGrants();
    alert(`Refunded ${refunded} XP. You can now reconfigure rewards and earn fresh.`);
  };

  const milestoneByCategory = useMemo(() => {
    const out: Record<string, typeof ACHIEVEMENTS> = {};
    ACHIEVEMENTS.forEach(a => { (out[a.category] = out[a.category] || []).push(a); });
    return out;
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Stats XP</div>
            <div className="text-sm text-foreground/80 mt-0.5">Reward every log and every milestone</div>
          </div>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-white/5 rounded-lg transition-colors"
            title="Reset to defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button
            onClick={handleRefund}
            disabled={totalXp <= 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-destructive hover:text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Subtract all granted Stats XP from your level and clear grants"
          >
            Refund XP
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <div className="flex-1 rounded-lg bg-secondary/40 px-3 py-2">
            <div className="text-[10px] uppercase text-muted-foreground">Total earned</div>
            <div className="font-bold text-foreground inline-flex items-center gap-1"><Sparkles className="w-3 h-3 text-primary" />{totalXp} XP</div>
          </div>
          <div className="flex-1 rounded-lg bg-secondary/40 px-3 py-2">
            <div className="text-[10px] uppercase text-muted-foreground">Today (entries)</div>
            <div className="font-bold text-foreground">{todayEntryXp} XP</div>
          </div>
        </div>
      </div>

      {/* Toggles */}
      <div className="glass-card p-4 space-y-3">
        <ToggleRow
          label="Enable Stats XP"
          hint="Logging entries and unlocking milestones awards XP"
          checked={draft.enabled}
          onChange={(v) => update({ enabled: v })}
        />
        <ToggleRow
          label="Award past milestones"
          hint="On reload, grant XP for already-unlocked achievements that haven't been paid out yet"
          checked={draft.retroactive}
          onChange={(v) => update({ retroactive: v })}
        />
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground/90">Daily entry cap</div>
            <div className="text-xs text-muted-foreground">0 = no cap. Prevents farming.</div>
          </div>
          <input
            type="number"
            min={0}
            max={5000}
            value={draft.dailyCap}
            onChange={(e) => update({ dailyCap: Math.max(0, parseInt(e.target.value) || 0) })}
            className="w-20 bg-secondary/50 border border-white/10 rounded-lg px-2 py-1 text-sm text-right font-mono text-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>

      {/* Per-metric */}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">Per-metric rewards</div>
        <div className="space-y-3">
          {Object.entries(grouped).map(([catName, ms]) => (
            <div key={catName} className="glass-card p-3">
              <div className="text-xs font-bold text-foreground/80 mb-2">{ms[0].categoryIcon} {catName}</div>
              <div className="space-y-2">
                {ms.map(m => {
                  const rule = draft.perMetric[m.id] || { perUnit: 1, perLog: 2 };
                  const previewValue = 10;
                  const previewXp = computeEntryXp(m, previewValue, draft);
                  return (
                    <div key={m.id} className="rounded-lg bg-secondary/30 p-2.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-base">{m.icon}</span>
                        <span className="text-sm font-semibold text-foreground/90 flex-1 truncate">{m.label}</span>
                        <span className="text-[10px] text-muted-foreground">{m.unit}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <NumField label="XP / unit" value={rule.perUnit} step={0.1} onChange={(v) => updateMetric(m.id, { perUnit: v })} />
                        <NumField label="XP / log" value={rule.perLog} step={1} onChange={(v) => updateMetric(m.id, { perLog: v })} />
                        <NumField label="Cap" value={rule.cap ?? 0} step={5} onChange={(v) => updateMetric(m.id, { cap: v })} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1.5">
                        e.g. {previewValue} {m.unit} → <span className="text-primary font-semibold">+{previewXp} XP</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Milestones */}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">Milestone rewards</div>
        <div className="space-y-3">
          {Object.entries(milestoneByCategory).map(([catName, list]) => (
            <div key={catName} className="glass-card p-3">
              <div className="text-xs font-bold text-foreground/80 mb-2">{catName}</div>
              <div className="space-y-1.5">
                {list.map(a => (
                  <div key={a.id} className="flex items-center gap-2 rounded-lg bg-secondary/30 px-2.5 py-1.5">
                    <span className="text-base">{a.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground/90 truncate">{a.title}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{a.description}</div>
                    </div>
                    <span className="text-[10px] text-muted-foreground capitalize">{a.tier}</span>
                    <input
                      type="number"
                      min={0}
                      max={5000}
                      value={draft.milestones[a.id] ?? TIER_DEFAULT_XP[a.tier]}
                      onChange={(e) => updateMilestone(a.id, parseInt(e.target.value) || 0)}
                      className="w-16 bg-background/50 border border-white/10 rounded-md px-2 py-1 text-xs text-right font-mono text-foreground focus:outline-none focus:border-primary/50"
                    />
                    <span className="text-[10px] text-muted-foreground">XP</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save banner */}
      {dirty && (
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="sticky bottom-0 left-0 right-0 pt-2"
        >
          <button
            onClick={handleSave}
            className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all"
          >
            Save Stats XP
          </button>
        </motion.div>
      )}
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 text-left"
    >
      <div className="flex-1">
        <div className="text-sm font-semibold text-foreground/90">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${checked ? "bg-primary" : "bg-muted/60"}`}>
        <motion.div
          layout
          className="w-5 h-5 rounded-full bg-white shadow-md"
          style={{ marginLeft: checked ? "auto" : 0 }}
        />
      </div>
    </button>
  );
}

function NumField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="bg-background/50 border border-white/10 rounded-md px-2 py-1 text-xs text-right font-mono text-foreground focus:outline-none focus:border-primary/50"
      />
    </label>
  );
}