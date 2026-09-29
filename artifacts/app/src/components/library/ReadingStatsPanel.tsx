import { useEffect, useState } from "react";
import type { Book } from "@/lib/library-data";
import { formatSpanShort, speedOf, type PageSample, type ReadingSpeed } from "@/lib/reading-speed";
import { loadBookSamples, type BookReading } from "@/lib/reading-sessions";
import { useAuth } from "@/hooks/useAuth";
import PageSpeedChart from "./PageSpeedChart";

interface ReadingStatsPanelProps {
  book: Book;
  reading?: BookReading;
  /** Speed across all books, for "time left" before this one has its own. */
  usualSpeed?: ReadingSpeed;
  /** Leave out "time left" (the finish screen). */
  finished?: boolean;
}

/** Charted only once a handful of pages have been timed. */
const MIN_PAGES_FOR_CHART = 5;

/**
 * What the reader measured for one book: speed, time spent, time left and
 * time per page. Renders nothing without measurements (books read on paper,
 * or a PDF not yet opened), so there is never an empty or zero panel.
 */
export default function ReadingStatsPanel({ book, reading, usualSpeed, finished }: ReadingStatsPanelProps) {
  const { user } = useAuth();
  const [samples, setSamples] = useState<PageSample[]>([]);
  const pagesTimed = reading?.pages ?? 0;

  // Reload when a sitting was saved (the page count moves).
  useEffect(() => {
    if (!user || pagesTimed === 0) { setSamples([]); return; }
    let live = true;
    void loadBookSamples(user.id, book.id).then((s) => { if (live) setSamples(s); });
    return () => { live = false; };
  }, [user, book.id, pagesTimed]);

  if (!reading || pagesTimed === 0) return null;

  const speed = speedOf(reading);
  const pace = speed.secondsPerPage ?? usualSpeed?.secondsPerPage ?? null;
  const pagesLeft = book.file ? Math.max(0, book.file.pages - book.file.lastPage) : 0;
  const left = !finished && pace && pagesLeft > 0 ? pace * pagesLeft : null;

  const tiles = [
    speed.pagesPerHour ? { label: "Speed", value: `${Math.round(speed.pagesPerHour)}`, unit: "pages/h" } : null,
    speed.wordsPerMinute ? { label: "Words/min", value: `${Math.round(speed.wordsPerMinute)}`, unit: "wpm" } : null,
    { label: "Time reading", value: formatSpanShort(reading.seconds), unit: `${reading.sessions} ${reading.sessions === 1 ? "sitting" : "sittings"}` },
    left ? { label: "Left", value: `~${formatSpanShort(left)}`, unit: speed.secondsPerPage ? `${pagesLeft} pages` : "at your usual pace" } : null,
  ].filter((t): t is { label: string; value: string; unit: string } => !!t);

  return (
    <div className="space-y-3">
      <div className={`grid gap-2 ${tiles.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : tiles.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl bg-muted/25 border border-white/5 px-3 py-2">
            <p className="text-[10px] text-muted-foreground">{t.label}</p>
            <p className="text-lg font-semibold text-foreground leading-tight whitespace-nowrap">{t.value}</p>
            <p className="text-[10px] text-muted-foreground">{t.unit}</p>
          </div>
        ))}
      </div>
      {samples.length >= MIN_PAGES_FOR_CHART && (
        <div>
          <p className="text-[11px] text-muted-foreground mb-1">Time per page</p>
          <PageSpeedChart samples={samples} color={book.cover_color} />
        </div>
      )}
    </div>
  );
}
