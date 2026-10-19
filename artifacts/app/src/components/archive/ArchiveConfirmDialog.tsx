import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * The Archive's confirmation dialog ("Delete 7 notes?", "Delete this note?").
 * Built for titles that are one long URL: the box never grows past the screen
 * (one grid column of minmax(0, 1fr)), long words wrap anywhere, and the
 * buttons wrap inside the box instead of sticking out, on phones too. Pass a
 * title already shortened with shortTitle (lib/archive-data.ts).
 */
export default function ArchiveConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent className="glass-card w-[calc(100vw-2rem)] max-w-md grid-cols-[minmax(0,1fr)] overflow-hidden rounded-xl border-white/10 p-5 sm:p-6" lang="en">
        <AlertDialogHeader className="min-w-0 text-left">
          <AlertDialogTitle className="min-w-0 text-base [overflow-wrap:anywhere]">{title}</AlertDialogTitle>
          {description && <AlertDialogDescription className="min-w-0 [overflow-wrap:anywhere]">{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row flex-wrap justify-end gap-2 space-x-0 sm:space-x-0">
          <AlertDialogCancel className="mt-0 min-w-0 border-white/10" disabled={busy}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={busy}
            className={`min-w-[5.5rem] ${destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Working" /> : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
