import { CalendarClock, Download, FileJson } from "lucide-react";

// Fixed release tag: CI replaces the asset on every push to main, so the link never changes.
const INSTALLER_URL = "https://github.com/hmqe333/mindsetforest_dashboard/releases/download/tracker-latest/MindsetForestSetup.exe";

/**
 * Download box for the desktop agent. The main route is one installer exe,
 * built from the repo's tracker/ by CI. It reads this deployment's Supabase URL
 * and public key from downloads/tracker-config.json (emitted by vite.config.ts),
 * so the user never has to copy them by hand. The last step, the Claude routine,
 * cannot be automated, so the box says up front that it is the user's to do. The zip (packed at build time by
 * scripts/pack-tracker.mjs) and a browser-made config.json stay as the advanced
 * route for running from source.
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
      private_keywords: [] as string[],
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
            Czas przy komputerze zbiera mały program bez okna, z ikonką drzewa przy zegarze. Loguje się tym samym e-mailem i hasłem co tutaj
            i co minutę wysyła sesje do Twojej bazy. Przy okazji zapisuje zaznaczony tekst w Archive (skrót klawiszowy) i zamienia nagrania z
            Bandicam na transkrypty w Twoim vaulcie Obsidian.
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <a
          href={INSTALLER_URL}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/25 transition-colors"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Pobierz instalator (Windows)
        </a>
      </div>
      <p className="text-muted-foreground">
        Jeden plik: wybierasz foldery, logujesz się i gotowe. Windows może ostrzec (aplikacja bez podpisu):{" "}
        <span className="text-foreground/80">Więcej informacji</span> → <span className="text-foreground/80">Uruchom mimo to</span>.
      </p>
      <ol className="list-decimal list-inside text-muted-foreground space-y-0.5">
        <li>
          Uruchom pobrany <code className="font-mono text-foreground/80">MindsetForestSetup.exe</code> (bez uprawnień administratora).
        </li>
        <li>
          Wybierz foldery (nagrania Bandicam, vault Obsidian) i zaloguj się jak tutaj, potem{" "}
          <span className="text-foreground/80">Zainstaluj i uruchom</span>.
        </li>
        <li>
          Ustaw rutynę Claude w Claude Desktop (instalator pokaże jak, z gotowym poleceniem do skopiowania).
        </li>
      </ol>
      <div className="flex gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-foreground/80" role="note">
        <CalendarClock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" aria-hidden="true" />
        <div className="space-y-1">
          <div className="font-medium text-foreground">Rutyna Claude: ten krok trzeba zrobić samemu</div>
          <p className="text-muted-foreground">
            Tracker tylko transkrybuje nagrania. Notatki wiedzy robi zadanie cykliczne w Claude Desktop, uruchamiane co 2-3 godziny, z dostępem
            do folderu vaulta. Bez niego nagrania czekają jako sesje <code className="font-mono text-foreground/80">new</code>, a tracker po dobie
            przypomni o tym powiadomieniem. Polecenie do wklejenia pokaże ostatni ekran instalatora; później znajdziesz je w ikonce drzewa →{" "}
            <span className="text-foreground/80">Ustawienia…</span> → <span className="text-foreground/80">Pokaż, jak ustawić rutynę Claude</span>.
          </p>
        </div>
      </div>
      <p className="text-muted-foreground">
        Nowsza wersja: pobierz instalator i uruchom go jeszcze raz; logowanie, ustawienia i dane zostają. Foldery i skrót zmienisz w ikonce
        drzewa → <span className="text-foreground/80">Ustawienia…</span>.
      </p>
      <details className="group">
        <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground select-none">
          Zaawansowane: wersja ze źródeł (Python)
        </summary>
        <div className="mt-2 space-y-2">
          <p className="text-muted-foreground">Ten sam tracker uruchamiany z kodu źródłowego. Wymaga Pythona 3.11 lub nowszego.</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={zipHref}
              download="mindsetforest-tracker.zip"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
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
              Rozpakuj zip w stałym miejscu (np. <code className="font-mono text-foreground/80">C:\Tools</code>), wrzuć pobrany{" "}
              <code className="font-mono text-foreground/80">config.json</code> do folderu{" "}
              <code className="font-mono text-foreground/80">mindsetforest-tracker</code>.
            </li>
            <li>
              Uruchom <code className="font-mono text-foreground/80">install-autostart.bat</code>: instaluje, od razu włącza tracker i dodaje go
              do autostartu Windows.
            </li>
            <li>
              Kliknij zieloną ikonkę drzewa przy zegarze → <span className="text-foreground/80">Sign in…</span> i zaloguj się jak tutaj.
              Aktualizacja: zamknij stary tracker (ikonka → Quit), podmień pliki, uruchom skrypt jeszcze raz. Logi widać po uruchomieniu{" "}
              <code className="font-mono text-foreground/80">run-dev.bat</code>.
            </li>
          </ol>
        </div>
      </details>
      {!compact && <p className="text-muted-foreground">Ta sekcja odświeży się sama, gdy pojawią się pierwsze sesje. Pierwszy sync wysyła ostatnie 30 dni.</p>}
    </div>
  );
}
