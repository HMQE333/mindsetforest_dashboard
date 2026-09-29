import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { EMPTY_TOTALS, addTotals, type PageSample, type ReadingTotals } from "@/lib/reading-speed";

/** One sitting in the reader, as the reader hands it over (cumulative; saved again as it grows). */
export interface ReadingSessionDraft {
  id: string;
  bookId: string;
  startedAt: string;
  endedAt: string;
  totals: ReadingTotals;
  samples: PageSample[];
}

/** Everything read of one book: totals across sittings and when they happened. */
export interface BookReading extends ReadingTotals {
  sessions: number;
  firstAt: string | null;
  lastAt: string | null;
}

export const EMPTY_BOOK_READING: BookReading = { ...EMPTY_TOTALS, sessions: 0, firstAt: null, lastAt: null };

/** A v4 UUID, also where crypto.randomUUID is missing (plain-http LAN previews). */
export function newSessionId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const sessions = () => supabase.from("reading_sessions");

export async function saveReadingSession(userId: string, d: ReadingSessionDraft): Promise<boolean> {
  const { error } = await sessions().upsert({
    id: d.id,
    user_id: userId,
    book_id: d.bookId,
    started_at: d.startedAt,
    ended_at: d.endedAt,
    seconds: d.totals.seconds,
    pages: d.totals.pages,
    words: d.totals.words,
    word_seconds: d.totals.wordSeconds,
    samples: d.samples as unknown as Json,
  });
  return !error;
}

interface TotalsRow {
  book_id: string;
  seconds: number;
  pages: number;
  words: number;
  word_seconds: number;
  started_at: string;
  ended_at: string;
}

/** Reading per book, from every sitting (totals only; samples are loaded per book). */
export async function loadReadingByBook(userId: string): Promise<Record<string, BookReading>> {
  // Paged: the API returns at most 1000 rows per request.
  const rows: TotalsRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sessions()
      .select("book_id,seconds,pages,words,word_seconds,started_at,ended_at")
      .eq("user_id", userId)
      .order("started_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error || !data) break;
    rows.push(...(data as unknown as TotalsRow[]));
    if (data.length < 1000) break;
  }
  const out: Record<string, BookReading> = {};
  for (const r of rows) {
    const cur = out[r.book_id] || { ...EMPTY_BOOK_READING };
    const t = addTotals(cur, { pages: r.pages, seconds: r.seconds, words: r.words, wordSeconds: r.word_seconds });
    out[r.book_id] = {
      ...t,
      sessions: cur.sessions + 1,
      firstAt: !cur.firstAt || r.started_at < cur.firstAt ? r.started_at : cur.firstAt,
      lastAt: !cur.lastAt || r.ended_at > cur.lastAt ? r.ended_at : cur.lastAt,
    };
  }
  return out;
}

/** Every page sample of one book across sittings. */
export async function loadBookSamples(userId: string, bookId: string): Promise<PageSample[]> {
  const { data, error } = await sessions()
    .select("samples")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .order("started_at", { ascending: true });
  if (error || !data) return [];
  return (data as unknown as { samples: PageSample[] }[]).flatMap((r) => r.samples || []);
}
