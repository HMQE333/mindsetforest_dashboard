import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

// The hook is called as a plain function: memo and callback are the values, effects do not run.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useMemo: (f: () => unknown) => f(),
  useCallback: (f: unknown) => f,
  useEffect: () => {},
}));
const h = vi.hoisted(() => ({
  qc: null as unknown as QueryClient,
  updatedAt: "2026-10-20T10:00:05Z",
  /** What the next list fetch returns, and when it lands. */
  rows: [] as unknown[],
  gate: Promise.resolve(),
  fetches: 0,
}));
// The real QueryClient (the race is in it); only the hooks are replaced.
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => ({ data: undefined, isLoading: false, error: null }),
  useQueryClient: () => h.qc,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    functions: { invoke: vi.fn() },
    from: () => ({
      update: () => ({ eq: () => ({ select: async () => ({ data: [{ updated_at: h.updatedAt }], error: null }) }) }),
    }),
  },
}));

import { REFETCH_AFTER_WRITES_MS, useArchiveState } from "../hooks/useArchiveState";
import type { ArchiveBlock } from "../lib/archive-data";

const KEY = ["archive_blocks", "u1"];
const note = (tags: string[], updated_at = "2026-10-20T10:00:00Z"): ArchiveBlock =>
  ({ id: "n1", user_id: "u1", title: "N", content: "x", tags, pillars: [], directions: [], created_at: "2026-10-01T00:00:00Z", updated_at }) as unknown as ArchiveBlock;

/** The next list fetch returns `rows` (what the table held when it read) and lands when told to. */
function nextFetch(rows: ArchiveBlock[]) {
  let land!: () => void;
  h.gate = new Promise<void>((r) => (land = r));
  h.rows = rows;
  return land;
}

let unsubscribe = () => {};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  h.qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  h.fetches = 0;
  h.qc.setQueryData(KEY, [note([])]);
  // The Library watching the list, as in the app (staleTime: Infinity; the poll invalidates).
  const observer = new QueryObserver(h.qc, {
    queryKey: KEY,
    staleTime: Infinity,
    queryFn: async () => {
      h.fetches++;
      const rows = h.rows;
      await h.gate;
      return rows;
    },
  });
  unsubscribe = observer.subscribe(() => {});
});
afterEach(() => {
  unsubscribe();
  vi.useRealTimers();
  h.qc.clear();
});

describe("a write while the poll's refetch is in flight (review 2)", () => {
  it("keeps the write: the stale refetch is cancelled, and one fresh fetch follows after the writes", async () => {
    const land = nextFetch([note([])]);
    // The poll saw a change and started a full refetch; it read the table before the drop below.
    void h.qc.invalidateQueries({ queryKey: KEY });
    expect(h.qc.isFetching({ queryKey: KEY })).toBe(1);

    const { updateBlock } = useArchiveState();
    expect(await updateBlock("n1", { tags: ["a"] })).toBe(true);
    land();
    await vi.advanceTimersByTimeAsync(0);
    // Without the cancel, the old rows land over the drop and the next folder action writes [b] instead of [a, b].
    expect(h.qc.getQueryData<ArchiveBlock[]>(KEY)?.[0].tags).toEqual(["a"]);

    // The news the cancelled refetch was for is fetched once the writes pause, after the write.
    expect(h.fetches).toBe(1);
    nextFetch([note(["a"], h.updatedAt)])();
    await vi.advanceTimersByTimeAsync(REFETCH_AFTER_WRITES_MS + 10);
    expect(h.fetches).toBe(2);
    expect(h.qc.getQueryData<ArchiveBlock[]>(KEY)?.[0]).toMatchObject({ tags: ["a"], updated_at: h.updatedAt });
  });

  it("a batch of writes under one refetch asks for the list again once, not once per write", async () => {
    nextFetch([note([])]);
    void h.qc.invalidateQueries({ queryKey: KEY });
    const { updateBlock } = useArchiveState();
    await updateBlock("n1", { tags: ["a"] });
    await updateBlock("n1", { tags: ["a", "b"] });
    await updateBlock("n1", { tags: ["a", "b", "c"] });
    nextFetch([note(["a", "b", "c"], h.updatedAt)])();
    await vi.advanceTimersByTimeAsync(REFETCH_AFTER_WRITES_MS + 10);
    expect(h.fetches).toBe(2);
    expect(h.qc.getQueryData<ArchiveBlock[]>(KEY)?.[0].tags).toEqual(["a", "b", "c"]);
  });

  it("with no refetch in flight it only writes (no cancel, no extra fetch)", async () => {
    const cancel = vi.spyOn(h.qc, "cancelQueries");
    const { updateBlock } = useArchiveState();
    await updateBlock("n1", { tags: ["a"] });
    await vi.advanceTimersByTimeAsync(REFETCH_AFTER_WRITES_MS + 10);
    expect(cancel).not.toHaveBeenCalled();
    expect(h.fetches).toBe(0);
    expect(h.qc.getQueryData<ArchiveBlock[]>(KEY)?.[0]).toMatchObject({ tags: ["a"], updated_at: h.updatedAt });
  });
});
