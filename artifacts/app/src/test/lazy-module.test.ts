import { afterEach, describe, it, expect, vi } from "vitest";
import { isChunkLoadError, lazyModule, moduleScriptsOf, reloadOnceForNewBuild } from "../lib/lazy-module";

const View = () => null;

describe("lazyModule", () => {
  it("fetches once, however often it is preloaded", async () => {
    const factory = vi.fn(() => Promise.resolve({ default: View }));
    const M = lazyModule(factory);
    expect(M.isLoaded()).toBe(false);
    await Promise.all([M.preload(), M.preload()]);
    await M.preload();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(M.isLoaded()).toBe(true);
  });

  it("does not fetch until asked", () => {
    const factory = vi.fn(() => Promise.resolve({ default: View }));
    lazyModule(factory);
    expect(factory).not.toHaveBeenCalled();
  });

  it("keeps a failed prefetch quiet and tries again next time", async () => {
    const factory = vi
      .fn<() => Promise<{ default: typeof View }>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module: /assets/X.js"))
      .mockResolvedValueOnce({ default: View });
    const M = lazyModule(factory);
    await expect(M.preload()).resolves.toBeUndefined();
    expect(M.isLoaded()).toBe(false);
    await M.preload();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(M.isLoaded()).toBe(true);
  });
});

describe("stale-chunk guard", () => {
  it("recognises a chunk that could not be fetched, in each browser's wording", () => {
    // Chrome, Firefox, Safari, and Vite's CSS preload.
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/ArchiveView-abc.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module: https://x/assets/a.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Unable to preload CSS for /assets/PlanningMap-x.css"))).toBe(true);
    // A bug inside a module is not a download problem.
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isChunkLoadError("network down")).toBe(false);
  });

  const RUNNING = `<script type="module" crossorigin src="/assets/index-OLD111.js"></script>`;
  const NEW_BUILD = `<!doctype html><head><script type="module" crossorigin src="/assets/index-NEW222.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/react-abc.js"></head>`;

  function stubBrowser({ online = true, served = NEW_BUILD as string | Error }: { online?: boolean; served?: string | Error } = {}) {
    const store = new Map<string, string>();
    const reload = vi.fn();
    const fetchFn = vi.fn(async () => {
      if (served instanceof Error) throw served;
      return { ok: true, text: async () => served };
    });
    vi.stubGlobal("navigator", { onLine: online });
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    vi.stubGlobal("window", { location: { reload, href: "https://app.example/" } });
    vi.stubGlobal("document", {
      querySelectorAll: () => [{ getAttribute: () => "/assets/index-OLD111.js" }],
    });
    vi.stubGlobal("fetch", fetchFn);
    return { reload, fetchFn };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reads the module scripts of a page, whatever the attribute order", () => {
    expect(moduleScriptsOf(NEW_BUILD, "https://app.example/")).toEqual(["/assets/index-NEW222.js"]);
    expect(moduleScriptsOf(RUNNING, "https://app.example/")).toEqual(["/assets/index-OLD111.js"]);
    expect(moduleScriptsOf(`<script src="./a.js" type='module'></script><script src="/legacy.js"></script>`, "https://app.example/sub/"))
      .toEqual(["/sub/a.js"]);
    expect(moduleScriptsOf("<p>no scripts</p>", "https://app.example/")).toEqual([]);
  });

  it("reloads once when the server has a new build, and treats a second failure within a minute as a real error", async () => {
    vi.useFakeTimers();
    const { reload } = stubBrowser();
    expect(await reloadOnceForNewBuild()).toBe(true);
    expect(await reloadOnceForNewBuild()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61_000);
    expect(await reloadOnceForNewBuild()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload when the server still has the same build (the network dropped the request)", async () => {
    vi.useFakeTimers();
    vi.advanceTimersByTime(120_000); // past the shared check of the test above
    const { reload } = stubBrowser({ served: `<html>${RUNNING}</html>` });
    expect(await reloadOnceForNewBuild()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload when the server cannot be reached", async () => {
    vi.useFakeTimers();
    vi.advanceTimersByTime(240_000);
    const { reload } = stubBrowser({ served: new TypeError("Failed to fetch") });
    expect(await reloadOnceForNewBuild()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not even ask while offline (the page would only be swapped for the browser's error page)", async () => {
    const { reload, fetchFn } = stubBrowser({ online: false });
    expect(await reloadOnceForNewBuild()).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
