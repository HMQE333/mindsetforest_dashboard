import { Download, Smartphone } from "lucide-react";

/**
 * Download box for the Android app (android/ in the repo; the APK is committed
 * to public/downloads). "Połącz telefon" opens the installed app with this
 * deployment's Supabase URL and public key (mindsetforest://setup), the same
 * values TrackerDownload writes into config.json, so nothing is typed by hand.
 * Without the app, Chrome falls back to downloading the APK.
 */
export default function PhoneDownload({ compact = false }: { compact?: boolean }) {
  const base = import.meta.env.BASE_URL || "/";
  const apkHref = `${base.endsWith("/") ? base : base + "/"}downloads/mindsetforest-phone.apk`;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  const fallback = typeof window !== "undefined" ? new URL(apkHref, window.location.href).toString() : apkHref;
  // The dashboard's own address: a reminder's notification opens it.
  const site = typeof window !== "undefined" ? new URL(base, window.location.origin).toString() : "";
  const setupHref =
    supabaseUrl && anonKey
      ? `intent://setup?url=${encodeURIComponent(supabaseUrl)}&key=${encodeURIComponent(anonKey)}` +
        (site ? `&site=${encodeURIComponent(site)}` : "") +
        `#Intent;scheme=mindsetforest;package=app.mindsetforest.phone;S.browser_fallback_url=${encodeURIComponent(fallback)};end`
      : null;

  return (
    <div className={compact ? "space-y-2" : "rounded-xl border border-border/50 bg-secondary/30 px-4 py-4 text-xs text-foreground/80 space-y-3"}>
      {!compact && (
        <>
          <div className="font-semibold text-sm">Telefon z Androidem</div>
          <p className="text-muted-foreground">
            Mała aplikacja odczytuje, ile czasu spędzasz w każdej aplikacji (te same dane co „Czas przed ekranem” w ustawieniach), i wysyła je
            tutaj co kwadrans; czas z telefonu i komputera się sumuje. Zaznaczony tekst z dowolnej aplikacji zapiszesz w Archive („Zapisz w
            Archive” w menu zaznaczenia albo Udostępnij), a przypomnienia z 🔔 przyjdą jako powiadomienie.
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <a
          href={apkHref}
          download="mindsetforest-phone.apk"
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/25 transition-colors"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Pobierz aplikację (APK)
        </a>
        {setupHref && isAndroid ? (
          <a
            href={setupHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
            Połącz telefon
          </a>
        ) : (
          <span className="self-center text-muted-foreground">
            {setupHref ? "Otwórz tę stronę na telefonie, żeby go połączyć." : "Ten build nie ma wpisanego adresu Supabase."}
          </span>
        )}
      </div>
      <ol className="list-decimal list-inside text-muted-foreground space-y-0.5">
        <li>Na telefonie pobierz APK i zainstaluj (Android zapyta o zgodę na instalację z przeglądarki).</li>
        <li>
          Wróć tutaj i stuknij <span className="text-foreground/80">Połącz telefon</span>: aplikacja dostanie adres Twojej bazy.
        </li>
        <li>
          W aplikacji <span className="text-foreground/80">Nadaj dostęp</span> do statystyk użycia i zaloguj się tym samym e-mailem i hasłem co
          tutaj.
        </li>
      </ol>
    </div>
  );
}
