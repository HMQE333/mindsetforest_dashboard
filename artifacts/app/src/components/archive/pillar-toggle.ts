import { useCallback, useRef, useState } from "react";
import type { ArchiveBlock } from "@/lib/archive-data";

type UpdateBlock = (id: string, updates: Partial<ArchiveBlock>) => Promise<unknown>;

/**
 * One press toggles a pillar on a note and saves it at once. The chip shows
 * the new state before the server answers; quick presses build on each other
 * (the second sees the first), and a failed save (updateBlock says why) puts
 * the chips back as the note is.
 */
export function usePillarToggle(updateBlock: UpdateBlock) {
  const [over, setOver] = useState<ReadonlyMap<string, string[]>>(new Map());
  const overRef = useRef(over);
  overRef.current = over;

  const pillarsOf = useCallback((b: ArchiveBlock): string[] => over.get(b.id) ?? b.pillars ?? [], [over]);

  const toggle = useCallback(
    async (b: ArchiveBlock, pillarId: string) => {
      const current = overRef.current.get(b.id) ?? b.pillars ?? [];
      const next = current.includes(pillarId) ? current.filter((p) => p !== pillarId) : [...current, pillarId];
      const withNext = new Map(overRef.current);
      withNext.set(b.id, next);
      overRef.current = withNext;
      setOver(withNext);
      await updateBlock(b.id, { pillars: next });
      setOver((m) => {
        if (m.get(b.id) !== next) return m;
        const out = new Map(m);
        out.delete(b.id);
        overRef.current = out;
        return out;
      });
    },
    [updateBlock],
  );

  return { pillarsOf, toggle };
}
