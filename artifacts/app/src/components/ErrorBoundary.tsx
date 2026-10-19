import React from "react";
import { isChunkLoadError, reloadOnceForNewBuild } from "@/lib/lazy-module";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** Code that failed to download: asking the server for a new build, and reloading to pick it up. */
  checking?: boolean;
  reloading?: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, checking: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
    // A tab left open across a deploy: reload once onto the new build rather than show this screen.
    if (isChunkLoadError(error)) void reloadOnceForNewBuild().then((reloading) => this.setState({ checking: false, reloading }));
  }

  render() {
    if (this.state.checking || this.state.reloading) return <div className="min-h-screen bg-background" aria-busy="true" />;
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 relative overflow-hidden">
          <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-destructive/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />

          <div className="relative z-10 text-center max-w-md">
            <div className="text-6xl mb-6">💥</div>
            <h1 className="text-2xl font-bold text-foreground mb-3">Something went wrong</h1>
            <p className="text-sm text-muted-foreground mb-6">
              An unexpected error occurred. Try refreshing the page.
            </p>
            {this.state.error && (
              <p className="text-xs text-destructive/70 mb-6 font-mono bg-muted/30 rounded-xl p-3 break-all">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = "/";
              }}
              className="px-8 py-3 rounded-xl text-sm font-bold gradient-purple text-primary-foreground hover:opacity-90 transition-all glow-sm"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
