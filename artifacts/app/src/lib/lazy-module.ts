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

/**
 * A chunk that could not be fetched: one of an older deployment that is gone
 * from the server, or the network dropped. The wording differs per browser
 * (Chrome, Firefox, Safari) and for Vite's CSS preload.
 */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Unable to preload CSS|ChunkLoadError/i.test(msg);
}

/** The module scripts a page loads, as paths. Vite names them by content hash, so they change with every deployment. */
export function moduleScriptsOf(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
    if (!/\btype\s*=\s*["']?module\b/i.test(tag)) continue;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (src) out.push(new URL(src, baseUrl).pathname);
  }
  return out.sort();
}

let deployCheck: { at: number; result: Promise<boolean> } | null = null;

/**
 * Whether the server now has another build than the one this page runs: its
 * index.html loads other module scripts. False whenever that cannot be told
 * (offline, the request fails, a dev server), because a reload would not help
 * then. Failures that arrive together share one request.
 */
export function newBuildDeployed(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve(false);
  if (deployCheck && Date.now() - deployCheck.at < 10_000) return deployCheck.result;
  const url = new URL(import.meta.env.BASE_URL || "/", window.location.href).href;
  const running = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'), (el) =>
    new URL(el.getAttribute("src") ?? "", url).pathname,
  ).sort();
  const result = fetch(url, { cache: "no-store", credentials: "same-origin" })
    .then((res) => (res.ok ? res.text() : ""))
    .then((html) => {
      const live = html ? moduleScriptsOf(html, url) : [];
      return running.length > 0 && live.length > 0 && live.join("\n") !== running.join("\n");
    })
    .catch(() => false);
  deployCheck = { at: Date.now(), result };
  return result;
}

/**
 * After a deploy, an open tab still points at the previous build's chunk names,
 * which are gone from the server. When a chunk fails and the server does have
 * a new build, reload once to pick it up instead of showing an error. Resolves
 * true when the page is reloading. A network problem, or a second failure
 * within a minute (no reload loops), resolves false: the caller says the code
 * could not load (ChunkErrorBoundary).
 */
export async function reloadOnceForNewBuild(): Promise<boolean> {
  if (!(await newBuildDeployed())) return false;
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

/** Code-split components whose download failed, each waiting to swap in a fresh React.lazy. */
const failedLazies = new Set<() => void>();

/**
 * Lets every code-split component whose download failed fetch again on its
 * next render. ChunkErrorBoundary calls it when it retries or resets.
 *
 * A failed React.lazy stays failed, and React renders it again (with the same
 * object) until an error boundary shows the error. Swapping it at the moment
 * of failure would make that render start a new download instead, and a
 * render that keeps failing would never reach the boundary; so the swap waits
 * for this call.
 */
export function retryFailedChunks(): void {
  for (const renew of failedLazies) renew();
  failedLazies.clear();
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

  // React.lazy remembers a failed load for good: after a failure, a retry
  // (retryFailedChunks) swaps in a fresh one, so the next mount fetches again.
  const renew = () => {
    Lazy = makeLazy();
  };
  const makeLazy = () =>
    lazy(() =>
      load().then(
        (Component) => ({ default: Component }),
        (err) => {
          failedLazies.add(renew);
          // Rendering needs the chunk now: a stale tab gets one reload (it stays suspended meanwhile);
          // anything else goes on to the nearest error boundary.
          if (!isChunkLoadError(err)) throw err;
          return reloadOnceForNewBuild().then((reloading) => {
            if (reloading) return new Promise<never>(() => {});
            throw err;
          });
        },
      ),
    );
  let Lazy = makeLazy();

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

/**
 * True from the first render where `open` is true, and from then on. A
 * code-split modal mounts (and downloads) on its first open, then stays
 * mounted, so it keeps its state and plays its close animation.
 */
export function useOpenedOnce(open: boolean): boolean {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened || open;
}

/**
 * How many times `open` has turned true (0 = never opened). As the reset key of
 * a modal's ChunkErrorBoundary, a chunk that failed is fetched again on the next
 * open, not as soon as the modal closes.
 */
export function useOpenCount(open: boolean): number {
  const [state, setState] = useState({ count: open ? 1 : 0, open });
  if (open !== state.open) {
    const next = { count: open ? state.count + 1 : state.count, open };
    setState(next);
    return next.count;
  }
  return state.count;
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
