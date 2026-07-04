import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Upload, FileText, Download, X, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtPace, type WatchEntryInput } from "@/lib/watch-data";
import {
  parseWatchCsv,
  buildWatchCsvTemplate,
  type ParsedWatchDay,
} from "@/lib/watch-import";

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (inputs: WatchEntryInput[]) => Promise<number>;
}

interface ParseState {
  days: ParsedWatchDay[];
  mappedColumns: string[];
  ignoredColumns: string[];
  skippedRows: number;
}

export default function WeeklyImportModal({ open, onClose, onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<ParseState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setFileName(null);
    setParsed(null);
    setSelected(new Set());
    setImporting(false);
    if (inputRef.current) inputRef.current.value = ""; // allow re-picking the same file
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const downloadTemplate = () => {
    const blob = new Blob([buildWatchCsvTemplate()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mindsetforest-watch-week.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const process = async (f: File) => {
    setFileName(f.name);
    if (!f.name.toLowerCase().endsWith(".csv")) {
      toast.warning("Please choose a .CSV file — download the template below for the right format.");
      setParsed(null);
      return;
    }
    try {
      const text = await f.text();
      const result = parseWatchCsv(text);
      if (result.error) {
        toast.warning(result.error);
        setParsed(null);
        return;
      }
      if (result.days.length === 0) {
        toast.warning("No dated rows found in that file.");
        setParsed(null);
        return;
      }
      setParsed(result);
      setSelected(new Set(result.days.map(d => d.input.entry_date)));
      toast.success(`Found ${result.days.length} day${result.days.length === 1 ? "" : "s"} to review ⌚`);
    } catch (e) {
      console.error("Weekly import parse error:", e);
      toast.error("Couldn't read that file.");
      setParsed(null);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) process(f);
  };

  const toggle = (date: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });

  const allSelected = !!parsed && selected.size === parsed.days.length;
  const toggleAll = () =>
    setParsed(p => {
      if (!p) return p;
      setSelected(allSelected ? new Set() : new Set(p.days.map(d => d.input.entry_date)));
      return p;
    });

  const handleImport = async () => {
    if (!parsed) return;
    const inputs = parsed.days.filter(d => selected.has(d.input.entry_date)).map(d => d.input);
    if (inputs.length === 0) {
      toast.warning("Select at least one day to import.");
      return;
    }
    setImporting(true);
    try {
      const n = await onImport(inputs);
      if (n > 0) handleClose();
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">⌚ Weekly Import</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Import a whole week (or more) at once from a single CSV — one row per day. Fill in the
            template, or drop a Garmin Connect date-range export; matching columns fill automatically.
            Re-importing a day updates it.
          </p>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
              <Download className="w-4 h-4" /> Download CSV template
            </Button>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={e => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
              dragOver ? "border-primary/60 bg-primary/5" : fileName ? "border-primary/30 bg-muted/20" : "border-border bg-muted/10 hover:border-primary/40"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) process(f);
              }}
            />
            {fileName ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <FileText className="w-4 h-4 text-primary" />
                <span className="font-semibold text-foreground truncate max-w-[260px]">{fileName}</span>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    reset();
                  }}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                <Upload className="w-5 h-5" />
                <div className="text-xs">
                  <span className="font-semibold text-foreground">Drop a multi-day CSV</span> or click to browse
                </div>
                <div className="text-[10px] opacity-70">One row per day · .CSV</div>
              </div>
            )}
          </div>

          {/* Review */}
          {parsed && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {parsed.mappedColumns.length} column{parsed.mappedColumns.length === 1 ? "" : "s"} recognized
                </span>
                {parsed.ignoredColumns.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground" title={parsed.ignoredColumns.join(", ")}>
                    <AlertCircle className="w-3.5 h-3.5" />
                    {parsed.ignoredColumns.length} ignored
                  </span>
                )}
                {parsed.skippedRows > 0 && (
                  <span className="text-muted-foreground">· {parsed.skippedRows} row(s) skipped (no valid date)</span>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border bg-muted/20">
                      <th className="p-2 w-8">
                        <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                      </th>
                      <th className="p-2 font-semibold">Date</th>
                      <th className="p-2 font-semibold">RHR</th>
                      <th className="p-2 font-semibold">Sleep</th>
                      <th className="p-2 font-semibold">Battery</th>
                      <th className="p-2 font-semibold">Pace</th>
                      <th className="p-2 font-semibold">Steps</th>
                      <th className="p-2 font-semibold">Fields</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.days.map(d => {
                      const e = d.input;
                      const on = selected.has(e.entry_date);
                      return (
                        <tr
                          key={e.entry_date}
                          className={`border-b border-border/50 cursor-pointer transition-colors ${on ? "hover:bg-muted/20" : "opacity-45 hover:opacity-70"}`}
                          onClick={() => toggle(e.entry_date)}
                        >
                          <td className="p-2" onClick={ev => ev.stopPropagation()}>
                            <Checkbox checked={on} onCheckedChange={() => toggle(e.entry_date)} aria-label={`Include ${e.entry_date}`} />
                          </td>
                          <td className="p-2 font-semibold text-foreground whitespace-nowrap">{e.entry_date}</td>
                          <td className="p-2 tabular-nums">{e.resting_hr ?? "—"}</td>
                          <td className="p-2 tabular-nums">{e.sleep_score ?? "—"}</td>
                          <td className="p-2 tabular-nums">{e.body_battery ?? "—"}</td>
                          <td className="p-2 tabular-nums">{fmtPace(e.run_pace_sec) ?? "—"}</td>
                          <td className="p-2 tabular-nums">{e.steps != null ? e.steps.toLocaleString() : "—"}</td>
                          <td className="p-2 tabular-nums text-muted-foreground">{d.filled}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1 sticky bottom-0 bg-background/80 backdrop-blur-sm pb-1">
            <Button variant="outline" className="flex-1" onClick={handleClose} disabled={importing}>
              Cancel
            </Button>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleImport}
              disabled={importing || !parsed || selected.size === 0}
              className="flex-1 py-2.5 rounded-md gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all disabled:opacity-50"
            >
              {importing ? "Importing…" : `Import ${selected.size || ""} day${selected.size === 1 ? "" : "s"}`.trim()}
            </motion.button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
