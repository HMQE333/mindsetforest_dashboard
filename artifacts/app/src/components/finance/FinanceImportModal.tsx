import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Upload, CheckSquare, Square as SquareIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFinanceCategories } from "@/hooks/useFinanceCategories";
import { toast } from "sonner";

interface ImportRow {
  date: string;
  title: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  selected: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (rows: Array<{ date: string; title: string; amount: number; type: "income" | "expense"; category: string }>) => Promise<number>;
}

export default function FinanceImportModal({ open, onClose, onImport }: Props) {
  const { expenseCategories, incomeCategories } = useFinanceCategories();
  const [text, setText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState("");

  const expenseNames = useMemo(() => expenseCategories.map(c => c.name), [expenseCategories]);
  const incomeNames = useMemo(() => incomeCategories.map(c => c.name), [incomeCategories]);

  const selectedCount = rows.filter(r => r.selected).length;
  const incomeTotal = rows.filter(r => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const expenseTotal = rows.filter(r => r.type === "expense").reduce((s, r) => s + r.amount, 0);

  const extract = async () => {
    if (!text.trim()) { setError("Wklej wyciąg bankowy najpierw."); return; }
    setExtracting(true);
    setError("");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("ai-finance-import", {
        body: { text, expenseCategories: expenseNames, incomeCategories: incomeNames },
      });
      if (fnError) throw new Error(fnError.message || "Extraction failed");
      const txs: any[] = data?.transactions || [];
      if (txs.length === 0) { setError("Nie znaleziono transakcji. Sprawdź, czy wklejony tekst to wyciąg."); return; }
      setRows(txs.map((t: any) => ({ ...t, selected: true })));
      toast.success(`Wyodrębniono ${txs.length} transakcji`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const toggleAll = () => {
    const allSelected = selectedCount === rows.length;
    setRows(prev => prev.map(r => ({ ...r, selected: !allSelected })));
  };

  const setRowCategory = (idx: number, category: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, category } : r));
  };

  const toggleRow = (idx: number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  };

  const importSelected = async () => {
    if (selectedCount === 0) return;
    setImporting(true);
    try {
      const toImport = rows
        .filter(r => r.selected)
        .map(({ date, title, amount, type, category }) => ({
          date, title, amount, type, category,
          is_recurring: false, recurring_day: null, person_name: "", is_settled: false, notes: "",
        }));
      const count = await onImport(toImport as any);
      if (count > 0) {
        toast.success(`Zaimportowano ${count} transakcji`);
        setRows([]);
        setText("");
        onClose();
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-2xl glass-card rounded-2xl border border-border p-5 space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-foreground">Import wyciągu bankowego</h3>
                <p className="text-xs text-muted-foreground">Wklej tekst/CSV wyciągu. AI wyodrębni transakcje.</p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>

            {/* Step 1: paste */}
            {rows.length === 0 && (
              <>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder={"Wklej wyciąg z banku, np.:\n\n2025-08-01 Biedronka -45.20\n2025-08-02 Wynagrodzenie +8500.00\n2025-08-03 Spotify -24.99\n..."}
                  rows={8}
                  className="w-full px-3 py-2.5 rounded-xl bg-muted/30 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none font-mono text-xs"
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <button
                  onClick={extract}
                  disabled={extracting || !text.trim()}
                  className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {extracting ? "Wyodrębnianie…" : "Wyodrębnij transakcje (AI)"}
                </button>
              </>
            )}

            {/* Step 2: review */}
            {rows.length > 0 && (
              <>
                {/* Summary */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{rows.length} transakcji</span>
                  <span>
                    <span className="text-emerald-400 font-semibold">+{incomeTotal.toLocaleString()}</span>
                    {" · "}
                    <span className="text-red-400 font-semibold">-{expenseTotal.toLocaleString()}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button onClick={toggleAll} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/40 border border-border hover:border-primary/40">
                    {selectedCount === rows.length ? <CheckSquare className="w-3.5 h-3.5" /> : <SquareIcon className="w-3.5 h-3.5" />}
                    {selectedCount === rows.length ? "Odznacz wszystkie" : "Zaznacz wszystkie"}
                  </button>
                  <span className="text-muted-foreground">{selectedCount} zaznaczonych</span>
                </div>

                {/* Rows */}
                <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-1">
                  {rows.map((r, i) => {
                    const cats = r.type === "income" ? incomeCategories : expenseCategories;
                    return (
                      <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border ${r.selected ? "border-border" : "border-border/40 opacity-50"}`}>
                        <button onClick={() => toggleRow(i)} className="shrink-0 text-muted-foreground hover:text-foreground">
                          {r.selected ? <CheckSquare className="w-4 h-4" /> : <SquareIcon className="w-4 h-4" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-foreground truncate">{r.title}</div>
                          <div className="text-[10px] text-muted-foreground">{r.date}</div>
                        </div>
                        <span className={`text-sm font-bold shrink-0 ${r.type === "income" ? "text-emerald-400" : "text-red-400"}`}>
                          {r.type === "income" ? "+" : "-"}{r.amount.toLocaleString()}
                        </span>
                        <select
                          value={r.category}
                          onChange={e => setRowCategory(i, e.target.value)}
                          className="shrink-0 px-1.5 py-1 rounded-md bg-muted/40 border border-border text-xs text-foreground focus:outline-none"
                        >
                          {cats.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setRows([]); setText(""); setError(""); }}
                    className="px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Wróć
                  </button>
                  <button
                    onClick={importSelected}
                    disabled={selectedCount === 0 || importing}
                    className="flex-1 py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    {importing ? "Importowanie…" : `Importuj ${selectedCount} transakcji`}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
