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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import GarminDropzone, { type RunFields } from "./GarminDropzone";
import {
  HRV_STATUS_OPTIONS,
  fmtPace,
  fmtDuration,
  parsePace,
  parseDuration,
  type WatchEntry,
  type WatchEntryInput,
} from "@/lib/watch-data";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: WatchEntryInput) => Promise<boolean>;
  initial?: WatchEntry | null;
}

function emptyForm(): WatchEntryInput {
  return {
    entry_date: new Date().toISOString().split("T")[0],
    source: "manual",
    resting_hr: null, hrv_ms: null, hrv_status: null,
    sleep_score: null, sleep_deep_min: null, sleep_rem_min: null, sleep_light_min: null, sleep_awake_min: null,
    body_battery: null, stress_level: null, recovery_time_hrs: null,
    vo2max: null, run_pace_sec: null, run_distance_km: null, run_kcal: null,
    run_cadence_spm: null, run_power_w: null, run_avg_hr: null,
    race_5k_sec: null, race_10k_sec: null, race_half_sec: null, race_marathon_sec: null, fitness_age: null,
    steps: null, intensity_minutes: null, notes: "",
  };
}

/** Text input for pace / race times, controlled by numeric seconds. */
function TimeInput({
  valueSec,
  onChange,
  kind,
  placeholder,
  highlighted,
}: {
  valueSec: number | null;
  onChange: (sec: number | null) => void;
  kind: "pace" | "duration";
  placeholder: string;
  highlighted?: boolean;
}) {
  const fmt = kind === "pace" ? fmtPace : fmtDuration;
  const parse = kind === "pace" ? parsePace : parseDuration;
  const [text, setText] = useState(fmt(valueSec) ?? "");

  // Sync when the numeric value changes from outside (e.g. File autofill).
  useEffect(() => {
    const parsed = parse(text);
    if (parsed !== valueSec) setText(fmt(valueSec) ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueSec]);

  return (
    <Input
      value={text}
      inputMode="numeric"
      placeholder={placeholder}
      onChange={e => {
        setText(e.target.value);
        onChange(parse(e.target.value));
      }}
      className={cn("tabular-nums", highlighted && "ring-2 ring-primary/60 bg-primary/5")}
    />
  );
}

export default function LogWatchModal({ open, onClose, onSave, initial }: Props) {
  const [form, setForm] = useState<WatchEntryInput>(() => emptyForm());
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (initial) {
        const { id, user_id, created_at, updated_at, ...rest } = initial;
        setForm(rest);
      } else {
        setForm(emptyForm());
      }
      setHighlighted(new Set());
    }
  }, [open, initial]);

  const setField = (k: keyof WatchEntryInput, v: number | string | null) =>
    setForm(prev => ({ ...prev, [k]: v as never }));

  const handleNum = (k: keyof WatchEntryInput, raw: string) => {
    if (raw === "") return setField(k, null);
    const n = Number(raw);
    if (Number.isFinite(n)) setField(k, n);
  };

  const handleParsed = (fields: RunFields) => {
    setForm(prev => ({ ...prev, ...fields, source: "file" }));
    setHighlighted(new Set(Object.keys(fields)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await onSave(form);
      if (ok) onClose(); // keep the modal (and the user's data) open on failure
    } finally {
      setSaving(false);
    }
  };

  const numField = (k: keyof WatchEntryInput, label: string, step = "1") => (
    <div key={k}>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step={step}
        value={(form as any)[k] ?? ""}
        onChange={e => handleNum(k, e.target.value)}
        className={cn(highlighted.has(k) && "ring-2 ring-primary/60 bg-primary/5")}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">⌚ {initial ? "Edit Watch Day" : "Log from Watch"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Date */}
          <section className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Date</div>
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
          </section>

          {/* A · Recovery & readiness */}
          <section className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              A · Recovery & readiness <span className="text-muted-foreground/60 normal-case font-normal">. The Morning Report</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {numField("resting_hr", "Resting HR (bpm)")}
              {numField("sleep_score", "Sleep Score /100")}
              {numField("body_battery", "Body Battery /100")}
              {numField("stress_level", "Stress /100")}
              {numField("hrv_ms", "HRV (ms)")}
              <div>
                <Label className="text-xs">HRV Status</Label>
                <Select value={form.hrv_status ?? ""} onValueChange={v => setField("hrv_status", v || null)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="." />
                  </SelectTrigger>
                  <SelectContent>
                    {HRV_STATUS_OPTIONS.map(s => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {numField("recovery_time_hrs", "Recovery Time (hrs)")}
            </div>
            <details className="group">
              <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground select-none">
                Sleep stages (optional)
              </summary>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                {numField("sleep_deep_min", "Deep (min)")}
                {numField("sleep_rem_min", "REM (min)")}
                {numField("sleep_light_min", "Light (min)")}
                {numField("sleep_awake_min", "Awake (min)")}
              </div>
            </details>
          </section>

          {/* B · Fitness & output */}
          <section className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">B · Fitness & output</div>
            <GarminDropzone onParsed={handleParsed} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {numField("vo2max", "VO₂ Max", "0.1")}
              {numField("fitness_age", "Fitness Age (yr)")}
            </div>

            <div className="text-[11px] font-semibold text-muted-foreground/80 pt-1">Last run</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Pace (/km)</Label>
                <TimeInput
                  kind="pace"
                  valueSec={form.run_pace_sec}
                  onChange={s => setField("run_pace_sec", s)}
                  placeholder="5:12"
                  highlighted={highlighted.has("run_pace_sec")}
                />
              </div>
              {numField("run_distance_km", "Distance (km)", "0.01")}
              {numField("run_avg_hr", "Avg HR (bpm)")}
              {numField("run_cadence_spm", "Cadence (spm)")}
              {numField("run_power_w", "Power (W)")}
              {numField("run_kcal", "Energy (kcal)")}
            </div>

            <div className="text-[11px] font-semibold text-muted-foreground/80 pt-1">Race predictor</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(
                [
                  ["race_5k_sec", "5K", "22:30"],
                  ["race_10k_sec", "10K", "47:00"],
                  ["race_half_sec", "Half", "1:45:00"],
                  ["race_marathon_sec", "Marathon", "3:45:00"],
                ] as const
              ).map(([k, label, ph]) => (
                <div key={k}>
                  <Label className="text-xs">{label}</Label>
                  <TimeInput
                    kind="duration"
                    valueSec={form[k]}
                    onChange={s => setField(k, s)}
                    placeholder={ph}
                    highlighted={highlighted.has(k)}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* C · Everyday movement */}
          <section className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">C · Everyday movement</div>
            <div className="grid grid-cols-2 gap-3">
              {numField("steps", "Steps (today)")}
              {numField("intensity_minutes", "Intensity min (this week)")}
            </div>
          </section>

          {/* Notes */}
          <section className="space-y-2">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={form.notes}
              onChange={e => setField("notes", e.target.value)}
              placeholder="e.g. Easy Z2 run, poor sleep, travel day"
              rows={2}
            />
          </section>

          <div className="flex gap-2 pt-2 sticky bottom-0 bg-background/80 backdrop-blur-sm pb-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-md gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Watch Day"}
            </motion.button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
