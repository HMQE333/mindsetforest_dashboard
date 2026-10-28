import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

/**
 * Deleting one note: the first press turns the trash into a red "Delete?" in
 * the same spot for a few seconds, a second press there deletes. Moving away,
 * Esc or the timeout puts the trash back, so one stray press never deletes
 * and two quick presses in one place are enough. No dialog. The delete itself
 * then waits for its Undo toast (pending-deletes.ts).
 */

/** How long "Delete?" waits for the second press. */
export const ARM_MS = 3_000;

export interface Armed {
  /** Armed from the keyboard (Delete): the button says which keys confirm. */
  keys: boolean;
}

/**
 * One live region for the Archive, made once and kept on the page. A region
 * put in already filled (inside the "Delete?" button as it appears) is mostly
 * not read; a change to one that exists is.
 */
let liveRegion: HTMLElement | null = null;
function ensureLiveRegion(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (!liveRegion || !liveRegion.isConnected) {
    liveRegion = document.createElement("div");
    liveRegion.setAttribute("aria-live", "assertive");
    liveRegion.setAttribute("aria-atomic", "true");
    liveRegion.className = "sr-only";
    liveRegion.dataset.archiveLive = "";
    document.body.appendChild(liveRegion);
  }
  return liveRegion;
}

/** Say this to a screen reader (cleared first, so the same words twice are read twice). */
export function announce(text: string) {
  const region = ensureLiveRegion();
  if (!region) return;
  region.textContent = "";
  window.setTimeout(() => {
    region.textContent = text;
  }, 30);
}

/** A "Delete?" state that falls back to the trash after ARM_MS. */
export function useArmedDelete(timeoutMs = ARM_MS) {
  const [armed, setArmed] = useState<Armed | null>(null);
  const timer = useRef<number>();
  const disarm = useCallback(() => {
    window.clearTimeout(timer.current);
    setArmed(null);
  }, []);
  const arm = useCallback(
    (keys = false) => {
      window.clearTimeout(timer.current);
      setArmed({ keys });
      timer.current = window.setTimeout(() => setArmed(null), timeoutMs);
    },
    [timeoutMs],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { armed, arm, disarm };
}

export function DeleteConfirmButton({
  armed,
  onArm,
  onConfirm,
  onDisarm,
  variant,
  className = "",
}: {
  armed: Armed | null;
  onArm: () => void;
  onConfirm: () => void;
  onDisarm: () => void;
  /** "card": the small corner trash of a Library card; "tool": a toolbar button (the peek, the reader). */
  variant: "card" | "tool";
  className?: string;
}) {
  const size = variant === "card" ? "h-7 min-w-[1.75rem] text-[11px]" : "h-11 min-w-[2.25rem] text-sm sm:h-9";
  // The region exists before anything is said into it.
  useEffect(() => void ensureLiveRegion(), []);
  const isArmed = !!armed;
  const byKeys = !!armed?.keys;
  useEffect(() => {
    if (isArmed) announce(byKeys ? "Delete this note? Enter deletes it, Escape keeps it." : "Delete this note? Press again to delete it, Escape keeps it.");
  }, [isArmed, byKeys]);
  if (armed) {
    return (
      <button
        type="button"
        data-delete-armed=""
        onClick={(e) => {
          e.stopPropagation();
          onConfirm();
        }}
        onPointerLeave={armed.keys ? undefined : onDisarm}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onDisarm();
          }
        }}
        aria-label="Delete this note: press again to confirm"
        className={`inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-destructive px-2 font-bold text-destructive-foreground shadow-sm animate-in fade-in-0 zoom-in-95 duration-100 hover:bg-destructive/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-destructive ${size} ${className}`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Delete?
        {armed.keys && <span className="text-[10px] font-normal opacity-80">Enter / Esc</span>}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        // One press: the note goes to the Trash for 7 days (and the toast can undo it), so nothing asks first.
        onConfirm();
      }}
      tabIndex={variant === "card" ? -1 : undefined}
      aria-label="Move to Trash"
      title="Move to Trash (kept 7 days)"
      className={`inline-flex items-center justify-center rounded-lg px-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${size} ${className}`}
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}
