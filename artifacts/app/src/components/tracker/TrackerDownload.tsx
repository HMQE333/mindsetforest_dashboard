import { Download, FileJson } from "lucide-react";

/**
 * Download box for the desktop agent. The zip is packed from the repo's
 * tracker/ directory at build time (scripts/pack-tracker.mjs -> public/downloads),
 * and config.json is generated here in the browser with this deployment's
 * Supabase URL and public key, so the user never has to copy them by hand.
 */
export default function TrackerDownload({ compact = false }: { compact?: boolean }) {
  const base = import.meta.env.BASE_URL || "/";
  const zipHref = `${base.endsWith("/") ? base : base + "/"}downloads/mindsetforest-tracker.zip`;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  const configReady = Boolean(supabaseUrl && anonKey);

  const downloadConfig = () => {
    const config = {
      supabase_url: supabaseUrl ?? "",
      supabase_anon_key: anonKey ?? "",
      dashboard_url: typeof window !== "undefined" ? window.location.origin : "",
      idle_minutes: 3,
      tick_seconds: 1,
      sync_seconds: 60,
      device_name: "",
      min_session_seconds: 2,
      ignored_apps: [] as string[],
    };
    const blob = new Blob([JSON.stringify(config, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "config.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className={compact ? "space-y-2" : "rounded-xl border border-border/50 bg-secondary/30 px-4 py-4 text-xs text-foreground/80 space-y-3"}>
      {!compact && (
        <>
          <div className="font-semibold text-sm">Agent na Windows</div>
          <p className="text-muted-foreground">
            Czas przy komputerze zbiera mały program bez okna, z ikonką w zasobniku. Loguje się tym samym e-mailem i hasłem co
            tutaj i co minutę wysyła sesje do Twojej bazy. Wymaga Pythona 3.11 lub nowszego.
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <a
          href={zipHref}
          download="mindsetforest-tracker.zip"
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/25 transition-colors"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Pobierz tracker (zip)
        </a>
        <button
          type="button"
          onClick={downloadConfig}
          disabled={!configReady}
          title={configReady ? "Plik z adresem i kluczem Twojej bazy, gotowy do wklejenia obok run-dev.bat" : "Ten build nie ma wpisanego adresu Supabase"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
          Pobierz config.json
        </button>
      </div>
      <ol className="list-decimal list-inside text-muted-foreground space-y-0.5">
        <li>
          Rozpakuj zip, wrzuć pobrany <code className="font-mono text-foreground/80">config.json</code> do folderu{" "}
          <code className="font-mono text-foreground/80">mindsetforest-tracker</code>.
        </li>
        <li>
          Uruchom <code className="font-mono text-foreground/80">run-dev.bat</code> (pierwszy raz z konsolą, żeby widzieć logi), zaloguj się z menu ikonki.
        </li>
        <li>
          Gdy działa, uruchom <code className="font-mono text-foreground/80">install-autostart.bat</code>, żeby startował z Windowsem. Szczegóły w{" "}
          <code className="font-mono text-foreground/80">README.md</code> w paczce.
        </li>
      </ol>
      {!compact && <p className="text-muted-foreground">Ta sekcja odświeży się sama, gdy pojawią się pierwsze sesje. Pierwszy sync wysyła ostatnie 30 dni.</p>}
    </div>
  );
}
