import { describe, it, expect, vi } from "vitest";
import { lazyModule } from "../lib/lazy-module";

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
