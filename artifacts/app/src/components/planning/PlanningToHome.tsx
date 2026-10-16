import { useEffect, useMemo, useState } from "react";
import { Home } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PillarIcon from "@/components/shared/PillarIcon";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useUserProjects } from "@/hooks/useUserProjects";
import type { PlanningTask } from "@/hooks/usePlanningState";
import { CATEGORIES, type Mission } from "@/lib/dashboard-data";
import { homeDescription, homeOutcome } from "@/lib/planning-list";

/**
 * "once" is a plain (non-persistent) Home mission. Home keeps those until a
 * Reset Day (a new day only unticks them), so the option says so rather than
 * promising "today only".
 */
type Repeat = "once" | "daily" | "days";

// Monday first, as a week is read; values are Date.getDay() (0 = Sunday).
const WEEKDAYS: { day: number; label: string }[] = [
  { day: 1, label: "Mon" }, { day: 2, label: "Tue" }, { day: 3, label: "Wed" }, { day: 4, label: "Thu" },
  { day: 5, label: "Fri" }, { day: 6, label: "Sat" }, { day: 0, label: "Sun" },
];

interface Props {
  /** The Step going to Home. */
  node: PlanningTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The parent's title, for the mission's "From Planning: board › parent" line. */
  parentTitle?: string | null;
  /** The board's name, when the caller has it; otherwise it is read once. */
  boardName?: string | null;
  /** Closes the node once the mission is on Home: setNodeState(id, "done", { outcome }). */
  onAdded: (outcome: string) => Promise<unknown> | unknown;
}

/**
 * Planning's one exit to doing: the Step becomes a Home mission (the same
 * addMission the assistant and the friends picker use) and the node closes with
 * "→ Home: <category>". One-way: nothing syncs back, so the work is never open
 * in two places. Planning pays no XP itself; the mission does, on Home.
 */
export default function PlanningToHome({ node, open, onOpenChange, parentTitle, boardName, onAdded }: Props) {
  const { state, loading, loadFailed, addMission } = useDashboardState();
  const { getCategories, preferences } = useUserSettings();
  const { projects, projectKey } = useUserProjects();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [repeat, setRepeat] = useState<Repeat>("once");
  const [days, setDays] = useState<number[]>([]);
  const [board, setBoard] = useState<string | null>(boardName ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !node) return;
    setTitle(node.title);
    setRepeat("once");
    setDays([]);
    setBusy(false);
  }, [open, node]);

  // The board's name for the description, read once per board when not handed in.
  useEffect(() => {
    if (boardName !== undefined) { setBoard(boardName); return; }
    if (!open || !node?.board_id) return;
    let live = true;
    supabase.from("planning_boards").select("name, emoji").eq("id", node.board_id).maybeSingle()
      .then(({ data }) => { if (live && data) setBoard(`${data.emoji ? `${data.emoji} ` : ""}${data.name}`.trim()); });
    return () => { live = false; };
  }, [open, node?.board_id, boardName]);

  const enabled = preferences.enabledModules || [];
  const showProjects = enabled.length === 0 || enabled.includes("projects");
  // The categories Home shows, then the projects (as the friends suggestion picker offers them).
  const targets = [
    ...getCategories().map((c) => ({ id: c.id, name: c.name, icon: c.icon, iconUrl: c.iconUrl })),
    ...(showProjects ? projects.map((p) => ({ id: projectKey(p.id), name: p.name, icon: p.emoji || "📁", iconUrl: undefined })) : []),
  ];
  const target = targets.find((t) => t.id === categoryId) ?? null;

  // addMission silently skips a title the category already has, so say it here instead.
  const duplicate = useMemo(() => {
    if (!categoryId) return false;
    const current = state.customMissions[categoryId] || CATEGORIES.find((c) => c.id === categoryId)?.missions || [];
    const t = title.trim().toLowerCase();
    return !!t && current.some((m) => (m.title || "").trim().toLowerCase() === t);
  }, [categoryId, title, state.customMissions]);

  const homeNotReady = loading || loadFailed;
  const canAdd = !!node && !!target && !!title.trim() && !duplicate && !homeNotReady && !busy &&
    (repeat !== "days" || days.length > 0);

  const toggleDay = (d: number) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const add = async () => {
    if (!canAdd || !node || !target) return;
    setBusy(true);
    const everyDay = repeat === "daily" || (repeat === "days" && days.length === 7);
    const mission: Mission = {
      title: title.trim(),
      description: homeDescription(board, parentTitle),
      duration: "",
      xp: 20,
      ...(repeat !== "once" ? { persistent: true } : {}),
      ...(repeat === "days" && !everyDay ? { daysOfWeek: [...days].sort((a, b) => a - b) } : {}),
    };
    addMission(target.id, mission);
    await onAdded(homeOutcome(target.name));
    toast({ title: `Added to ${target.name}`, description: repeat === "once" ? "On Home until you reset the day." : "On Home until you remove it." });
    setBusy(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="glass-card border-white/10 max-w-md w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Home className="h-4 w-4 text-primary" /> Add to Home
          </DialogTitle>
          <DialogDescription className="text-xs">
            It becomes a Home mission and closes here. Nothing syncs back.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Category</p>
            <div className="grid grid-cols-4 gap-1.5">
              {targets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCategoryId(t.id)}
                  title={t.name}
                  className={`flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg border transition-all ${
                    categoryId === t.id
                      ? "border-primary/60 bg-primary/15"
                      : "bg-background/40 border-white/5 hover:border-primary/40 hover:bg-primary/10"
                  }`}
                >
                  <PillarIcon icon={t.icon} iconUrl={t.iconUrl} size={22} className="leading-none" />
                  <span className="text-[9px] font-semibold text-foreground/80 truncate w-full text-center">{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Mission</p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) add(); }}
              className="w-full h-9 text-sm bg-muted/30 border border-white/10 rounded-lg px-3 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
            />
            {duplicate && target && (
              <p className="text-[11px] text-amber-300 mt-1">{target.name} already has a mission with this title.</p>
            )}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Repeat</p>
            <div className="flex gap-1 p-1 rounded-xl bg-muted/40 border border-white/5">
              {([["once", "Until Reset Day"], ["daily", "Every day"], ["days", "Some days"]] as [Repeat, string][]).map(([r, label]) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRepeat(r)}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    repeat === r ? "gradient-purple text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {repeat === "days" && (
              <div className="flex flex-wrap gap-1 mt-2">
                {WEEKDAYS.map(({ day, label }) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                      days.includes(day)
                        ? "border-primary/60 bg-primary/15 text-foreground"
                        : "border-white/10 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {homeNotReady && (
            <p className="text-[11px] text-amber-300">Home has not loaded yet, so the mission could not be saved. Try again in a moment.</p>
          )}
        </div>

        <DialogFooter className="flex-row justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={add}
            disabled={!canAdd}
            className="px-3 py-1.5 rounded-lg text-xs font-bold gradient-purple text-primary-foreground disabled:opacity-50 transition-all"
          >
            {target ? `Add to ${target.name}` : "Pick a category"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
