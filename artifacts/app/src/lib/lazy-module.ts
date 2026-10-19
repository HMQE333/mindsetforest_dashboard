import { createElement, lazy, useState, type ComponentType, type FunctionComponent } from "react";

/**
 * Code-split components that can be fetched ahead of time.
 *
 * `lazyModule(() => import("./X"))` returns a component that renders like
 * React.lazy (suspends until the chunk arrives) plus `preload()`, which starts
 * the download without rendering anything: on hover of a nav item, on idle,
 * or as soon as we can tell which screen comes next.
 *
 * Once the chunk is in, new instances render the real component directly. Plain
 * React.lazy suspends once on its first render even when the import already
 * resolved, which would flash the Suspense fallback for a frame on a tab whose
 * code was prefetched.
 */
export type LazyModule<P extends object> = FunctionComponent<P> & {
  preload: () => Promise<void>;
  isLoaded: () => boolean;
};

const RELOAD_KEY = "mf-chunk-reload-at";

/** A chunk of an older deployment that is gone from the server (or the network dropped). */
function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Unable to preload CSS|ChunkLoadError/i.test(msg);
}

/**
 * After a deploy, an open tab still points at the previous build's chunk names,
 * which no longer exist. Reload once to pick up the new build instead of showing
 * the error screen; a second failure within a minute is a real error.
 */
function reloadOnceForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export function lazyModule<P extends object>(factory: () => Promise<{ default: ComponentType<P> }>): LazyModule<P> {
  let resolved: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;

  const load = () => {
    if (!pending) {
      pending = factory().then(
        (m) => (resolved = m.default),
        (err) => {
          pending = null; // let the next render or hover try again
          throw err;
        },
      );
    }
    return pending;
  };

  const Lazy = lazy(() =>
    load().then(
      (Component) => ({ default: Component }),
      (err) => {
        // Rendering needs the chunk now: a stale build gets one reload, anything else goes to the ErrorBoundary.
        if (isChunkLoadError(err) && reloadOnceForNewBuild()) return new Promise<never>(() => {});
        throw err;
      },
    ),
  );

  function LazyModuleComponent(props: P) {
    // Chosen once per instance: switching from Lazy to the resolved component later would remount it.
    const [Component] = useState<ComponentType<P>>(() => resolved ?? (Lazy as unknown as ComponentType<P>));
    return createElement(Component, props);
  }

  return Object.assign(LazyModuleComponent, {
    // A prefetch that fails stays silent; the render that needs the chunk will retry and report.
    preload: () => load().then(() => undefined, () => undefined),
    isLoaded: () => resolved !== null,
  });
}

type IdleDeadlineLike = { didTimeout: boolean; timeRemaining: () => number };

/** Run `fn` when the main thread is idle (or after `timeout` ms at the latest). Returns a cancel function. */
export function whenIdle(fn: () => void, timeout = 2000): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: (d: IdleDeadlineLike) => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(() => fn(), { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, Math.min(timeout, 300));
  return () => window.clearTimeout(id);
}

/** Speculative downloads are skipped when the user asked to save data or is on a 2G-class connection. */
export function canPrefetch(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!c) return true;
  return !c.saveData && !/(^|-)2g$/.test(c.effectiveType ?? "");
}
