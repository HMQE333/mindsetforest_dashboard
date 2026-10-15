import type { RoutineLog, SessionNote } from "@/lib/kos-vault";

/** Polish "few" (2-4, 22-24, … but not 12-14), which takes its own noun and verb forms. */
const few = (n: number) => n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14);

/** "1 sesja", "3 sesje", "5 sesji". */
export function sessionsPl(n: number): string {
  if (n === 1) return "1 sesja";
  return few(n) ? `${n} sesje` : `${n} sesji`;
}

/** "1 sesja czeka", "3 sesje czekają", "5 sesji czeka". */
export const sessionsWaitPl = (n: number) => `${sessionsPl(n)} ${few(n) ? "czekają" : "czeka"}`;

/** "przed chwilą", "25 min temu", "3 godz. temu", "2 dni temu". */
export function agoPl(then: Date, now: Date): string {
  const min = Math.round((now.getTime() - then.getTime()) / 60_000);
  if (min < 2) return "przed chwilą";
  if (min < 60) return `${min} min temu`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} godz. temu`;
  const d = Math.round(h / 24);
  return d === 1 ? "wczoraj" : `${d} dni temu`;
}

const stamp = (d: Date) =>
  `${d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * Is the Claude routine running? Its last run (from the mirrored
 * _SYSTEM/routine-log.md), what is queued, and a warning when sessions have
 * waited more than a day, which usually means the scheduled task is off.
 */
export default function HealthLine({
  log,
  waiting,
  stale,
  now = new Date(),
}: {
  log: RoutineLog | null;
  waiting: number;
  stale: SessionNote[];
  now?: Date;
}) {
  const problems = log?.last?.problems ?? null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span aria-hidden="true">🤖</span>
        {log?.lastRun ? (
          <span>
            Rutyna: ostatnio <span className="text-foreground/85">{agoPl(log.lastRun, now)}</span> ({stamp(log.lastRun)})
          </span>
        ) : log ? (
          <span>Rutyna: dziennik bez daty ostatniego przebiegu</span>
        ) : (
          <span>Rutyna: brak dziennika w kopii skarbca (kopiuje go tracker 1.3)</span>
        )}
        {waiting > 0 && <span>· w kolejce: {sessionsPl(waiting)}</span>}
        {problems && <span className="text-amber-300">· problem: {problems}</span>}
        {log?.last && log.last.items.length > 0 && (
          <details className="w-full sm:w-auto">
            <summary className="cursor-pointer hover:text-foreground">ostatni wpis</summary>
            <ul className="mt-1 space-y-0.5 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5 font-mono text-[11px] text-foreground/80">
              <li>## {log.last.when}</li>
              {log.last.items.map((it, i) => (
                <li key={i} className="break-words">
                  - {it.key}: {it.value}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {stale.length > 0 && (
        <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          ⚠️ {sessionsWaitPl(stale.length)} na rutynę ponad dobę ({stale.slice(0, 3).map((s) => s.topic || s.key).join(", ")}
          {stale.length > 3 ? ", …" : ""}). Sprawdź, czy zadanie rutyny w Claude Desktop jest włączone.
        </p>
      )}
    </div>
  );
}
