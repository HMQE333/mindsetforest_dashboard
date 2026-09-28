import { useMemo, useState } from "react";
import { MoreHorizontal, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMissionPresets } from "@/hooks/useMissionPresets";
import {
  DEFAULT_PRESET_EMOJI,
  PRESET_NAME_MAX,
  countMissions,
  missionsForApply,
  snapshotMissions,
  type MissionMap,
  type MissionPreset,
} from "@/lib/mission-presets";

interface Props {
  /** The live mission map from dashboard state (what "save current" snapshots). */
  customMissions: MissionMap;
  /** Replaces every mission list on Home with the given map. */
  onApply: (missions: MissionMap) => void;
}

type Editing = { mode: "create" } | { mode: "edit"; preset: MissionPreset };

/**
 * One-click mission sets for Home: "Monk mode", "High energy day", "Lock in".
 * Save the current lists under a name, load a saved set to overwrite them.
 */
export default function MissionPresets({ customMissions, onApply }: Props) {
  const { presets, loading, tableReady, createPreset, updatePreset, deletePreset, markApplied, movePreset } = useMissionPresets();
  const [applying, setApplying] = useState<MissionPreset | null>(null);
  const [deleting, setDeleting] = useState<MissionPreset | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_PRESET_EMOJI);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const lastApplied = useMemo(() => {
    let best: MissionPreset | null = null;
    for (const p of presets) if (p.lastAppliedAt && (!best || p.lastAppliedAt > (best.lastAppliedAt || ""))) best = p;
    return best;
  }, [presets]);

  const openCreate = () => {
    setName("");
    setEmoji(DEFAULT_PRESET_EMOJI);
    setDescription("");
    setEditing({ mode: "create" });
  };
  const openEdit = (preset: MissionPreset) => {
    setName(preset.name);
    setEmoji(preset.emoji);
    setDescription(preset.description);
    setEditing({ mode: "edit", preset });
  };

  const submitEditing = async () => {
    if (!editing || busy) return;
    setBusy(true);
    try {
      if (editing.mode === "create") {
        const created = await createPreset({ name, emoji, description, missions: snapshotMissions(customMissions) });
        if (created) {
          toast.success(`Zapisano preset „${created.name}” (${countMissions(created.missions)} misji)`);
          setEditing(null);
        }
      } else {
        const ok = await updatePreset(editing.preset.id, { name, emoji, description });
        if (ok) setEditing(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmApply = async () => {
    if (!applying) return;
    onApply(missionsForApply(applying.missions));
    void markApplied(applying.id);
    toast.success(`Załadowano „${applying.name}”`);
    setApplying(null);
  };

  const updateFromCurrent = async (preset: MissionPreset) => {
    const snap = snapshotMissions(customMissions);
    const ok = await updatePreset(preset.id, { missions: snap });
    if (ok) toast.success(`Preset „${preset.name}” zaktualizowany z obecnych misji`);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const ok = await deletePreset(deleting.id);
    if (ok) toast.success(`Usunięto preset „${deleting.name}”`);
    setDeleting(null);
  };

  if (!tableReady) {
    return (
      <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-200" role="status">
        Presety misji wymagają migracji <code className="font-mono">supabase/migrations/20260928190000_mission_presets.sql</code>.
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Presety misji">
        <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground mr-1">
          <Sparkles className="h-3 w-3" aria-hidden="true" /> Presety
        </span>
        {presets.map((p) => {
          const active = lastApplied?.id === p.id;
          return (
            <div key={p.id} className="inline-flex items-stretch">
              <button
                type="button"
                onClick={() => setApplying(p)}
                title={p.description || `Załaduj „${p.name}” (${countMissions(p.missions)} misji)`}
                aria-pressed={active}
                className={
                  "rounded-l-full border px-3 py-1 text-xs font-medium transition-colors " +
                  (active
                    ? "border-primary/60 bg-primary/20 text-foreground"
                    : "border-border/60 bg-secondary/40 text-foreground/90 hover:bg-secondary/70")
                }
              >
                <span aria-hidden="true">{p.emoji}</span> {p.name}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Opcje presetu ${p.name}`}
                    className={
                      "rounded-r-full border border-l-0 px-1.5 text-muted-foreground hover:text-foreground transition-colors " +
                      (active ? "border-primary/60 bg-primary/20" : "border-border/60 bg-secondary/40 hover:bg-secondary/70")
                    }
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="text-xs">
                  <DropdownMenuItem onSelect={() => setApplying(p)}>Załaduj</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void updateFromCurrent(p)}>Aktualizuj z obecnych misji</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openEdit(p)}>Zmień nazwę lub emoji</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void movePreset(p.id, -1)}>Przesuń w lewo</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void movePreset(p.id, 1)}>Przesuń w prawo</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(p)}>
                    Usuń
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/70 px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          title="Zapisuje obecne misje ze wszystkich kategorii i projektów jako preset"
        >
          <Plus className="h-3 w-3" aria-hidden="true" /> Zapisz obecne jako preset
        </button>
      </div>
      {!loading && presets.length === 0 && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Ustaw misje tak, jak chcesz je mieć w danym trybie (np. Monk mode, High energy day, Lock in), zapisz jako preset, potem
          ładuj jednym kliknięciem. Załadowanie nadpisuje obecne misje.
        </p>
      )}

      <Dialog open={!!applying} onOpenChange={(open) => { if (!open) setApplying(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Załadować {applying?.emoji} {applying?.name}?
            </DialogTitle>
            <DialogDescription>
              Nadpisze misje we wszystkich kategoriach i projektach ({applying ? countMissions(applying.missions) : 0} misji).
              Dzisiejsze odhaczenia zostaną wyczyszczone, zdobyte dziś XP zostaje.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApplying(null)}>Anuluj</Button>
            <Button onClick={() => void confirmApply()}>Załaduj</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-sm">
          <form
            onSubmit={(e) => { e.preventDefault(); void submitEditing(); }}
            className="space-y-3"
          >
            <DialogHeader>
              <DialogTitle>{editing?.mode === "create" ? "Zapisz obecne misje jako preset" : "Edytuj preset"}</DialogTitle>
              <DialogDescription>
                {editing?.mode === "create"
                  ? `Zapisze ${countMissions(snapshotMissions(customMissions))} misji ze wszystkich kategorii i projektów.`
                  : "Nazwa i emoji. Same misje aktualizujesz opcją „Aktualizuj z obecnych misji”."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-[4.5rem_1fr] gap-2">
              <div>
                <label htmlFor="preset-emoji" className="text-[11px] text-muted-foreground">Emoji</label>
                <Input id="preset-emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} className="text-center" />
              </div>
              <div>
                <label htmlFor="preset-name" className="text-[11px] text-muted-foreground">Nazwa</label>
                <Input
                  id="preset-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={PRESET_NAME_MAX}
                  placeholder="np. Monk mode"
                  autoFocus
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="preset-description" className="text-[11px] text-muted-foreground">Opis (opcjonalnie)</label>
              <Input id="preset-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Kiedy tego używasz" />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Anuluj</Button>
              <Button type="submit" disabled={busy || !name.trim()}>{editing?.mode === "create" ? "Zapisz preset" : "Zapisz"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Usunąć preset „{deleting?.name}”?</DialogTitle>
            <DialogDescription>Obecne misje na Home zostają bez zmian. Tej operacji nie da się cofnąć.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Anuluj</Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>Usuń</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
