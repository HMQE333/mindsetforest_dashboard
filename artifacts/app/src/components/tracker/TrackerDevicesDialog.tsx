import { useState } from "react";
import { GitMerge, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deviceLabel, hoursLabel, isPhone, mergeTargets, type DeviceNames, type DeviceSummary } from "@/lib/tracker-devices";
import { relativeTime } from "./computer-time-shared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: DeviceSummary[];
  names: DeviceNames;
  loading: boolean;
  rename: (id: string, name: string) => Promise<string | null>;
  merge: (fromId: string, intoId: string) => Promise<string | null>;
  forget: (id: string) => Promise<string | null>;
  /** After a merge or removal: the charts reload. */
  onChanged: () => void;
}

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * Name the devices, join two ids of one machine (a reinstall that lost its
 * local data shows up as a new device), or remove a device with its history.
 */
export default function TrackerDevicesDialog({ open, onOpenChange, devices, names, loading, rename, merge, forget, onChanged }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [merging, setMerging] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = new Date();

  const run = async (job: () => Promise<string | null>, changed = false) => {
    setBusy(true);
    setError(null);
    const problem = await job();
    setBusy(false);
    if (problem) setError(problem);
    else {
      setEditing(null);
      setMerging(null);
      if (changed) onChanged();
    }
  };

  const startMerge = (id: string) => {
    const targets = mergeTargets(id, devices);
    setMerging(id);
    setTarget(targets[0]?.device_id ?? "");
    setEditing(null);
  };

  const confirmMerge = (from: DeviceSummary) => {
    if (!target) return;
    const into = devices.find((d) => d.device_id === target);
    const ok = window.confirm(
      `Połączyć „${deviceLabel(from.device_id, names)}” z „${deviceLabel(target, names)}”?\n\n` +
        `Historia (${hoursLabel(from.seconds)}) trafi do „${deviceLabel(target, names)}”` +
        (into ? ` (${hoursLabel(into.seconds)})` : "") +
        ". Minuty liczone podwójnie, gdy działały oba trackery, znikną. Tego nie da się cofnąć.",
    );
    if (ok) void run(() => merge(from.device_id, target), true);
  };

  const confirmForget = (d: DeviceSummary) => {
    const how = isPhone(d.device_id)
      ? "Jeśli aplikacja dalej działa na telefonie, zacznie liczyć od nowa: odinstaluj ją tam."
      : "Jeśli tracker dalej działa na tym komputerze, zacznie liczyć od nowa: odinstaluj go tam (Ustawienia Windows → Aplikacje).";
    const ok = window.confirm(
      `Usunąć „${deviceLabel(d.device_id, names)}” i całą jego historię (${hoursLabel(d.seconds)}, ${d.sessions} sesji)?\n\n${how}\n\nTego nie da się cofnąć.`,
    );
    if (ok) void run(() => forget(d.device_id), true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Urządzenia</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            Ten sam komputer widać dwa razy (np. po ponownej instalacji)? <span className="text-foreground/80">Połącz</span> te
            wpisy: historia się zsumuje. <span className="text-foreground/80">Usuń</span> kasuje urządzenie razem z jego czasem.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-xs text-destructive">{error}</p>}
        {loading && devices.length === 0 && <p className="text-xs text-muted-foreground">Wczytuję…</p>}
        {!loading && devices.length === 0 && <p className="text-xs text-muted-foreground">Żadne urządzenie jeszcze nic nie zapisało.</p>}

        <ul className="space-y-2">
          {devices.map((d) => {
            const targets = mergeTargets(d.device_id, devices);
            return (
              <li key={d.device_id} className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2.5 space-y-2">
                {editing === d.device_id ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(() => rename(d.device_id, draft));
                    }}
                  >
                    <input
                      autoFocus
                      value={draft}
                      maxLength={60}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={isPhone(d.device_id) ? "np. Telefon" : "np. Laptop"}
                      aria-label="Nazwa urządzenia"
                      className="flex-1 min-w-0 bg-background/60 border border-border/60 rounded-lg px-2 py-1 text-sm"
                    />
                    <button type="submit" disabled={busy} className="text-xs px-2.5 py-1 rounded-lg bg-primary/20 text-foreground hover:bg-primary/30 disabled:opacity-50">
                      Zapisz
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className="text-xs text-muted-foreground hover:text-foreground">
                      Anuluj
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{deviceLabel(d.device_id, names)}</span>
                    <button
                      onClick={() => {
                        setEditing(d.device_id);
                        setDraft(names[d.device_id] ?? "");
                        setMerging(null);
                      }}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5"
                      title="Zmień nazwę"
                      aria-label={`Zmień nazwę: ${deviceLabel(d.device_id, names)}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {hoursLabel(d.seconds)} · od {dayLabel(d.first_at)} · ostatnio {relativeTime(d.last_at, now)}
                  {!isPhone(d.device_id) && <span className="opacity-60"> · id {d.device_id.slice(0, 8)}</span>}
                </p>

                {merging === d.device_id ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Połącz z:</span>
                    <select
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      aria-label="Połącz z urządzeniem"
                      className="bg-background/60 border border-border/60 rounded-lg px-2 py-1 text-xs"
                    >
                      {targets.map((t) => (
                        <option key={t.device_id} value={t.device_id}>
                          {deviceLabel(t.device_id, names)} ({hoursLabel(t.seconds)})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => confirmMerge(d)}
                      disabled={busy || !target}
                      className="px-2.5 py-1 rounded-lg bg-primary/20 text-foreground hover:bg-primary/30 disabled:opacity-50"
                    >
                      Połącz
                    </button>
                    <button onClick={() => setMerging(null)} className="text-muted-foreground hover:text-foreground">
                      Anuluj
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {targets.length > 0 && (
                      <button
                        onClick={() => startMerge(d.device_id)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40"
                      >
                        <GitMerge className="h-3.5 w-3.5" aria-hidden="true" /> Połącz z…
                      </button>
                    )}
                    <button
                      onClick={() => confirmForget(d)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-border/60 text-muted-foreground hover:text-destructive hover:border-destructive/50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Usuń
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
