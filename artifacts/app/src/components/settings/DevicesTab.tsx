import { Laptop, Smartphone } from "lucide-react";
import TrackerDownload from "@/components/tracker/TrackerDownload";
import PhoneDownload from "@/components/tracker/PhoneDownload";
import { relativeTime } from "@/components/tracker/computer-time-shared";
import { useTrackerDevices } from "@/hooks/useTrackerDevices";
import { deviceLabel, isPhone, type DeviceSummary } from "@/lib/tracker-devices";

/** The versions in public/downloads (bump with each published build). */
export const TRACKER_VERSION = "1.4";
export const PHONE_VERSION = "1.4";

/**
 * Settings → Apps & devices: the Windows tracker and the Android app in one
 * place, each with its download, version, what it does, and the devices of
 * that kind that synced (newest first). Stats only links here.
 */
export default function DevicesTab() {
  const { devices, names, loading } = useTrackerDevices(true);
  const computers = devices.filter((d) => !isPhone(d.device_id));
  const phones = devices.filter((d) => isPhone(d.device_id));
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Czas z komputera i telefonu sumuje się w Stats. Oba zapisują też do Archive jednym ruchem.
      </p>
      <DeviceCard
        icon={<Laptop className="h-5 w-5" />}
        title="Komputer (Windows)"
        version={TRACKER_VERSION}
        features={[
          "Śledzi czas w aplikacjach i na stronach (Chrome, Edge)",
          "Alt+Shift+S zapisuje zaznaczony tekst do Archive; link do reela dostaje transkrypt",
          "Działa w tle przy zegarze; pauza jednym kliknięciem",
        ]}
        devices={computers}
        names={names}
        loading={loading}
      >
        <TrackerDownload compact />
      </DeviceCard>
      <DeviceCard
        icon={<Smartphone className="h-5 w-5" />}
        title="Telefon (Android)"
        version={PHONE_VERSION}
        features={[
          "Czas przed ekranem w każdej aplikacji, co kwadrans",
          "Udostępnij → MindsetForest zapisuje do Archive; reel dostaje transkrypt i powiadomienie, gdy gotowy",
          "Przypomnienia z 🔔 jako powiadomienia",
        ]}
        devices={phones}
        names={names}
        loading={loading}
      >
        <PhoneDownload compact />
      </DeviceCard>
    </div>
  );
}

function DeviceCard({
  icon,
  title,
  version,
  features,
  devices,
  names,
  loading,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  version: string;
  features: string[];
  devices: DeviceSummary[];
  names: Record<string, string>;
  loading: boolean;
  children: React.ReactNode;
}) {
  const sorted = [...devices].sort((a, b) => Date.parse(b.last_at) - Date.parse(a.last_at));
  const connected = sorted.length > 0;
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
      <header className="flex items-center gap-3">
        <span className="shrink-0 w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="text-[11px] text-muted-foreground">Wersja {version}</p>
        </div>
        <span
          className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            loading ? "bg-muted/40 text-muted-foreground" : connected ? "bg-emerald-500/15 text-emerald-300" : "bg-muted/40 text-muted-foreground"
          }`}
        >
          {loading ? "…" : connected ? "Połączony" : "Niepołączony"}
        </span>
      </header>
      <ul className="text-xs text-foreground/75 space-y-1 list-disc pl-5">
        {features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {connected && (
        <ul className="text-xs space-y-1">
          {sorted.map((d) => (
            <li key={d.device_id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
              <span className="truncate">{deviceLabel(d.device_id, names)}</span>
              <span className="shrink-0 text-muted-foreground">ostatnia synchronizacja {relativeTime(d.last_at)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="pt-1 text-xs">{children}</div>
    </section>
  );
}
