import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { isChunkLoadError, reloadOnceForNewBuild, retryFailedChunks } from "@/lib/lazy-module";

interface Props {
  children: ReactNode;
  /** Shown when the code could not be fetched. */
  fallback: ReactNode;
  /** Shown while it checks for a new deployment, and while the page reloads to pick it up. */
  pending?: ReactNode;
  /** When it changes (another tab, a modal opened again), the error is cleared and the next render tries again. */
  resetKey?: unknown;
  /** Told once per failure that is not followed by a reload, e.g. to close a modal and say why. */
  onChunkError?: () => void;
}

interface State {
  error: Error | null;
  /** Asking the server whether a new build is out. */
  checking: boolean;
  reloading: boolean;
}

/**
 * Catches a code-split chunk that fails to download, close to where it is
 * used, so the rest of the app stays usable.
 *
 * When the server has a new build (a tab left open across a deploy), the page
 * reloads once to pick it up. A network problem (offline, a dropped request)
 * or a second failure within a minute shows `fallback` instead. Any other
 * error is not a download problem and goes on to the app-wide ErrorBoundary,
 * as before code splitting.
 *
 * Browsers remember a failed module download for the life of the page (a
 * second import() of the same file fails at once, even back online), so the
 * way out of `fallback` is a page reload; see ChunkRetry.
 */
export default class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { error: null, checking: false, reloading: false };
  private caught = 0;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, checking: isChunkLoadError(error), reloading: false };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    if (!isChunkLoadError(error)) return;
    const id = ++this.caught;
    void reloadOnceForNewBuild().then((reloading) => {
      // A retry or reset since then started over.
      if (id !== this.caught || this.state.error !== error) return;
      this.setState({ checking: false, reloading });
      if (!reloading) this.props.onChunkError?.();
    });
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && !this.state.reloading && !Object.is(prev.resetKey, this.props.resetKey)) this.retry();
  }

  private retry() {
    this.caught++;
    retryFailedChunks();
    this.setState({ error: null, checking: false, reloading: false });
  }

  render() {
    const { error, checking, reloading } = this.state;
    if (!error) return this.props.children;
    if (!isChunkLoadError(error)) throw error;
    return checking || reloading ? (this.props.pending ?? null) : this.props.fallback;
  }
}

/** Reloads the page, unless the device is offline (a reload would show the browser's error page). */
export function reloadIfOnline(): boolean {
  if (navigator.onLine === false) return false;
  window.location.reload();
  return true;
}

/** The inline card a module shows when its code could not be fetched. */
export function ChunkRetry({ what }: { what: string }) {
  const [offline, setOffline] = useState(false);
  return (
    <div className="text-center py-20" role="alert">
      <p className="text-muted-foreground mb-6">
        Couldn't load {what}. {offline ? "You're offline: reload once the connection is back." : "Check your connection, then reload."}
      </p>
      <button
        onClick={() => setOffline(!reloadIfOnline())}
        className="px-8 py-3 rounded-xl text-sm font-bold gradient-purple text-primary-foreground hover:opacity-90 transition-all glow-sm"
      >
        Reload
      </button>
    </div>
  );
}
