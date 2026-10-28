import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { shortTitle } from "@/lib/archive-data";

/**
 * The Archive's Trash: notes deleted in the last 7 days (archive_trash), each
 * with Restore and Delete forever, and Empty trash. Older ones are purged by
 * useArchiveState when the Archive loads.
 */
interface TrashRow {
  id: string;
  deleted_at: string;
  block: { title?: string; content?: string };
}

const TRASH_DAYS = 7;
const daysLeft = (deletedAt: string) => Math.max(0, Math.ceil(TRASH_DAYS - (Date.now() - Date.parse(deletedAt)) / 86_400_000));

export default function ArchiveTrash({ open, onOpenChange, onRestored }: { open: boolean; onOpenChange: (o: boolean) => void; onRestored: () => void }) {
  const [rows, setRows] = useState<TrashRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("archive_trash" as any).select("id, deleted_at, block").order("deleted_at", { ascending: false });
    if (error) {
      toast.error("Couldn't open the Trash", { description: error.message });
      setRows([]);
      return;
    }
    setRows((data as unknown as TrashRow[]) ?? []);
  }, []);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const restore = async (ids: string[]) => {
    setBusy(ids.length === 1 ? ids[0] : "all");
    const { error } = await supabase.rpc("restore_archive_blocks" as any, { ids });
    setBusy(null);
    if (error) return void toast.error("Couldn't restore", { description: error.message });
    toast.success(ids.length === 1 ? "Restored" : `${ids.length} notes restored`);
    setRows((r) => (r ?? []).filter((x) => !ids.includes(x.id)));
    onRestored();
  };

  const purge = async (ids: string[]) => {
    setBusy(ids.length === 1 ? ids[0] : "all");
    const { error } = await supabase.rpc("purge_archive_trash" as any, { ids });
    setBusy(null);
    if (error) return void toast.error("Couldn't delete", { description: error.message });
    setRows((r) => (r ?? []).filter((x) => !ids.includes(x.id)));
  };

  const all = (rows ?? []).map((r) => r.id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card w-[calc(100vw-1rem)] max-w-xl max-h-[85vh] overflow-hidden border-white/10 flex flex-col" lang="en">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2"><Trash2 className="h-4 w-4" /> Trash</DialogTitle>
          <p className="text-xs text-muted-foreground">Deleted notes stay here for {TRASH_DAYS} days, then they are gone.</p>
        </DialogHeader>
        {rows === null ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">The Trash is empty.</p>
        ) : (
          <>
            <ul className="min-h-0 flex-1 overflow-y-auto space-y-1.5 pr-1">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{shortTitle(r.block?.title || r.block?.content?.slice(0, 80) || "Untitled", 90)}</p>
                    <p className="text-[11px] text-muted-foreground">{daysLeft(r.deleted_at)} day{daysLeft(r.deleted_at) === 1 ? "" : "s"} left</p>
                  </div>
                  <button onClick={() => void restore([r.id])} disabled={!!busy} className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50">
                    {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Restore
                  </button>
                  <button onClick={() => void purge([r.id])} disabled={!!busy} title="Delete forever" aria-label="Delete forever" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive disabled:opacity-50">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2 pt-2 border-t border-white/10">
              <button onClick={() => void restore(all)} disabled={!!busy} className="rounded-md px-3 py-1.5 text-xs font-semibold bg-muted/40 hover:bg-muted/60 disabled:opacity-50">Restore all</button>
              <span className="flex-1" />
              <EmptyButton disabled={!!busy} onConfirm={() => void purge(all)} n={all.length} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Emptying the Trash cannot be undone, so it is the one place that asks: press twice. */
function EmptyButton({ n, disabled, onConfirm }: { n: number; disabled: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${armed ? "bg-destructive text-destructive-foreground" : "text-destructive hover:bg-destructive/15"}`}
    >
      {armed ? `Delete ${n} forever?` : "Empty trash"}
    </button>
  );
}
