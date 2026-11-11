import { supabase } from "@/integrations/supabase/client";
import { logMetricEntry } from "@/lib/assistant-writes";
import { addReadingLog, nextFromPage } from "@/lib/reading-log";
import { emitAppEvent, LIBRARY_CHANGED_EVENT } from "@/lib/app-events";
import type { MissionLink } from "@/lib/dashboard-data";

/**
 * Saves the amount the user confirmed for a linked mission: an entry in the
 * Stats metric (no second XP: the mission gave it), or pages after the bookmark of a Library
 * book (reading log + bookmark). Only ever called from a user's own "Save".
 */
export async function saveMissionAmount(userId: string, link: MissionLink, value: number): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!(value > 0)) return { ok: false, error: "Nothing to save" };
  if (link.kind === "metric") {
    // The mission's tick already gave XP for this: the Stats entry is the measurement only.
    const r = await logMetricEntry(userId, link.metricId, value, { xp: false });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, text: `+${value}${r.metric.unit ? ` ${r.metric.unit}` : ""} · ${r.metric.label}` };
  }
  const { data: book } = await supabase.from("user_books").select("id,title,status,pages_read,total_pages").eq("id", link.bookId).eq("user_id", userId).maybeSingle();
  if (!book) return { ok: false, error: "The book is no longer in the Library" };
  const fromPage = nextFromPage(book.pages_read || 0);
  const pages = Math.round(value);
  const toPage = book.total_pages > 0 ? Math.min(book.total_pages, fromPage + pages - 1) : fromPage + pages - 1;
  if (toPage < fromPage) return { ok: false, error: "The book is already finished" };
  const entry = await addReadingLog(userId, { bookId: book.id, fromPage, toPage });
  if (!entry) return { ok: false, error: "Could not save the reading log" };
  await supabase.from("user_books").update({ pages_read: Math.max(book.pages_read || 0, toPage), status: book.status === "to-read" ? "reading" : book.status }).eq("id", book.id);
  emitAppEvent(LIBRARY_CHANGED_EVENT);
  return { ok: true, text: `Pages ${fromPage}–${toPage} · ${book.title}` };
}
