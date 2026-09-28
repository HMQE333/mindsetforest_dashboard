import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { DashboardStateProvider } from "@/hooks/useDashboardState";
import { AssistantProvider } from "@/hooks/useAssistant";
import AssistantPanel from "@/components/assistant/AssistantPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Tracker from "./pages/Tracker";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import SharedLibrary from "./pages/SharedLibrary";

const queryClient = new QueryClient();

// Preview builds (pnpm preview:build) are served from a static host under an
// arbitrary path, so they use hash routing (#/tracker) instead of clean URLs.
// Production keeps BrowserRouter with the deployment's base path.
const useHashRouter = import.meta.env.VITE_HASH_ROUTER === "1";
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
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/tracker" element={<ProtectedRoute><Tracker /></ProtectedRoute>} />
                  <Route path="/share/library/:shareId" element={<SharedLibrary />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                <AssistantPanel />
              </AssistantProvider>
            </DashboardStateProvider>
          </AuthProvider>
        </AppRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
