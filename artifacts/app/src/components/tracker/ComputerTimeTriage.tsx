import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Category } from "@/lib/dashboard-data";
import type { AppClass, AppRule, Classification, UsageSession } from "@/lib/app-usage-classify";
import { cachedSuggestions, dismissedKeys, type AiDecision, type AiItem, type AiSuggestion, type DecisionSnapshot, type SuggestionRow } from "@/lib/app-usage-ai";
import {
  SKIP,
  TRIAGE_MAX,
  buildTriage,
  durationLabel,
  needsAi,
  planConfirm,
  planGroupClaims,
  plural,
  toAiItems,
  unassignedAfter,
  overriddenSeconds,
  OVERRIDE_MIN_SECONDS,
  type LabelEntry,
  type LabelUndo,
  type TriageChoice,
  type TriageItem,
} from "@/lib/app-usage-triage";
import { classColor, pct, tint, useKindPalette } from "./computer-time-shared";

/** app_class_suggestions as read on open: the AI cache and the skipped keys. */
export interface TriageMemory {
  rows: SuggestionRow[];
  /** False while the table does not exist: no cache, no dismissals. */
  ready: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The loaded window, every device (not the "Dziś" filter). */
  sessions: UsageSession[];
  classifications: Classification[];
  classes: AppClass[];
  rules: AppRule[];
  categories: Category[];
  /** Days the window spans, for the description line. */
  days: number;
  memory: TriageMemory | null;
  refreshMemory: () => Promise<TriageMemory>;
  requestAi: (items: AiItem[]) => Promise<{ suggestions: AiSuggestion[]; error: string | null }>;
  /** Stores the decisions; resolves to what the keys held before (for "Cofnij"), null on failure. */
  recordDecisions: (decisions: AiDecision[]) => Promise<DecisionSnapshot | null>;
  undoDecisions: (snapshot: DecisionSnapshot) => Promise<boolean>;
  labelKeys: (entries: LabelEntry[]) => Promise<LabelUndo | null>;
  /** Resolves to the claims the changed classes held before, null on failure. */
  claimCatalogGroups: (answers: Record<string, string>) => Promise<{ id: string; catalog_groups: string[] }[] | null>;
  undoLabels: (undo: LabelUndo) => Promise<boolean>;
}

/** Rows the AI is asked about on open. */
const AI_ITEMS = 40;
/** A first run takes 5-7 s; past this the rows stop waiting and show "?". */
const AI_TIMEOUT_MS = 25_000;
const BUCKET_NOTE_SECONDS = 600;
const NO_DISMISSED = new Set<string>();

type AiState = "idle" | "loading" | "done" | "error";

const DEVICE_ICON = { pc: "💻", phone: "📱" } as const;
const DEVICE_NAME = { pc: "komputer", phone: "telefon" } as const;

/**
 * "Przypisz w 10 sekund": the quick questions, then the biggest guessed or
 * unassigned rows with their suggestion pre-selected. Enter writes every
 * chosen row as label rules at once; the dialog closes at once and the toast
 * can undo the whole batch.
 */
export default function ComputerTimeTriage({
  open,
  onOpenChange,
  sessions,
  classifications,
  classes,
  rules,
  categories,
  days,
  memory,
  refreshMemory,
  requestAi,
  recordDecisions,
  undoDecisions,
  labelKeys,
  claimCatalogGroups,
  undoLabels,
}: Props) {
  const palette = useKindPalette();
  const [overrides, setOverrides] = useState<Record<string, TriageChoice>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ai, setAi] = useState<Map<string, AiSuggestion>>(() => new Map());
  const [aiState, setAiState] = useState<AiState>("idle");
  const [aiError, setAiError] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const confirmingRef = useRef(false);

  const sortedClasses = useMemo(() => [...classes].sort((a, b) => a.sort_order - b.sort_order), [classes]);
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const colorOf = (id: string) => {
    const c = classById.get(id);
    return c ? classColor(c, palette, categories) : palette.unassigned;
  };
  const dismissed = useMemo(() => (memory ? dismissedKeys(memory.rows) : NO_DISMISSED), [memory]);

  const triage = useMemo(
    () =>
      buildTriage({
        sessions,
        classifications,
        classes,
        rules,
        dismissed,
        ai,
        groupAnswers: answers,
        max: showAll ? Infinity : TRIAGE_MAX,
      }),
    [sessions, classifications, classes, rules, dismissed, ai, answers, showAll],
  );
  const { items, questions } = triage;

  const choices = useMemo(() => {
    const out: Record<string, TriageChoice> = {};
    for (const it of items) out[it.id] = it.id in overrides ? overrides[it.id] : it.suggestion?.preselect ? it.suggestion.classId : null;
    return out;
  }, [items, overrides]);
  const choiceOf = (it: TriageItem): TriageChoice => choices[it.id] ?? null;
  const answerOf = (group: string, fallback: string | null) => answers[group] ?? fallback;

  const chosen = items.filter((it) => {
    const c = choices[it.id];
    return !!c && c !== SKIP;
  });
  const chosenSeconds = chosen.reduce((n, it) => n + it.seconds, 0);
  const skippedCount = items.filter((it) => choices[it.id] === SKIP).length;
  const after = unassignedAfter(triage, choices);

  // Everything the open effect reads, without re-running it on every refetch.
  const latest = useRef({ sessions, classifications, classes, rules, memory, refreshMemory, requestAi });
  latest.current = { sessions, classifications, classes, rules, memory, refreshMemory, requestAi };

  // On open: fresh state, then the cache and the skipped keys, then the AI for
  // the rows nothing else can fill. Nothing here blocks the rows.
  useEffect(() => {
    if (!open) return;
    confirmingRef.current = false;
    let cancelled = false;
    setOverrides({});
    setAnswers({});
    setShowAll(false);
    setActiveId(null);
    setAiError(null);
    setAiState("idle");
    const initial = latest.current.memory;
    setAi(initial ? cachedSuggestions(initial.rows) : new Map());
    void (async () => {
      const l = latest.current;
      let mem: TriageMemory;
      try {
        mem = await l.refreshMemory();
      } catch {
        mem = initial ?? { rows: [], ready: false };
      }
      if (cancelled) return;
      const cached = cachedSuggestions(mem.rows);
      setAi(cached);
      const probe = buildTriage({
        sessions: l.sessions,
        classifications: l.classifications,
        classes: l.classes,
        rules: l.rules,
        dismissed: dismissedKeys(mem.rows),
        ai: cached,
        max: Infinity,
      });
      const ask = probe.items.filter(needsAi).slice(0, AI_ITEMS);
      if (ask.length === 0) {
        setAiState("done");
        return;
      }
      setAiState("loading");
      let timer = 0;
      const timeout = new Promise<{ suggestions: AiSuggestion[]; error: string | null }>((resolve) => {
        timer = window.setTimeout(() => resolve({ suggestions: [], error: "AI nie odpowiada." }), AI_TIMEOUT_MS);
      });
      const res = await Promise.race([l.requestAi(toAiItems(ask)), timeout]);
      window.clearTimeout(timer);
      if (cancelled) return;
      if (res.suggestions.length > 0) {
        setAi((prev) => {
          const next = new Map(prev);
          for (const s of res.suggestions) next.set(s.app_key, s);
          return next;
        });
      }
      setAiError(res.error);
      setAiState(res.error && res.suggestions.length === 0 ? "error" : "done");
    })();
    return () => {
      cancelled = true;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- once per opening; the rest is read through `latest`

  const active = items.find((it) => it.id === activeId) ?? items[0] ?? null;

  const focusRow = (id: string | undefined, scroll = true) => {
    if (!id) return;
    setActiveId(id);
    const el = rowRefs.current.get(id);
    if (!el) return;
    // The first focus on open must not scroll the questions away.
    el.focus({ preventScroll: true });
    if (scroll) el.scrollIntoView({ block: "nearest" });
  };
  const move = (from: TriageItem | null, step: number) => {
    if (items.length === 0) return;
    const idx = from ? items.findIndex((it) => it.id === from.id) : -1;
    const next = Math.max(0, Math.min(items.length - 1, idx + step));
    focusRow(items[next]?.id);
  };
  const setChoice = (it: TriageItem, choice: TriageChoice) => setOverrides((o) => ({ ...o, [it.id]: choice }));
  const toggleClass = (it: TriageItem, classId: string) => setChoice(it, choiceOf(it) === classId ? null : classId);
  const toggleSkip = (it: TriageItem) => {
    if (choiceOf(it) === SKIP) {
      setOverrides((o) => {
        const next = { ...o };
        delete next[it.id];
        return next;
      });
    } else {
      setChoice(it, SKIP);
    }
  };

  const nothingToDo = chosen.length === 0 && skippedCount === 0 && questions.length === 0;

  const confirm = () => {
    // Enter held down, or a double click during the closing animation, must not write twice.
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    if (nothingToDo) {
      onOpenChange(false);
      return;
    }
    const groupAnswers: Record<string, string> = {};
    for (const q of questions) {
      const a = answerOf(q.group, q.defaultClassId);
      if (a) groupAnswers[q.group] = a;
    }
    const plan = planConfirm(items, choices, classes, ai);
    const claims = planGroupClaims(classes, groupAnswers);
    const ready = memory?.ready !== false;
    onOpenChange(false);
    void (async () => {
      const tid = toast.loading("Zapisuję przypisania…");
      const [claimed, undo] = await Promise.all([
        claims.length > 0 ? claimCatalogGroups(groupAnswers) : Promise.resolve([]),
        plan.entries.length > 0 ? labelKeys(plan.entries) : Promise.resolve(null),
      ]);
      const groupsOk = claimed !== null;
      let decisions: DecisionSnapshot | null = null;
      if (ready && plan.decisions.length > 0) {
        decisions = await recordDecisions(plan.decisions);
        void refreshMemory().catch(() => undefined);
      }
      const full: LabelUndo = {
        keys: undo?.keys ?? [],
        created: undo?.created ?? [],
        restore: undo?.restore ?? [],
        classGroups: claimed ?? [],
        decisions,
      };
      const assigned = undo ? plan.assigned.filter((it) => it.appKeys.every((k) => undo.keys.includes(k))).length : 0;
      const parts: string[] = [];
      if (assigned > 0) parts.push(`Przypisano ${assigned} ${plural(assigned, "pozycję", "pozycje", "pozycji")}`);
      if (plan.skipped.length > 0 && ready && decisions) parts.push(`pominięto ${plan.skipped.length}`);
      if (claims.length > 0 && groupsOk) parts.push(assigned > 0 ? "zapisano odpowiedzi" : "Zapisano odpowiedzi");
      const canUndo = full.created.length + full.restore.length + full.classGroups.length + (decisions?.keys.length ?? 0) > 0;
      if (parts.length === 0) {
        toast.dismiss(tid);
        return;
      }
      const message = parts.join(", ");
      toast.success(message.charAt(0).toUpperCase() + message.slice(1), {
        id: tid,
        duration: 10_000,
        action: canUndo
          ? {
              label: "Cofnij",
              onClick: () => {
                void Promise.all([undoLabels(full), decisions ? undoDecisions(decisions) : Promise.resolve(true)]).then(([a, b]) => {
                  if (a && b) toast.success("Cofnięto");
                  if (decisions) void refreshMemory().catch(() => undefined);
                });
              },
            }
          : undefined,
      });
    })();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    const onControl = target.tagName === "BUTTON" || target.tagName === "A" || target.tagName === "INPUT";
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(active, e.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (e.key === "Enter") {
      // A focused button handles its own Enter (that is how chips work from the keyboard).
      if (onControl) return;
      e.preventDefault();
      confirm();
      return;
    }
    if (!active) return;
    // Digits and S act on the active row only while focus is in the rows list,
    // not on a question chip or the close button.
    if (!target.closest('ul[aria-label="Pozycje do przypisania"]')) return;
    if (/^[1-9]$/.test(e.key)) {
      const cls = sortedClasses[Number(e.key) - 1];
      if (!cls) return;
      e.preventDefault();
      setChoice(active, cls.id);
      move(active, 1);
      return;
    }
    if (e.key === "0" || e.key === "s" || e.key === "S") {
      e.preventDefault();
      toggleSkip(active);
      move(active, 1);
    }
  };

  const nowPct = pct(triage.unassignedSeconds, triage.totalSeconds);
  const afterPct = pct(after, triage.totalSeconds);
  const keyHint = sortedClasses.length > 1 ? `1–${Math.min(9, sortedClasses.length)}` : "1";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl p-0 gap-0 max-h-[92vh] flex flex-col overflow-hidden"
        onKeyDown={onKeyDown}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const first = items[0];
          if (first) window.setTimeout(() => focusRow(first.id, false), 0);
        }}
      >
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 pr-12 text-left border-b border-border/40">
          <DialogTitle className="text-base">Przypisz w 10 sekund</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            Bez kategorii: <strong className="text-foreground font-mono">{nowPct}</strong> →{" "}
            <strong className="text-primary font-mono">~{afterPct}</strong> po zatwierdzeniu
            <span className="block text-[11px] text-muted-foreground">
              Ostatnie {days} {plural(days, "dzień", "dni", "dni")}, wszystkie urządzenia.
              <span className="hidden sm:inline"> Zaznaczone propozycje zapiszą się jako reguły: popraw, co nie pasuje, i zatwierdź.</span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-5">
          {classes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Najpierw dodaj klasy w zakładce Aplikacje.</p>
          ) : items.length === 0 && questions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">
              Nic do przypisania: wszystko, co trwało dłużej niż 2 min, ma już klasę.
            </p>
          ) : null}

          {questions.length > 0 && (
            <section aria-labelledby="triage-questions" className="space-y-2">
              <h3 id="triage-questions" className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Szybkie pytania
              </h3>
              {questions.map((q) => {
                const current = answerOf(q.group, q.defaultClassId);
                return (
                  <div key={q.group} className="rounded-xl border border-border/40 bg-secondary/30 px-3 py-2 sm:flex sm:items-center sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground/90">{q.ask}</p>
                      <p className="text-[10px] text-muted-foreground truncate" title={q.examples.join(", ")}>
                        <span className="font-mono">{durationLabel(q.seconds)}</span>
                        {q.examples.length > 0 && ` · ${q.examples.join(", ")}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5 sm:mt-0 sm:justify-end shrink-0" role="group" aria-label={q.ask}>
                      {q.optionClassIds.map((id) => (
                        <ChoiceChip
                          key={id}
                          name={classById.get(id)?.name ?? "?"}
                          color={colorOf(id)}
                          state={current === id ? "selected" : "idle"}
                          onClick={() => setAnswers((a) => ({ ...a, [q.group]: id }))}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {items.length > 0 && (
            <section aria-labelledby="triage-rows" className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 id="triage-rows" className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Do przypisania
                </h3>
                {aiState === "loading" && (
                  <span className="text-[10px] text-muted-foreground animate-pulse" role="status">
                    AI szuka propozycji…
                  </span>
                )}
                {aiState === "error" && (
                  <span className="text-[10px] text-muted-foreground/80" role="status" title={aiError ?? undefined}>
                    AI niedostępne
                  </span>
                )}
              </div>
              <ul className="space-y-1.5" aria-label="Pozycje do przypisania">
                {items.map((it) => {
                  const choice = choices[it.id];
                  const s = it.suggestion;
                  const isActive = active?.id === it.id;
                  const waiting = aiState === "loading" && needsAi(it);
                  const keysLine = it.appKeys.length > 1 || it.appKeys[0] !== it.name ? it.appKeys.join(" · ") : "";
                  return (
                    <li
                      key={it.id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(it.id, el);
                        else rowRefs.current.delete(it.id);
                      }}
                      tabIndex={isActive ? 0 : -1}
                      onFocus={() => setActiveId(it.id)}
                      aria-label={`${it.name}, ${durationLabel(it.seconds)}${
                        choice === SKIP ? ", pominięte" : choice ? `, ${classById.get(choice)?.name ?? ""}` : ", bez wyboru"
                      }`}
                      className={`rounded-xl border px-3 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/70 ${
                        isActive ? "border-primary/50 bg-secondary/40" : "border-border/40 bg-secondary/20"
                      } ${choice === SKIP ? "opacity-60" : ""}`}
                    >
                      <div className="lg:grid lg:grid-cols-[minmax(11rem,1fr)_auto] lg:items-center lg:gap-x-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0 text-xs" aria-label={it.devices.map((d) => DEVICE_NAME[d]).join(" i ")}>
                              {it.devices.map((d) => DEVICE_ICON[d]).join("")}
                            </span>
                            <span className="text-xs font-semibold text-foreground/90 truncate" title={s?.why}>
                              {it.name}
                            </span>
                            <span className="ml-auto lg:ml-0 shrink-0 text-[11px] font-mono text-muted-foreground">
                              {durationLabel(it.seconds)}
                            </span>
                            {waiting ? (
                              <span className="shrink-0 text-[10px] text-muted-foreground animate-pulse">AI…</span>
                            ) : !s ? (
                              <span className="shrink-0 text-[10px] font-bold text-muted-foreground" title="Brak propozycji">
                                ?
                              </span>
                            ) : null}
                          </div>
                          {it.titles[0] && <div className="text-[10px] text-muted-foreground truncate">{it.titles[0]}</div>}
                          {choice && choice !== SKIP && (() => {
                            const moved = overriddenSeconds(it, choice, classById);
                            return moved >= OVERRIDE_MIN_SECONDS ? (
                              <div className="text-[10px] text-amber-300/90">
                                Zmieni też {durationLabel(moved)}, które mają już inną klasę lub projekt
                              </div>
                            ) : null;
                          })()}
                          {keysLine && (
                            <div className="text-[10px] text-muted-foreground/60 font-mono truncate" title={it.appKeys.join("\n")}>
                              {keysLine}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5 lg:mt-0 lg:justify-end">
                          {sortedClasses.map((c, idx) => (
                            <ChoiceChip
                              key={c.id}
                              name={c.name}
                              color={colorOf(c.id)}
                              hint={idx < 9 ? String(idx + 1) : undefined}
                              state={
                                choice === c.id
                                  ? "selected"
                                  : s?.classId === c.id
                                    ? "suggested"
                                    : s?.altClassIds.includes(c.id)
                                      ? "alt"
                                      : "idle"
                              }
                              tabIndex={isActive ? 0 : -1}
                              onClick={() => {
                                toggleClass(it, c.id);
                                focusRow(it.id);
                              }}
                            />
                          ))}
                          <button
                            type="button"
                            tabIndex={isActive ? 0 : -1}
                            aria-pressed={choice === SKIP}
                            onClick={() => {
                              toggleSkip(it);
                              focusRow(it.id);
                            }}
                            title={
                              it.seconds > it.unassignedSeconds && s
                                ? `Nie pytaj więcej; zgadnięta klasa zostaje (${classById.get(s.classId)?.name ?? "katalog"})`
                                : "Zostaw bez klasy i nie pytaj więcej"
                            }
                            className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                              choice === SKIP
                                ? "border-foreground/40 text-foreground bg-white/5"
                                : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                            }`}
                          >
                            Pomiń
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {triage.otherBucketSeconds >= BUCKET_NOTE_SECONDS && (
            <p className="rounded-xl border border-border/40 bg-secondary/20 px-3 py-2 text-[11px] text-muted-foreground leading-5">
              <span className="text-foreground/80 font-semibold">{durationLabel(triage.otherBucketSeconds)}</span> to karty przeglądarki
              bez nazwy strony (<span className="font-mono">Browser | other</span>): tego nie da się przypisać jednym kliknięciem.
              Tracker 1.2 odczytuje domenę karty, więc nowy czas trafi do właściwych wierszy.
            </p>
          )}
        </div>

        <div className="border-t border-border/40 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {triage.rest.count > 0 && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Pokaż więcej ({triage.rest.count})
            </button>
          )}
          {items.length > 0 && (
            <span className="hidden md:inline text-[10px] text-muted-foreground/80">
              ↑↓ wiersz · {keyHint} klasa · S pomiń · Enter zatwierdź
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-3 py-1.5 rounded-lg border border-border/50 text-xs text-muted-foreground hover:text-foreground"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={classes.length === 0}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
            >
              Zatwierdź ({chosen.length}){chosen.length > 0 ? ` · ${durationLabel(chosenSeconds)}` : ""}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ChipState = "selected" | "suggested" | "alt" | "idle";

/**
 * One-tap class button, coloured like ClassChip: filled with a tick when
 * selected (on the secondary surface, so even Neutralne's faint grey reads as
 * chosen), an outline in the class colour for the suggestion that is not
 * selected, dashed for an alternative, muted otherwise.
 */
function ChoiceChip({
  name,
  color,
  state,
  hint,
  tabIndex,
  onClick,
}: {
  name: string;
  color: string;
  state: ChipState;
  hint?: string;
  tabIndex?: number;
  onClick: () => void;
}) {
  const style =
    state === "selected"
      ? { backgroundImage: `linear-gradient(${tint(color, 28)}, ${tint(color, 28)})`, border: `1px solid ${color}` }
      : state === "suggested"
        ? { background: "transparent", border: `1px solid ${tint(color, 60)}` }
        : state === "alt"
          ? { background: "transparent", border: `1px dashed ${tint(color, 50)}` }
          : undefined;
  return (
    <button
      type="button"
      tabIndex={tabIndex}
      aria-pressed={state === "selected"}
      onClick={onClick}
      style={style}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors max-w-[11rem] ${
        state === "selected"
          ? "bg-secondary text-foreground"
          : state === "suggested"
            ? "text-foreground/90"
            : state === "alt"
              ? "text-foreground/75"
              : state === "idle"
            ? "border border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
            : ""
      }`}
    >
      {state === "selected" ? (
        <Check className="w-3 h-3 shrink-0" style={{ color }} aria-hidden="true" />
      ) : (
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      )}
      <span className="truncate">{name}</span>
      {state === "suggested" && <span aria-label="propozycja">?</span>}
      {hint && <span className="hidden sm:inline text-[9px] font-mono opacity-50">{hint}</span>}
    </button>
  );
}
