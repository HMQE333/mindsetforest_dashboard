import { useMemo, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Category } from "@/lib/dashboard-data";
import type { ClassInput, RuleInput } from "@/hooks/useAppUsage";
import {
  APP_KINDS,
  PRIORITY_MANUAL,
  regexPatternProblem,
  ruleHealth,
  testRule,
  type AppClass,
  type AppKind,
  type AppRule,
  type Classification,
  type ProjectRef,
  type RuleField,
  type RuleMatchKind,
  type UsageSession,
} from "@/lib/app-usage-classify";
import { KIND_LABELS, SOURCE_LABELS, classColor, formatHm, useKindPalette } from "./computer-time-shared";

interface Props {
  classes: AppClass[];
  rules: AppRule[];
  suggestions: AppRule[];
  projects: ProjectRef[];
  categories: Category[];
  sessions: UsageSession[];
  classifications: Classification[];
  createClass: (input: ClassInput) => Promise<AppClass | null>;
  updateClass: (id: string, patch: Partial<ClassInput>) => Promise<boolean>;
  deleteClass: (id: string) => Promise<boolean>;
  createRule: (input: RuleInput) => Promise<AppRule | null>;
  updateRule: (id: string, patch: Partial<RuleInput>) => Promise<boolean>;
  deleteRule: (id: string) => Promise<boolean>;
  acceptSuggestion: (id: string) => Promise<boolean>;
  rejectSuggestion: (id: string) => Promise<boolean>;
}

const NONE = "__none__";
const FIELD_LABELS: Record<RuleField, string> = { app: "aplikacja", app_key: "klucz", title: "tytuł" };
const MATCH_LABELS: Record<RuleMatchKind, string> = { exact: "dokładnie", substring: "zawiera", domain: "domena", regex: "regex" };
const inputCls = "bg-secondary/40 border border-border/50 rounded-lg px-2 py-1 text-xs text-foreground w-full";
const selectCls = "h-7 text-[11px] bg-secondary/40 border-border/50";

// ---------------------------------------------------------------------------
// Class form
// ---------------------------------------------------------------------------

interface ClassDraft {
  name: string;
  kind: AppKind;
  pillar_id: string;
  project_id: string;
  keywords: string;
  color: string;
  count_idle: boolean;
}

const emptyClassDraft = (): ClassDraft => ({ name: "", kind: "work", pillar_id: NONE, project_id: NONE, keywords: "", color: "", count_idle: false });

function draftFromClass(c: AppClass): ClassDraft {
  return {
    name: c.name,
    kind: c.kind,
    pillar_id: c.pillar_id || NONE,
    project_id: c.project_id || NONE,
    keywords: c.keywords.join(", "),
    color: c.color || "",
    count_idle: c.count_idle,
  };
}

function draftToInput(d: ClassDraft): ClassInput {
  return {
    name: d.name.trim(),
    kind: d.kind,
    pillar_id: d.pillar_id === NONE ? null : d.pillar_id,
    project_id: d.project_id === NONE ? null : d.project_id,
    keywords: d.keywords.split(",").map((k) => k.trim()).filter(Boolean),
    color: d.color || null,
    count_idle: d.count_idle,
  };
}

function ClassForm({
  initial,
  categories,
  projects,
  onSave,
  onCancel,
}: {
  initial: ClassDraft;
  categories: Category[];
  projects: ProjectRef[];
  onSave: (input: ClassInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [d, setD] = useState<ClassDraft>(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ClassDraft>(k: K, v: ClassDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  return (
    <div className="rounded-xl border border-primary/30 bg-secondary/30 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
      <label className="space-y-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Nazwa</span>
        <input className={inputCls} value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="np. Praca nad projektem" />
      </label>
      <label className="space-y-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Rodzaj</span>
        <Select value={d.kind} onValueChange={(v) => set("kind", v as AppKind)}>
          <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
          <SelectContent>
            {APP_KINDS.map((k) => (
              <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="space-y-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Filar</span>
        <Select value={d.pillar_id} onValueChange={(v) => set("pillar_id", v)}>
          <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>brak</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="space-y-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Projekt</span>
        <Select value={d.project_id} onValueChange={(v) => set("project_id", v)}>
          <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>brak</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="space-y-1 sm:col-span-2 lg:col-span-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Słowa kluczowe (po przecinku)</span>
        <input className={inputCls} value={d.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="Code, GitHub" />
      </label>
      <div className="flex items-end gap-3">
        <label className="space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Kolor</span>
          <span className="flex items-center gap-1">
            <input type="color" value={d.color || "#888888"} onChange={(e) => set("color", e.target.value)} className="h-7 w-9 bg-transparent border border-border/50 rounded" />
            {d.color && (
              <button onClick={() => set("color", "")} className="text-[10px] text-muted-foreground hover:text-foreground">wyczyść</button>
            )}
          </span>
        </label>
        <label className="flex items-center gap-2 pb-1">
          <Switch checked={d.count_idle} onCheckedChange={(v) => set("count_idle", v)} />
          <span className="text-[11px] text-muted-foreground">licz bezczynność</span>
        </label>
      </div>
      <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground">Anuluj</button>
        <button
          disabled={!d.name.trim() || saving}
          onClick={async () => {
            setSaving(true);
            await onSave(draftToInput(d));
            setSaving(false);
          }}
          className="px-3 py-1 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50"
        >
          Zapisz
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rule form
// ---------------------------------------------------------------------------

interface RuleDraft {
  field: RuleField;
  match_kind: RuleMatchKind;
  pattern: string;
  class_id: string;
  project_id: string;
  priority: string;
  enabled: boolean;
}

const emptyRuleDraft = (classId: string): RuleDraft => ({
  field: "app_key",
  match_kind: "exact",
  pattern: "",
  class_id: classId,
  project_id: NONE,
  priority: String(PRIORITY_MANUAL),
  enabled: true,
});

function draftFromRule(r: AppRule): RuleDraft {
  return { field: r.field, match_kind: r.match_kind, pattern: r.pattern, class_id: r.class_id, project_id: r.project_id || NONE, priority: String(r.priority), enabled: r.enabled };
}

function ruleDraftToInput(d: RuleDraft): RuleInput {
  return {
    field: d.field,
    match_kind: d.match_kind,
    pattern: d.pattern.trim(),
    class_id: d.class_id,
    project_id: d.project_id === NONE ? null : d.project_id,
    priority: Number.parseInt(d.priority, 10) || 0,
    enabled: d.enabled,
  };
}

function RuleForm({
  initial,
  classes,
  projects,
  sessions,
  onSave,
  onCancel,
}: {
  initial: RuleDraft;
  classes: AppClass[];
  projects: ProjectRef[];
  sessions: UsageSession[];
  onSave: (input: RuleInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [d, setD] = useState<RuleDraft>(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof RuleDraft>(k: K, v: RuleDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const preview = useMemo(() => summariseMatches(d, sessions), [d, sessions]);
  // A dangerous or broken regex is refused here, before it can reach the matcher.
  const problem = d.match_kind === "regex" ? regexPatternProblem(d.pattern) : null;
  return (
    <div className="rounded-xl border border-primary/30 bg-secondary/30 p-3 text-xs space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <label className="space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Pole</span>
          <Select value={d.field} onValueChange={(v) => set("field", v as RuleField)}>
            <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(FIELD_LABELS) as RuleField[]).map((f) => (
                <SelectItem key={f} value={f}>{FIELD_LABELS[f]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Dopasowanie</span>
          <Select value={d.match_kind} onValueChange={(v) => set("match_kind", v as RuleMatchKind)}>
            <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(MATCH_LABELS) as RuleMatchKind[]).map((m) => (
                <SelectItem key={m} value={m}>{MATCH_LABELS[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 col-span-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Wzorzec</span>
          <input className={inputCls} value={d.pattern} onChange={(e) => set("pattern", e.target.value)} placeholder="Browser | YouTube" />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Klasa</span>
          <Select value={d.class_id} onValueChange={(v) => set("class_id", v)}>
            <SelectTrigger className={selectCls}><SelectValue placeholder="Klasa" /></SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Projekt</span>
          <Select value={d.project_id} onValueChange={(v) => set("project_id", v)}>
            <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>brak</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Priorytet</span>
          <input type="number" className={`${inputCls} w-16`} value={d.priority} onChange={(e) => set("priority", e.target.value)} />
        </label>
        <label className="flex items-center gap-2">
          <Switch checked={d.enabled} onCheckedChange={(v) => set("enabled", v)} />
          <span className="text-[11px] text-muted-foreground">włączona</span>
        </label>
        <span className={`text-[11px] ${problem ? "text-destructive" : "text-muted-foreground"}`} role={problem ? "alert" : undefined}>
          {problem ?? preview.summary}
        </span>
        <span className="ml-auto flex gap-2">
          <button onClick={onCancel} className="px-3 py-1 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground">Anuluj</button>
          <button
            disabled={!d.pattern.trim() || !d.class_id || saving || problem !== null}
            onClick={async () => {
              setSaving(true);
              await onSave(ruleDraftToInput(d));
              setSaving(false);
            }}
            className="px-3 py-1 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50"
          >
            Zapisz
          </button>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pattern tester
// ---------------------------------------------------------------------------

interface MatchSummary {
  summary: string;
  keys: { appKey: string; seconds: number; titles: string[] }[];
  invalid: boolean;
}

function summariseMatches(d: Pick<RuleDraft, "field" | "match_kind" | "pattern">, sessions: UsageSession[]): MatchSummary {
  if (!d.pattern.trim()) return { summary: "Wpisz wzorzec, aby zobaczyć trafienia.", keys: [], invalid: false };
  const problem = d.match_kind === "regex" ? regexPatternProblem(d.pattern) : null;
  if (problem) return { summary: problem, keys: [], invalid: true };
  const hits = testRule({ field: d.field, match_kind: d.match_kind, pattern: d.pattern }, sessions);
  const byKey = new Map<string, { seconds: number; titles: Map<string, number> }>();
  let total = 0;
  for (const s of hits) {
    total += s.seconds;
    let e = byKey.get(s.app_key);
    if (!e) {
      e = { seconds: 0, titles: new Map() };
      byKey.set(s.app_key, e);
    }
    e.seconds += s.seconds;
    if (s.window_title) e.titles.set(s.window_title, (e.titles.get(s.window_title) || 0) + s.seconds);
  }
  const keys = [...byKey.entries()]
    .map(([appKey, e]) => ({
      appKey,
      seconds: e.seconds,
      titles: [...e.titles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t),
    }))
    .sort((a, b) => b.seconds - a.seconds);
  return {
    summary: hits.length === 0 ? "Brak trafień w załadowanym zakresie." : `${hits.length} sesji, ${keys.length} kluczy, ${formatHm(total)}`,
    keys,
    invalid: false,
  };
}

function PatternTester({ sessions }: { sessions: UsageSession[] }) {
  const [field, setField] = useState<RuleField>("app_key");
  const [matchKind, setMatchKind] = useState<RuleMatchKind>("substring");
  const [pattern, setPattern] = useState("");
  const result = useMemo(() => summariseMatches({ field, match_kind: matchKind, pattern }, sessions), [field, matchKind, pattern, sessions]);
  return (
    <div className="rounded-xl border border-border/40 bg-secondary/20 p-3 text-xs space-y-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Testuj wzorzec</div>
      <div className="flex flex-wrap gap-2">
        <Select value={field} onValueChange={(v) => setField(v as RuleField)}>
          <SelectTrigger className={`${selectCls} w-28`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(FIELD_LABELS) as RuleField[]).map((f) => (
              <SelectItem key={f} value={f}>{FIELD_LABELS[f]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={matchKind} onValueChange={(v) => setMatchKind(v as RuleMatchKind)}>
          <SelectTrigger className={`${selectCls} w-28`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(MATCH_LABELS) as RuleMatchKind[]).map((m) => (
              <SelectItem key={m} value={m}>{MATCH_LABELS[m]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input className={`${inputCls} flex-1 min-w-[10rem]`} value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="np. youtube" />
      </div>
      <div className={result.invalid ? "text-destructive" : "text-muted-foreground"}>{result.summary}</div>
      {result.keys.length > 0 && (
        <ul className="space-y-1 max-h-48 overflow-y-auto">
          {result.keys.slice(0, 20).map((k) => (
            <li key={k.appKey} className="flex items-start gap-2">
              <span className="font-mono text-muted-foreground w-12 text-right shrink-0">{formatHm(k.seconds)}</span>
              <span className="min-w-0">
                <span className="font-semibold text-foreground/90">{k.appKey}</span>
                {k.titles.length > 0 && <span className="block text-[10px] text-muted-foreground truncate">{k.titles.join(" | ")}</span>}
              </span>
            </li>
          ))}
          {result.keys.length > 20 && <li className="text-[10px] text-muted-foreground">… i {result.keys.length - 20} więcej</li>}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function ComputerTimeApps(props: Props) {
  const { classes, rules, suggestions, projects, categories, sessions, classifications } = props;
  const palette = useKindPalette();
  const [classEditor, setClassEditor] = useState<{ id: string | null; draft: ClassDraft } | null>(null);
  const [ruleEditor, setRuleEditor] = useState<{ id: string | null; draft: RuleDraft } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  /** Invalid or slow patterns, so a rule can be fixed or deleted here even if it never classifies. */
  const health = useMemo(() => ruleHealth(rules), [rules]);

  /** Matches in the loaded range per rule, from the classification results. */
  const localHits = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of classifications) if (c.ruleId) m.set(c.ruleId, (m.get(c.ruleId) || 0) + 1);
    return m;
  }, [classifications]);

  const activeRules = useMemo(
    () => rules.filter((r) => r.source !== "suggested").sort((a, b) => b.priority - a.priority || a.created_at.localeCompare(b.created_at)),
    [rules],
  );

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Propozycje do zatwierdzenia</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => {
              const cls = classById.get(s.class_id);
              return (
                <span key={s.id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-secondary/40 border border-border/40 text-xs">
                  <span className="text-muted-foreground">{FIELD_LABELS[s.field]} {MATCH_LABELS[s.match_kind]}</span>
                  <span className="font-semibold text-foreground/90 truncate max-w-[10rem]">{s.pattern}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-semibold" style={{ color: cls ? classColor(cls, palette, categories) : undefined }}>{cls?.name || "?"}</span>
                  {s.confidence < 1 && <span className="text-[10px] text-muted-foreground">{Math.round(s.confidence * 100)}%</span>}
                  <button onClick={() => run(s.id, () => props.acceptSuggestion(s.id))} disabled={busy === s.id} className="p-1 rounded text-green-400 hover:bg-green-400/10" title="Zatwierdź">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => run(s.id, () => props.rejectSuggestion(s.id))} disabled={busy === s.id} className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Odrzuć">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Classes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Klasy ({classes.length})</div>
          <button
            onClick={() => setClassEditor({ id: null, draft: emptyClassDraft() })}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            <Plus className="w-3 h-3" /> Nowa klasa
          </button>
        </div>
        {classEditor && classEditor.id === null && (
          <div className="mb-2">
            <ClassForm
              initial={classEditor.draft}
              categories={categories}
              projects={projects}
              onCancel={() => setClassEditor(null)}
              onSave={async (input) => {
                await props.createClass(input);
                setClassEditor(null);
              }}
            />
          </div>
        )}
        <div className="space-y-1">
          {classes.map((c) => {
            const color = classColor(c, palette, categories);
            const pillar = c.pillar_id ? categories.find((x) => x.id === c.pillar_id) : undefined;
            const project = c.project_id ? projectById.get(c.project_id) : undefined;
            if (classEditor && classEditor.id === c.id) {
              return (
                <ClassForm
                  key={c.id}
                  initial={classEditor.draft}
                  categories={categories}
                  projects={projects}
                  onCancel={() => setClassEditor(null)}
                  onSave={async (input) => {
                    await props.updateClass(c.id, input);
                    setClassEditor(null);
                  }}
                />
              );
            }
            return (
              <div key={c.id} className="flex items-center gap-2 sm:gap-3 px-2 py-1.5 rounded-lg hover:bg-secondary/30 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="font-semibold text-foreground/90 w-36 sm:w-44 truncate shrink-0">{c.name}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider w-24 shrink-0 hidden sm:inline">{KIND_LABELS[c.kind]}</span>
                <span className="flex-1 min-w-0 truncate text-muted-foreground">
                  {pillar && <span className="mr-2">{pillar.icon} {pillar.name}</span>}
                  {project && <span className="mr-2">📁 {project.name}</span>}
                  {c.keywords.length > 0 && <span className="text-[10px]">{c.keywords.join(", ")}</span>}
                </span>
                {c.count_idle && <span className="text-[10px] text-muted-foreground hidden md:inline">licz bezczynność</span>}
                {c.is_default && <span className="text-[10px] text-muted-foreground hidden md:inline">domyślna</span>}
                <button onClick={() => setClassEditor({ id: c.id, draft: draftFromClass(c) })} className="p-1 rounded text-muted-foreground hover:text-foreground" title="Edytuj">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {confirmDelete === `class:${c.id}` ? (
                  <button
                    onClick={() => run(c.id, async () => { await props.deleteClass(c.id); setConfirmDelete(null); })}
                    className="text-[10px] font-semibold text-destructive px-1.5"
                  >
                    Na pewno? (usunie też reguły)
                  </button>
                ) : (
                  <button onClick={() => setConfirmDelete(`class:${c.id}`)} className="p-1 rounded text-muted-foreground hover:text-destructive" title="Usuń">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Rules */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Reguły ({activeRules.length})</div>
          <button
            onClick={() => setRuleEditor({ id: null, draft: emptyRuleDraft(classes[0]?.id || "") })}
            disabled={classes.length === 0}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline disabled:opacity-50"
          >
            <Plus className="w-3 h-3" /> Nowa reguła
          </button>
        </div>
        {ruleEditor && ruleEditor.id === null && (
          <div className="mb-2">
            <RuleForm
              initial={ruleEditor.draft}
              classes={classes}
              projects={projects}
              sessions={sessions}
              onCancel={() => setRuleEditor(null)}
              onSave={async (input) => {
                const created = await props.createRule(input);
                if (created) setRuleEditor(null);
              }}
            />
          </div>
        )}
        {activeRules.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">Brak reguł. Przypisz klasę w zakładce Foldery albo dodaj regułę ręcznie.</p>
        ) : (
          <div className="space-y-1">
            {activeRules.map((r) => {
              const cls = classById.get(r.class_id);
              const project = r.project_id ? projectById.get(r.project_id) : undefined;
              const h = health.get(r.id);
              const broken = !!h && h.status !== "ok";
              if (ruleEditor && ruleEditor.id === r.id) {
                return (
                  <RuleForm
                    key={r.id}
                    initial={ruleEditor.draft}
                    classes={classes}
                    projects={projects}
                    sessions={sessions}
                    onCancel={() => setRuleEditor(null)}
                    onSave={async (input) => {
                      const ok = await props.updateRule(r.id, input);
                      if (ok) setRuleEditor(null);
                    }}
                  />
                );
              }
              return (
                <div key={r.id} className={`flex items-center gap-2 sm:gap-3 px-2 py-1.5 rounded-lg hover:bg-secondary/30 text-xs ${r.enabled ? "" : "opacity-50"}`}>
                  <Switch checked={r.enabled} onCheckedChange={(v) => run(r.id, () => props.updateRule(r.id, { enabled: v }))} disabled={busy === r.id} className="scale-75 origin-left" />
                  <span className="text-[10px] text-muted-foreground w-24 shrink-0 hidden sm:inline">
                    {FIELD_LABELS[r.field]} · {MATCH_LABELS[r.match_kind]}
                  </span>
                  <span className={`font-mono font-semibold truncate min-w-0 flex-1 ${broken ? "text-destructive" : "text-foreground/90"}`} title={broken && h ? h.reason ?? r.pattern : r.pattern}>
                    {r.pattern}
                  </span>
                  {broken && h && (
                    <span
                      className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                        h.status === "slow" ? "bg-amber-400/15 text-amber-300" : "bg-destructive/15 text-destructive"
                      }`}
                      title={h.reason ?? ""}
                    >
                      {h.status === "slow" ? "wolna" : "błąd"}
                    </span>
                  )}
                  <span className="text-muted-foreground shrink-0">→</span>
                  <span className="font-semibold truncate w-24 sm:w-32 shrink-0" style={{ color: cls ? classColor(cls, palette, categories) : undefined }}>
                    {cls?.name || "?"}
                    {project && <span className="text-[10px] text-muted-foreground font-normal"> · {project.name}</span>}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground w-8 text-right shrink-0 hidden sm:inline" title="Priorytet">p{r.priority}</span>
                  <span
                    className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                      r.source === "learned" ? "bg-green-400/10 text-green-400" : r.source === "label" ? "bg-primary/10 text-primary" : "bg-secondary/60 text-muted-foreground"
                    }`}
                  >
                    {SOURCE_LABELS[r.source]}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground w-14 text-right shrink-0" title="Trafienia w załadowanym zakresie / zapisane w bazie">
                    {localHits.get(r.id) || 0} / {r.hits}
                  </span>
                  <button onClick={() => setRuleEditor({ id: r.id, draft: draftFromRule(r) })} className="p-1 rounded text-muted-foreground hover:text-foreground" title="Edytuj">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {confirmDelete === `rule:${r.id}` ? (
                    <button onClick={() => run(r.id, async () => { await props.deleteRule(r.id); setConfirmDelete(null); })} className="text-[10px] font-semibold text-destructive px-1.5">
                      Na pewno?
                    </button>
                  ) : (
                    <button onClick={() => setConfirmDelete(`rule:${r.id}`)} className="p-1 rounded text-muted-foreground hover:text-destructive" title="Usuń">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PatternTester sessions={sessions} />
    </div>
  );
}
