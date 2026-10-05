import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import {
  READING_LOG_CHANGED_EVENT,
  addReadingLog,
  byBook,
  loadReadingLog,
  removeReadingLog,
  type NewEntry,
  type ReadingLogEntry,
} from "@/lib/reading-log";

/** The user's reading log, grouped per book (newest first); reloads when anything writes to it. */
export function useReadingLog() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<ReadingLogEntry[]>([]);

  const load = useCallback(async () => {
    setEntries(user ? await loadReadingLog(user.id) : []);
  }, [user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onChange = () => { void load(); };
    window.addEventListener(READING_LOG_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(READING_LOG_CHANGED_EVENT, onChange);
  }, [load]);

  const add = useCallback(async (e: NewEntry) => (user ? addReadingLog(user.id, e) : null), [user]);
  const remove = useCallback((id: string) => removeReadingLog(id), []);
  const perBook = useMemo(() => byBook(entries), [entries]);

  return { entries, perBook, add, remove };
}
