import { useMemo, useState } from "react";
import { motion, type Variants } from "framer-motion";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMissionPresets } from "@/hooks/useMissionPresets";
import { CATEGORIES } from "@/lib/dashboard-data";
import { dayKey, daysBetween, todayKey } from "@/lib/today";
import { cn } from "@/lib/utils";
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
  /** "link": a small "Open presets" text under the category grid instead of the icon button. */
  variant?: "button" | "link";
}

type Editing = { mode: "create" } | { mode: "edit"; preset: MissionPreset };

/** "1 misja", "3 misje", "12 misji" - the Polish plural for card footers. */
function misje(n: number): string {
  if (n === 1) return "1 misja";
  const last = n % 10;
  const tens = n % 100;
  if (last >= 2 && last <= 4 && (tens < 12 || tens > 14)) return `${n} misje`;
  return `${n} misji`;
}

/** Per-key counts: pillars by name in CATEGORIES order, every project folder folded into "Projekty". */
function breakdown(map: MissionMap): string[] {
  const parts: string[] = [];
  for (const c of CATEGORIES) {
    const n = map[c.id]?.length ?? 0;
    if (n > 0) parts.push(`${c.name} ${n}`);
  }
  let projects = 0;
  for (const [key, list] of Object.entries(map)) {
    if (key.startsWith("project-")) projects += list.length;
  }
  if (projects > 0) parts.push(`Projekty ${projects}`);
  return parts;
}

/** "dziś", "wczoraj", "3 dni temu" … measured on the app's 04:00 day boundary. */
function relativeDay(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const days = daysBetween(dayKey(at), todayKey());
  if (days <= 0) return "dziś";
  if (days === 1) return "wczoraj";
  if (days < 7) return `${days} dni temu`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return w === 1 ? "tydzień temu" : `${w} tyg. temu`;
  }
  if (days < 365) {
    const m = Math.floor(days / 30);
    return m === 1 ? "miesiąc temu" : `${m} mies. temu`;
  }
  return at.toLocaleDateString("pl-PL");
}

const gridVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] } },
};

interface CardProps {
  preset: MissionPreset;
  active: boolean;
  isFirst: boolean;
  isLast: boolean;
  onLoad: () => void;
  onUpdateFromCurrent: () => void;
  onRename: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

/**
 * One selection card. The card body and the "⋯" menu are siblings (a button
 * can't contain a button), so the menu never triggers the load flow.
 */
function PresetCard({ preset, active, isFirst, isLast, onLoad, onUpdateFromCurrent, onRename, onMove, onDelete }: CardProps) {
  const count = countMissions(preset.missions);
  const parts = breakdown(preset.missions);
  const breakdownText = parts.join(" · ");

  return (
    <motion.div variants={cardVariants} layout="position" className="relative h-full">
      <button
        type="button"
        onClick={onLoad}
        aria-pressed={active}
        title={`Załaduj „${preset.name}” (${misje(count)})`}
        className={cn(
          "group flex h-full w-full flex-col items-start gap-2 rounded-2xl border p-4 pr-11 text-left transition-all duration-300",
          "hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/[0.06] hover:glow-sm",
          "focus-visible:-translate-y-0.5 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          active ? "border-primary/60 bg-primary/10 glow-sm" : "border-white/10 bg-white/[0.03]",
        )}
      >
        <span className="flex w-full items-center justify-between gap-2">
          <span aria-hidden="true" className="text-3xl leading-none drop-shadow-sm transition-transform duration-300 group-hover:scale-110">
            {preset.emoji}
          </span>
          {active && (
            <span className="rounded-full border border-primary/50 bg-primary/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground">
              Aktywny
            </span>
          )}
        </span>
        <span className="block w-full truncate text-sm font-semibold text-foreground">{preset.name}</span>
        {preset.description ? (
          <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{preset.description}</span>
        ) : (
          <span className="text-xs italic text-muted-foreground/50">Bez opisu</span>
        )}
        <span className="mt-auto block w-full border-t border-white/5 pt-2 text-[11px] text-muted-foreground">
          <span className="line-clamp-2 leading-relaxed" title={breakdownText || undefined}>
            <span className="font-medium text-foreground/80">{misje(count)}</span>
            {parts.map((part) => (
              <span key={part}> · {part}</span>
            ))}
          </span>
          {preset.lastAppliedAt && (
            <span className="mt-1 block text-[10px] text-muted-foreground/70">Ostatnio: {relativeDay(preset.lastAppliedAt)}</span>
          )}
        </span>
      </button>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Opcje presetu ${preset.name}`}
            onClick={(e) => e.stopPropagation()}
            className="absolute right-2.5 top-2.5 rounded-lg p-1.5 text-muted-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={onUpdateFromCurrent}>Aktualizuj z obecnych misji</DropdownMenuItem>
          <DropdownMenuItem onSelect={onRename}>Zmień nazwę lub emoji</DropdownMenuItem>
          <DropdownMenuItem disabled={isFirst} onSelect={() => onMove(-1)}>Przesuń w lewo</DropdownMenuItem>
          <DropdownMenuItem disabled={isLast} onSelect={() => onMove(1)}>Przesuń w prawo</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
            Usuń
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.div>
  );
}

/**
 * One-click mission sets for Home: "Monk mode", "High energy day", "Lock in".
 * Renders as a single header control (next to Reset Day) that opens a picker
 * of selection cards; loading a card overwrites every mission list.
 */
export default function MissionPresets({ customMissions, onApply, variant = "button" }: Props) {
  const { presets, loading, tableReady, createPreset, updatePreset, deletePreset, markApplied, movePreset } = useMissionPresets();
  const [pickerOpen, setPickerOpen] = useState(false);
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

  const currentCount = useMemo(() => countMissions(snapshotMissions(customMissions)), [customMissions]);

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

  const confirmApply = () => {
    if (!applying) return;
    onApply(missionsForApply(applying.missions));
    void markApplied(applying.id);
    toast.success(`Załadowano „${applying.name}”`);
    setApplying(null);
    setPickerOpen(false);
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
      <span
        role="status"
        title="Uruchom migrację supabase/migrations/20260928190000_mission_presets.sql"
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200"
      >
        <span aria-hidden="true">⚠️</span> Presety wymagają migracji
      </span>
    );
  }

  const triggerLabel = lastApplied ? `Presety misji – aktywny: ${lastApplied.name}` : "Presety misji";

  return (
    <>
      {variant === "link" ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          title={triggerLabel}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {lastApplied ? `Presets · ${lastApplied.name}` : "Open presets"} <span aria-hidden="true">⚡</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          aria-label={triggerLabel}
          title={triggerLabel}
          className="glass-card px-4 py-3 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground"
        >
          <span aria-hidden="true">⚡</span>
        </button>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[85vh] w-[calc(100%-1.5rem)] max-w-3xl gap-5 overflow-y-auto rounded-2xl border-white/10 bg-card/95 p-5 backdrop-blur-xl sm:rounded-2xl sm:p-6">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2">
              <span aria-hidden="true">⚡</span> Presety misji
            </DialogTitle>
            <DialogDescription>
              Zapisane zestawy misji na różne tryby dnia. Kliknij kartę, aby załadować – nadpisze obecne misje na Home.
            </DialogDescription>
          </DialogHeader>

          <motion.div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            variants={gridVariants}
            initial="hidden"
            animate="show"
          >
            {loading
              ? [0, 1, 2].map((i) => (
                  <div key={i} className="h-40 animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]" aria-hidden="true" />
                ))
              : presets.map((p, i) => (
                  <PresetCard
                    key={p.id}
                    preset={p}
                    active={lastApplied?.id === p.id}
                    isFirst={i === 0}
                    isLast={i === presets.length - 1}
                    onLoad={() => setApplying(p)}
                    onUpdateFromCurrent={() => void updateFromCurrent(p)}
                    onRename={() => openEdit(p)}
                    onMove={(direction) => void movePreset(p.id, direction)}
                    onDelete={() => setDeleting(p)}
                  />
                ))}
            <motion.div variants={cardVariants} layout="position" className="h-full">
              <button
                type="button"
                onClick={openCreate}
                title="Zapisuje obecne misje ze wszystkich kategorii i projektów jako preset"
                className="flex h-full min-h-[10rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/15 p-4 text-center text-muted-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/[0.05] hover:text-foreground focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                  <Plus className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold">Zapisz obecne jako preset</span>
                <span className="text-[11px] text-muted-foreground/80">{misje(currentCount)} z obecnych kategorii i projektów</span>
              </button>
            </motion.div>
          </motion.div>

          {!loading && presets.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Ustaw misje tak, jak chcesz je mieć w danym trybie (np. Monk mode, High energy day, Lock in), zapisz jako preset, potem
              ładuj jednym kliknięciem. Załadowanie nadpisuje obecne misje.
            </p>
          )}
        </DialogContent>
      </Dialog>

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
            <Button onClick={confirmApply}>Załaduj</Button>
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
                  ? `Zapisze ${currentCount} misji ze wszystkich kategorii i projektów.`
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
    </>
  );
}
