import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

/**
 * View state that outlives its component for the rest of the page's life:
 * the Archive mounts only the open sub-tab, so the Library's search, filters
 * and sort (and which sub-tab was open) would otherwise reset on every switch.
 * Not persisted: a reload starts clean.
 */
const memory = new Map<string, unknown>();

export function useRemembered<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => (memory.has(key) ? (memory.get(key) as T) : initial));
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) =>
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        memory.set(key, v);
        return v;
      }),
    [key],
  );
  return [value, set];
}

/** Test hook. */
export function forgetRemembered() {
  memory.clear();
}
