import { useEffect } from "react";
import { WifiOff } from "lucide-react";

interface Props {
  onRetry: () => void;
  /** Full screen in place of the app (first load), or a card inside a view. */
  fullScreen?: boolean;
  what?: string;
}

/**
 * Shown when your data could not be read (no internet, server down). The app
 * does not fall back to defaults or the first-run setup in that case: that
 * looked like a working "offline mode" but showed the wrong state, and a
 * choice made there could overwrite the real data once the connection came
 * back. Retries by itself when the browser is back online.
 */
const OfflineNotice = ({ onRetry, fullScreen, what = "your data" }: Props) => {
  useEffect(() => {
    window.addEventListener("online", onRetry);
    return () => window.removeEventListener("online", onRetry);
  }, [onRetry]);

  const card = (
    <div className="glass-card p-8 max-w-sm w-full text-center space-y-3">
      <WifiOff className="w-8 h-8 mx-auto text-muted-foreground" />
      <h2 className="font-bold text-foreground">Can't reach the server</h2>
      <p className="text-sm text-muted-foreground">
        Couldn't load {what}. Check your connection. Nothing was changed, and it will load as soon as you are back online.
      </p>
      <button
        onClick={onRetry}
        className="text-sm font-semibold px-4 py-2 rounded-xl gradient-purple text-primary-foreground"
      >
        Try again
      </button>
    </div>
  );

  if (!fullScreen) return <div className="flex justify-center py-16">{card}</div>;
  return <div className="min-h-screen bg-background flex items-center justify-center p-4">{card}</div>;
};

export default OfflineNotice;
