import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import HealthRatingSelector from "./HealthRatingSelector";
import LabExtractDropzone from "./LabExtractDropzone";
import type { HealthEntry, HealthEntryInput } from "@/lib/health-data";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: HealthEntryInput) => Promise<HealthEntry | null> | Promise<void>;
  initial?: HealthEntry | null;
  defaultHeight?: number | null;
  uploadFile: (file: File) => Promise<string | null>;
}

const NUM_FIELDS = [
  ["weight_kg", "Weight (kg)"], ["height_cm", "Height (cm)"],
  ["bp_systolic", "BP Systolic"], ["bp_diastolic", "BP Diastolic"], ["resting_hr", "Resting HR (bpm)"],
  ["fasting_glucose_mgdl", "Fasting Glucose (mg/dL)"], ["hba1c_pct", "HbA1c (%)"],
  ["ldl_mgdl", "LDL (mg/dL)"], ["hdl_mgdl", "HDL (mg/dL)"],
  ["total_chol_mgdl", "Total Chol (mg/dL)"], ["triglycerides_mgdl", "Triglycerides (mg/dL)"],
  ["hemoglobin_gdl", "Hemoglobin (g/dL)"], ["creatinine_mgdl", "Creatinine (mg/dL)"], ["egfr", "eGFR"],
] as const;

function emptyForm(defaultHeight?: number | null): HealthEntryInput {
  return {
    entry_date: new Date().toISOString().split("T")[0],
    self_rating: 7,
    weight_kg: null, height_cm: defaultHeight ?? null,
    bp_systolic: null, bp_diastolic: null, resting_hr: null,
    fasting_glucose_mgdl: null, hba1c_pct: null,
    ldl_mgdl: null, hdl_mgdl: null, total_chol_mgdl: null, triglycerides_mgdl: null,
    hemoglobin_gdl: null, creatinine_mgdl: null, egfr: null,
    notes: "", lab_report_url: null,
  };
}

export default function LogHealthCheckModal({ open, onClose, onSave, initial, defaultHeight, uploadFile }: Props) {
  const [form, setForm] = useState<HealthEntryInput>(() => emptyForm(defaultHeight));
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (initial) {
        const { id, user_id, created_at, updated_at, ...rest } = initial;
        setForm(rest);
      } else {
        setForm(emptyForm(defaultHeight));
      }
      setHighlighted(new Set());
      setPendingFile(null);
    }
  }, [open, initial, defaultHeight]);

  const setField = (k: keyof HealthEntryInput, v: number | string | null) => {
    setForm(prev => ({ ...prev, [k]: v as never }));
  };

  const handleNum = (k: keyof HealthEntryInput, raw: string) => {
    if (raw === "") return setField(k, null);
    const n = Number(raw);
    if (Number.isFinite(n)) setField(k, n);
  };

  const handleExtracted = (extracted: Record<string, number>) => {
    setForm(prev => ({ ...prev, ...extracted }));
    setHighlighted(new Set(Object.keys(extracted)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let labUrl = form.lab_report_url;
      if (pendingFile) {
        const path = await uploadFile(pendingFile);
        if (path) labUrl = path;
      }
      await onSave({ ...form, lab_report_url: labUrl });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">❤️ {initial ? "Edit Health Check" : "Log New Health Check"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 1. Date & Self-Rating */}
          <section className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">1 · Date & Rating</div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.entry_date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {form.entry_date ? format(new Date(form.entry_date + "T12:00:00"), "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={form.entry_date ? new Date(form.entry_date + "T12:00:00") : undefined}
                  onSelect={d => d && setField("entry_date", d.toISOString().split("T")[0])}
                  className={cn("p-3 pointer-events-auto")}
                  disabled={d => d > new Date()}
                />
              </PopoverContent>
            </Popover>
            <HealthRatingSelector value={form.self_rating} onChange={v => setField("self_rating", v)} />
            <p className="text-[11px] text-muted-foreground italic">Your honest overall feeling of physical & mental health today.</p>
          </section>

          {/* 2. Body Metrics */}
          <section className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">2 · Body Metrics</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {NUM_FIELDS.slice(0, 5).map(([k, label]) => (
                <div key={k}>
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type="number" step="0.1"
                    value={(form as any)[k] ?? ""}
                    onChange={e => handleNum(k as keyof HealthEntryInput, e.target.value)}
                    className={cn(highlighted.has(k) && "ring-2 ring-amber-500/60 bg-amber-500/5")}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* 3. Blood Biomarkers */}
          <section className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">3 · Blood Biomarkers</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {NUM_FIELDS.slice(5).map(([k, label]) => (
                <div key={k}>
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type="number" step="0.1"
                    value={(form as any)[k] ?? ""}
                    onChange={e => handleNum(k as keyof HealthEntryInput, e.target.value)}
                    className={cn(highlighted.has(k) && "ring-2 ring-amber-500/60 bg-amber-500/5")}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* 4. Upload & Notes */}
          <section className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">4 · Upload & Notes</div>
            <LabExtractDropzone onExtracted={handleExtracted} onFileSelected={setPendingFile} />
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={e => setField("notes", e.target.value)}
                placeholder="e.g. Felt rested, fasted 12h, training cycle 3"
                rows={3}
              />
            </div>
          </section>

          <div className="flex gap-2 pt-2 sticky bottom-0 bg-background/80 backdrop-blur-sm pb-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-md gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Entry"}
            </motion.button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}