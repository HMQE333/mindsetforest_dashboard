import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "./useAuth";
import { EMPTY_TOTALS, addTotals, type ReadingTotals } from "@/lib/reading-speed";
import { loadReadingByBook, saveReadingSession, type BookReading, type ReadingSessionDraft } from "@/lib/reading-sessions";

/** Reading measured in the in-app reader: per book and overall. */
export function useReadingStats() {
  const { user } = useAuth();
  const [byBook, setByBook] = useState<Record<string, BookReading>>({});
  // Saves run one after another; `settled` lets a caller wait for the last one.
  const pending = useRef<Promise<unknown>>(Promise.resolve());
  const warned = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setByBook(await loadReadingByBook(user.id));
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback((draft: ReadingSessionDraft) => {
    if (!user) return;
    // A failed save is retried by the next flush of the same sitting (same id, all its pages).
    const next = pending.current
      .then(() => saveReadingSession(user.id, draft))
      .then((ok) => {
        if (!ok && !warned.current) {
          warned.current = true;
          toast.warning("Reading time isn't saving right now", { description: "It will be saved with the next pages you read." });
        }
        return refresh();
      });
    pending.current = next.catch(() => undefined);
  }, [user, refresh]);

  const settled = useCallback(() => pending.current, []);

  const overall = useMemo<ReadingTotals>(
    () => Object.values(byBook).reduce<ReadingTotals>((t, b) => addTotals(t, b), { ...EMPTY_TOTALS }),
    [byBook],
  );

  return { byBook, overall, save, settled, refresh };
}
