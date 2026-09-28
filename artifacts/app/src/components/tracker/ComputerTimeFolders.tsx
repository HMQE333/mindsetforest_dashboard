import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Category } from "@/lib/dashboard-data";
import {
  proposeRule,
  type AppClass,
  type AppKeyTotal,
  type AppRule,
  type ProjectRef,
  type RuleProposal,
  type UsageAggregate,
  type UsageSession,
} from "@/lib/app-usage-classify";
import {
  CLASSIFICATION_SOURCE_LABELS,
  KIND_LABELS,
  UNASSIGNED_LABEL,
  classColor,
  formatHm,
  pct,
  useKindPalette,
} from "./computer-time-shared";

interface Props {
  agg: UsageAggregate;
  sessions: UsageSession[];
  classes: AppClass[];
  rules: AppRule[];
  projects: ProjectRef[];
  categories: Category[];
  labelKey: (appKey: string, classId: string, projectId?: string | null) => Promise<boolean>;
  createLearnedRule: (proposal: RuleProposal) => Promise<boolean>;
}

const NONE_VALUE = "__none__";

interface Group {
  id: string;
  name: string;
  kind: string | null;
  color: string;
  seconds: number;
  apps: AppKeyTotal[];
}

interface Banner {
  appKey: string;
  className: string;
  proposal: RuleProposal;
}

export default function ComputerTimeFolders({ agg, sessions, classes, rules, projects, categories, labelKey, createLearnedRule }: Props) {
  const palette = useKindPalette();
  const [open, setOpen] = useState<Record<string, boolean>>({ "": true });
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const groups = useMemo<Group[]>(() => {
    const byClass = new Map<string, AppKeyTotal[]>();
    for (const t of agg.topAppKeys) {
      const key = t.classId || "";
      const list = byClass.get(key);
      if (list) list.push(t);
      else byClass.set(key, [t]);
    }
    const out: Group[] = [];
    const unassigned = byClass.get("") || [];
    if (unassigned.length > 0) {
      out.push({ id: "", name: UNASSIGNED_LABEL, kind: null, color: palette.unassigned, seconds: agg.unclassifiedSeconds, apps: unassigned });
    }
    const rest = classes
      .map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        color: classColor(c, palette, categories),
        seconds: agg.byClass[c.id] || 0,
        apps: byClass.get(c.id) || [],
      }))
      .sort((a, b) => b.seconds - a.seconds);
    return [...out, ...rest];
  }, [agg, classes, categories, palette]);

  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const handleLabel = async (t: AppKeyTotal, classId: string) => {
    if (classId === NONE_VALUE) return;
    const cls = classById.get(classId);
    setBusy(t.appKey);
    // A class bound to a project labels the key with that project as well.
    const ok = await labelKey(t.appKey, classId, cls?.project_id ?? null);
    setBusy(null);
    if (!ok) return;
    const labels = rules
      .filter((r) => r.source === "label" && r.field === "app_key" && r.match_kind === "exact")
      .map((r) => {
        const s = sessions.find((x) => x.app_key === r.pattern);
        return { appKey: r.pattern, app: s ? s.app : r.pattern.split("|")[0].trim(), classId: r.class_id };
      });
    const titles = sessions.filter((s) => s.app_key === t.appKey).map((s) => s.window_title).filter(Boolean).slice(-50);
    const proposal = proposeRule(t.appKey, t.titles[0] || "", classId, {
      app: t.app,
      labels,
      projects,
      titles,
      // The label rule just written is an exact app_key rule, so the proposal is always broader than it.
      existingRules: [...rules, { field: "app_key", match_kind: "exact", pattern: t.appKey }],
    });
    setBanner(proposal && cls ? { appKey: t.appKey, className: cls.name, proposal } : null);
  };

  const acceptBanner = async () => {
    if (!banner) return;
    setBusy("banner");
    await createLearnedRule(banner.proposal);
    setBusy(null);
    setBanner(null);
  };

  if (agg.topAppKeys.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Brak sesji w tym zakresie.</p>;
  }

  return (
    <div className="space-y-3">
      {banner && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-xs flex flex-wrap items-center gap-3">
          <span className="text-foreground/90">
            Zawsze traktuj <strong>{banner.proposal.pattern}</strong> jako <strong>{banner.className}</strong>?{" "}
            <span className="text-muted-foreground">({banner.proposal.reason})</span>
          </span>
          <span className="ml-auto flex gap-2">
            <button
              onClick={acceptBanner}
              disabled={busy === "banner"}
              className="px-3 py-1 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50"
            >
              Tak
            </button>
            <button onClick={() => setBanner(null)} className="px-3 py-1 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground">
              Tylko ten
            </button>
          </span>
        </div>
      )}

      {groups.map((g) => {
        const isOpen = !!open[g.id];
        const isUnassigned = g.id === "";
        return (
          <div key={g.id || "unassigned"} className={`rounded-xl border ${isUnassigned ? "border-yellow-400/30 bg-yellow-400/5" : "border-border/40 bg-secondary/20"}`}>
            <button
              onClick={() => toggle(g.id)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/30 rounded-xl transition-colors"
            >
              {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />
              <span className="text-sm font-semibold text-foreground/90 truncate">{g.name}</span>
              {g.kind && <span className="text-[10px] text-muted-foreground uppercase tracking-wider hidden sm:inline">{KIND_LABELS[g.kind as keyof typeof KIND_LABELS] || g.kind}</span>}
              <span className="ml-auto text-xs font-mono text-stat-value shrink-0">{formatHm(g.seconds)}</span>
              <span className="text-[10px] font-mono text-muted-foreground w-9 text-right shrink-0">{pct(g.seconds, agg.totalSeconds)}</span>
              <span className="text-[10px] text-muted-foreground w-12 text-right shrink-0 hidden sm:inline">{g.apps.length} apl.</span>
            </button>

            {isOpen && (
              <div className="px-3 pb-3">
                {isUnassigned && (
                  <p className="text-[11px] text-yellow-300/90 mb-2">
                    {formatHm(g.seconds)} bez klasy. Przypisz klasę w wierszu poniżej: zapisze się reguła dla tego klucza i wskaźnik
                    skupienia zacznie coś znaczyć.
                  </p>
                )}
                {g.apps.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">Żadna aplikacja nie trafiła tu w tym zakresie.</p>
                ) : (
                  <div className="space-y-1">
                    {g.apps.map((t) => (
                      <div key={t.appKey} className="flex items-center gap-2 sm:gap-3 px-2 py-1.5 rounded-lg hover:bg-secondary/30 text-xs">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-foreground/90 truncate">{t.appKey}</div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {t.sessions} sesji{t.titles[0] ? `. ${t.titles[0]}` : ""}
                          </div>
                        </div>
                        <span className="font-mono text-muted-foreground w-12 text-right shrink-0">{formatHm(t.seconds)}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button className="p-1 rounded text-muted-foreground hover:text-foreground shrink-0" aria-label="Dlaczego">
                              <Info className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-xs text-xs">
                            <div className="font-semibold mb-0.5">
                              Źródło: {CLASSIFICATION_SOURCE_LABELS[t.source]}
                              {t.source !== "none" && ` (${Math.round(t.confidence * 100)}%)`}
                            </div>
                            <div className="text-muted-foreground">{t.why}</div>
                            {Object.keys(t.classSeconds).length > 1 && (
                              <div className="mt-1 text-muted-foreground">
                                Podział:{" "}
                                {Object.entries(t.classSeconds)
                                  .sort((a, b) => b[1] - a[1])
                                  .map(([id, s]) => `${id ? classById.get(id)?.name || "?" : UNASSIGNED_LABEL} ${formatHm(s)}`)
                                  .join(", ")}
                              </div>
                            )}
                          </TooltipContent>
                        </Tooltip>
                        <Select value={t.classId || NONE_VALUE} onValueChange={(v) => handleLabel(t, v)} disabled={busy === t.appKey}>
                          <SelectTrigger
                            className="h-7 w-32 sm:w-40 text-[11px] bg-secondary/40 border-border/50 shrink-0"
                            aria-label={`Klasa dla ${t.appKey}`}
                          >
                            <SelectValue placeholder="Klasa" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_VALUE} disabled>
                              {UNASSIGNED_LABEL}
                            </SelectItem>
                            {classes.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
