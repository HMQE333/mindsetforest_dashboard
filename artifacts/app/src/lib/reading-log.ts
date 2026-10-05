/**
 * The reading log: stretches of a book read on a day ("100 → 123"), typed in
 * the book's card or said to the assistant. Stored in public.reading_log;
 * the book's bookmark (pages_read) moves forward with each entry. Both pages
 * count: 100 to 123 is 24 pages.
 */
import { supabase } from "@/integrations/supabase/client";
import { dayKey, todayKey } from "@/lib/today";

export interface ReadingLogEntry {
  id: string;
  bookId: string;
  /** The owner's day, YYYY-MM-DD. */
  readOn: string;
  fromPage: number;
  toPage: number;
  source: "manual" | "assistant";
  createdAt: string;
}

export const READING_LOG_CHANGED_EVENT = "reading-log-changed";

export const pagesIn = (e: Pick<ReadingLogEntry, "fromPage" | "toPage">) => e.toPage - e.fromPage + 1;

/** Where the next stretch starts: the page after the bookmark. */
export const nextFromPage = (pagesRead: number) => Math.max(1, (pagesRead || 0) + 1);

/** Why a stretch cannot be saved, or null. `total` is 0 when the book's length is unknown. */
export function logError(from: number, to: number, total: number): string | null {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1) return "Pages start at 1";
  if (to < from) return "The last page comes after the first";
  if (total > 0 && to > total) return `The book has ${total} pages`;
  return null;
}

/** "Today", "Yesterday", or "5 Oct" ("5 Oct 2025" in another year). */
export function dayLabel(readOn: string, today: string = todayKey()): string {
  if (readOn === today) return "Today";
  const [y, m, d] = today.split("-").map(Number);
  if (readOn === dayKey(new Date(y, m - 1, d - 1, 12))) return "Yesterday";
  const [ry, rm, rd] = readOn.split("-").map(Number);
  const date = new Date(ry, rm - 1, rd, 12);
  return date.toLocaleDateString("en-GB", ry === y ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

/** "Today · 100 → 123" */
export const describeEntry = (e: ReadingLogEntry, today?: string) => `${dayLabel(e.readOn, today)} · ${e.fromPage} → ${e.toPage}`;

/** Newest first: by day, then by when it was written down. */
export function sortEntries(entries: ReadingLogEntry[]): ReadingLogEntry[] {
  return [...entries].sort((a, b) => (a.readOn === b.readOn ? b.createdAt.localeCompare(a.createdAt) : b.readOn.localeCompare(a.readOn)));
}

/** Each book's entries, newest first. */
export function byBook(entries: ReadingLogEntry[]): Record<string, ReadingLogEntry[]> {
  const out: Record<string, ReadingLogEntry[]> = {};
  for (const e of sortEntries(entries)) (out[e.bookId] ||= []).push(e);
  return out;
}

interface Row {
  id: string;
  book_id: string;
  read_on: string;
  from_page: number;
  to_page: number;
  source: string;
  created_at: string;
}

const toEntry = (r: Row): ReadingLogEntry => ({
  id: r.id,
  bookId: r.book_id,
  readOn: r.read_on,
  fromPage: r.from_page,
  toPage: r.to_page,
  source: r.source === "assistant" ? "assistant" : "manual",
  createdAt: r.created_at,
});

export async function loadReadingLog(userId: string): Promise<ReadingLogEntry[]> {
  const { data, error } = await supabase
    .from("reading_log")
    .select("id,book_id,read_on,from_page,to_page,source,created_at")
    .eq("user_id", userId)
    .order("read_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error || !data) return [];
  return (data as Row[]).map(toEntry);
}

export interface NewEntry {
  bookId: string;
  fromPage: number;
  toPage: number;
  readOn?: string;
  source?: ReadingLogEntry["source"];
}

export async function addReadingLog(userId: string, e: NewEntry): Promise<ReadingLogEntry | null> {
  const { data, error } = await supabase
    .from("reading_log")
    .insert({
      user_id: userId,
      book_id: e.bookId,
      read_on: e.readOn || todayKey(),
      from_page: e.fromPage,
      to_page: e.toPage,
      source: e.source || "manual",
    })
    .select("id,book_id,read_on,from_page,to_page,source,created_at")
    .single();
  if (error || !data) return null;
  window.dispatchEvent(new CustomEvent(READING_LOG_CHANGED_EVENT));
  return toEntry(data as Row);
}

export async function removeReadingLog(id: string): Promise<boolean> {
  const { error } = await supabase.from("reading_log").delete().eq("id", id);
  if (!error) window.dispatchEvent(new CustomEvent(READING_LOG_CHANGED_EVENT));
  return !error;
}
