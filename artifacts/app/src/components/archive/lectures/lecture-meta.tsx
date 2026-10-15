import type { LectureLanguage, LectureSource } from "@/lib/kos-vault";

/** "2026-10-11" -> "11 października 2026"; "2026-10-11 13-32" -> "11 października 2026, 13:32". */
export function longDate(s: string, locale = "pl-PL", month: "long" | "short" = "long"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2})[-:](\d{2}))?/.exec(s);
  if (!m) return s;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const date = d.toLocaleDateString(locale, { day: "numeric", month, year: "numeric" });
  return m[4] ? `${date}, ${m[4]}:${m[5]}` : date;
}

export function LanguageFlag({ lang }: { lang: LectureLanguage }) {
  const label = lang === "pl" ? "po polsku" : "po angielsku";
  return (
    <span role="img" aria-label={label} title={label} className="text-sm leading-none">
      {lang === "pl" ? "🇵🇱" : "🇬🇧"}
    </span>
  );
}

const SOURCE: Record<LectureSource, { icon: string; pl: string; en: string }> = {
  recording: { icon: "🎙", pl: "nagranie", en: "recording" },
  import: { icon: "📄", pl: "import", en: "import" },
  youtube: { icon: "▶️", pl: "YouTube", en: "YouTube" },
};

export function SourceBadge({ source, lang }: { source: LectureSource; lang: LectureLanguage }) {
  const s = SOURCE[source];
  return (
    <span className="rounded-md border border-border/60 px-1.5 py-px text-[11px] text-muted-foreground">
      {s.icon} {s[lang]}
    </span>
  );
}
