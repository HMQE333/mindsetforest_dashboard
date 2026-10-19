import { Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { DashboardStateProvider } from "@/hooks/useDashboardState";
import { AssistantProvider, useAssistant } from "@/hooks/useAssistant";
import { useIntervalsAutoSync } from "@/hooks/useIntervalsAutoSync";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ChunkErrorBoundary, { ChunkRetry } from "@/components/ChunkErrorBoundary";
import { PageSkeleton } from "@/components/ModuleSkeleton";
import { lazyModule, whenIdle } from "@/lib/lazy-module";
// Index (landing + Home shell) and Auth stay in the entry chunk: they are the
// first screen. Everything they open is code-split (see Index.tsx).
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { TrackerPage, SharedLibraryPage } from "./pages/lazy-pages";

const AssistantPanel = lazyModule(() => import("@/components/assistant/AssistantPanel"));

const queryClient = new QueryClient();

// Preview builds (pnpm preview:build) are served from a static host under an
// arbitrary path, so they use hash routing (#/tracker) instead of clean URLs.
// Production keeps BrowserRouter with the deployment's base path.
const useHashRouter = import.meta.env.VITE_HASH_ROUTER === "1";
/** App-wide background work with no UI: pulls watch data from intervals.icu when stale. */
function BackgroundSync() {
  useIntervalsAutoSync();
  return null;
}

/**
 * The assistant (its launcher robot pulls in lottie and a large animation file)
 * is only for signed-in users, and it is not needed for the first paint: it
 * mounts once the page is idle, or at once when something asks for it (the
 * hotkey, a prefill or voice request from another screen).
 */
function DeferredAssistantPanel() {
  const { user } = useAuth();
  const { open, prefillRequest, voiceRequested } = useAssistant();
  const [ready, setReady] = useState(false);
  const wanted = open || !!prefillRequest || voiceRequested;
  useEffect(() => {
    if (!user || ready) return;
    if (wanted) { setReady(true); return; }
    return whenIdle(() => setReady(true), 4000);
  }, [user, ready, wanted]);
  if (!user || !(ready || wanted)) return null;
  // Offline, its chunk may not arrive: then nothing is shown, and opening the
  // assistant (hotkey, a request from another screen) tries again.
  return (
    <ChunkErrorBoundary fallback={null} resetKey={wanted}>
      <Suspense fallback={null}>
        {/* No box of its own; index.css hides it while a full-page reader covers the app. */}
        <div data-assistant-root="" className="contents">
          <AssistantPanel />
        </div>
      </Suspense>
    </ChunkErrorBoundary>
  );
}

/** A route whose code could not be fetched (offline) says so, with a reload; going to another route clears it. */
function RouteChunkBoundary({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ChunkErrorBoundary
      resetKey={pathname}
      pending={<PageSkeleton />}
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <ChunkRetry what="this page" />
        </div>
      }
    >
      {children}
    </ChunkErrorBoundary>
  );
}

const AppRouter = ({ children }: { children: React.ReactNode }) =>
  useHashRouter ? <HashRouter>{children}</HashRouter> : <BrowserRouter basename={import.meta.env.BASE_URL}>{children}</BrowserRouter>;

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-foreground animate-pulse">Loading...</div></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppRouter>
          <AuthProvider>
            <DashboardStateProvider>
              <AssistantProvider>
                <BackgroundSync />
                <RouteChunkBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <Routes>
                      <Route path="/" element={<Index />} />
                      <Route path="/auth" element={<Auth />} />
                      <Route path="/tracker" element={<ProtectedRoute><TrackerPage /></ProtectedRoute>} />
                      <Route path="/share/library/:shareId" element={<SharedLibraryPage />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </RouteChunkBoundary>
                <DeferredAssistantPanel />
              </AssistantProvider>
            </DashboardStateProvider>
          </AuthProvider>
        </AppRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
