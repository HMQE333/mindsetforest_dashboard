/**
 * Placeholders shown while a code-split screen downloads.
 *
 * They fade in after a short delay, so a chunk that arrives quickly (prefetched,
 * or cached) shows nothing at all instead of a one-frame flash.
 */

const FADE_IN = `@keyframes mf-skeleton-in{from{opacity:0}to{opacity:1}}`;
const fadeIn = (delayMs: number) => ({ animation: `mf-skeleton-in 200ms ease-out ${delayMs}ms both` });

/** Same box and text as DashboardView's own loading state, so Home goes straight from one to the other. */
export function HomeSkeleton() {
  return (
    <div className="flex items-center justify-center py-20" aria-busy="true">
      <style>{FADE_IN}</style>
      <div style={fadeIn(120)}>
        <div className="text-muted-foreground animate-pulse">Loading dashboard...</div>
      </div>
    </div>
  );
}

/** A module's toolbar and a grid of cards in the app's glass style. */
export default function ModuleSkeleton({ label }: { label?: string }) {
  return (
    <div className="min-h-[60vh]" aria-busy="true" aria-label={label ? `Loading ${label}` : "Loading"}>
      <style>{FADE_IN}</style>
      <div className="space-y-4" style={fadeIn(150)}>
        <div className="h-12 rounded-2xl glass-card animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-32 rounded-2xl glass-card animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Full-screen placeholder, as ProtectedRoute shows while auth loads. */
export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center" aria-busy="true">
      <style>{FADE_IN}</style>
      <div style={fadeIn(120)}>
        <div className="text-muted-foreground animate-pulse">Loading...</div>
      </div>
    </div>
  );
}
