import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  createElement,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { revisePathPlan, findPathByName } from "@/lib/path-writes";
import { notifyPathsChanged } from "@/hooks/usePaths";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardState } from "@/hooks/useDashboardState";
import { PLANNING_TASKS_CHANGED_EVENT } from "@/hooks/usePlanningState";
import {
  gatherContext,
  SCOPE_MAP,
  type ScopeId,
  type ArchiveItemRef,
  type Citation,
} from "@/lib/assistant-context";
import {
  ACTION_SCOPE,
  buildActionInstructions,
  describeAction,
  isAutoApply,
  parseActions,
  visibleReplyText,
  type AssistantAction,
} from "@/lib/assistant-actions";
import { ASSISTANT_FN_URL, assistantAuthHeaders, routeScopes } from "@/lib/assistant-api";
import { playCheckSound } from "@/lib/ui-sounds";
import { findMission, listTodayMissions } from "@/lib/mission-match";
import { annotateHistory, keywordScopes } from "@/lib/scope-hints";
import {
  addCalendarEvent,
  addBooks,
  addFinanceTransaction,
  completePlanningTask,
  createPath,
  createPresetFromMissions,
  defaultPlanningBoard,
  logMetricEntry,
  logPathStepToday,
  patchPreferences,
  saveCurrentAsPreset,
  setModuleEnabled,
} from "@/lib/assistant-writes";
import { CATEGORIES } from "@/lib/dashboard-data";
import { replaceDashes } from "@/lib/text-style";
import { todayKey } from "@/lib/today";
import { ARCHIVE_BLOCKS_CHANGED_EVENT } from "@/lib/archive-data";
import { MISSION_PRESETS_CHANGED_EVENT, missionsForApply, parseMissionMap, type MissionMap } from "@/lib/mission-presets";
import { settleLaunch } from "@/lib/launch";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  error?: boolean;
  /** Write actions the assistant proposed for this reply, pending confirmation. */
  actions?: AssistantAction[];
  /** Set once the user has applied or dismissed the actions. */
  actionsResolved?: "applied" | "dismissed";
  /** Short summary shown after the actions were applied. */
  actionResult?: string;
  /** Per action (same order as `actions`), whether it went through when applied. */
  actionResults?: boolean[];
}

const OPEN_KEY = "assistant_panel_open";
const MSG_KEY = "assistant_messages";
const SCOPE_KEY = "assistant_scopes";
const AUTO_KEY = "assistant_auto_context";
/**
 * What ai-assistant-chat keeps of `context`. The action instructions ride at
 * the end of it, so the data part is cut here to leave room for them; a cut
 * at the server would take the instructions first.
 */
const CONTEXT_MAX_CHARS = 120_000;
const CONTEXT_CUT_NOTE = "\n\n(Data cut here to fit the request size.)";
/** Cross-page navigation event handled by pages/Index.tsx. */
export const NAVIGATE_EVENT = "lov:navigate-module";


function loadMessages(): AssistantMessage[] {
  try {
    const raw = sessionStorage.getItem(MSG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadAutoContext(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== "0";
  } catch {
    return true;
  }
}

function loadScopes(): ScopeId[] {
  try {
    const raw = sessionStorage.getItem(SCOPE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Toast line saying where assistant-made planning rows landed. */
function planningPlacement(board: { name: string } | null): string {
  return board
    ? `Tablica „${board.name}” w Planning`
    : "Zapisano bez tablicy: nie masz jeszcze żadnej tablicy w Planning, więc nie będzie tam widoczne.";
}

/** "1 węzeł", "3 węzły", "5 węzłów". */
function nodesLabel(n: number): string {
  if (n === 1) return "1 węzeł";
  const few = n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14);
  return `${n} ${few ? "węzły" : "węzłów"}`;
}

function useAssistantValue() {
  const { user } = useAuth();
  const {
    addMission,
    applyMissionPreset,
    completeMission,
    uncompleteMission,
    removeMission,
    saveCustomMissions,
    completeExternal,
    addXP,
    state: dashboardState,
  } = useDashboardState();
  // Missions are addressed by their position in a list, so each action in a
  // batch ("remove X, remove Y", "add X, then edit it") has to see what the
  // previous one did. runAction reads this ref instead of the render-time
  // state, and flushes its own mission writes (flushSync) so the ref is
  // current again before the next action runs.
  const dashboardRef = useRef(dashboardState);
  useLayoutEffect(() => {
    dashboardRef.current = dashboardState;
  }, [dashboardState]);
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpenState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [messages, setMessages] = useState<AssistantMessage[]>(loadMessages);
  const [selectedScopes, setSelectedScopes] = useState<ScopeId[]>(loadScopes);
  // Auto-context: the router model picks sections per message; `selectedScopes`
  // are the ones the user pinned by hand and always ride along.
  const [autoContext, setAutoContextState] = useState<boolean>(loadAutoContext);
  const [autoScopes, setAutoScopes] = useState<ScopeId[]>([]);
  const [routing, setRouting] = useState(false);
  const [lastModel, setLastModel] = useState<string | null>(null);
  const [budgetExceeded, setBudgetExceeded] = useState(false);
  const [archiveItems, setArchiveItems] = useState<ArchiveItemRef[]>([]);
  const [currentScope, setCurrentScope] = useState<ScopeId | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Replies whose actions an apply or a dismiss has already taken. Checked
  // synchronously, so a click and a spoken "tak" landing together (or a
  // double click) cannot run the same actions twice.
  const claimedRef = useRef<Set<string>>(new Set());

  // Persist panel open/closed across reloads.
  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    if (!v) settleLaunch(); // popups held for a link launch may show now
    try {
      localStorage.setItem(OPEN_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  // Persist conversation + scopes for the session.
  useEffect(() => {
    try {
      sessionStorage.setItem(MSG_KEY, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [messages]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SCOPE_KEY, JSON.stringify(selectedScopes));
    } catch {
      /* ignore */
    }
  }, [selectedScopes]);

  const setAutoContext = useCallback((v: boolean) => {
    setAutoContextState(v);
    if (!v) setAutoScopes([]);
    try {
      localStorage.setItem(AUTO_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleScope = useCallback((scope: ScopeId) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }, []);

  const addArchiveItem = useCallback((item: ArchiveItemRef) => {
    setArchiveItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
  }, []);

  const removeArchiveItem = useCallback((id: string) => {
    setArchiveItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
  }, []);

  // When the panel is opened with no scopes chosen yet, pre-select the page
  // the user is currently on (falling back to the dashboard) as a convenience.
  const ensureDefaultScope = useCallback(() => {
    if (autoContext) return;
    setSelectedScopes((prev) => (prev.length > 0 ? prev : [currentScope || "dashboard"]));
  }, [currentScope, autoContext]);

  const openRef = useRef(open);
  openRef.current = open;
  const openPanel = useCallback(() => {
    ensureDefaultScope();
    // Every caller is a click (the launcher, "Ask AI" in Paths), so the browser lets it play.
    if (!openRef.current) playCheckSound();
    setOpen(true);
  }, [ensureDefaultScope, setOpen]);

  // Deep link: `?assistant=1` (e.g. a phone shake shortcut) opens the panel
  // on load; `?assistant=voice` also starts the voice conversation (the
  // panel asks for one tap first when the browser needs it). The parameter
  // is dropped afterwards so a reload does not repeat it.
  const [voiceRequested, setVoiceRequested] = useState(false);
  const clearVoiceRequest = useCallback(() => setVoiceRequested(false), []);
  useEffect(() => {
    const openFromLink = (value: string | null) => {
      ensureDefaultScope();
      setOpen(true);
      if (value === "voice") setVoiceRequested(true);
    };
    // With hash routing the parameter may also sit before the "#" (".../?assistant=1#/").
    const outer = new URLSearchParams(window.location.search);
    if (outer.has("assistant")) {
      const value = outer.get("assistant");
      outer.delete("assistant");
      const rest = outer.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
      openFromLink(value);
    }
    const params = new URLSearchParams(location.search);
    if (!params.has("assistant")) return;
    openFromLink(params.get("assistant"));
    params.delete("assistant");
    const rest = params.toString();
    navigate({ pathname: location.pathname, search: rest ? `?${rest}` : "" }, { replace: true, state: location.state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const sendMessage = useCallback(
    async (text: string, opts?: { voice?: boolean }): Promise<AssistantMessage | null> => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming || !user) return null;

      const pinned = selectedScopes;
      // Sections the message names outright always ride along, so a "save a
      // note" or "tick the mission" is never left without its action.
      const named = keywordScopes(trimmed).filter((sc) => !pinned.includes(sc));
      let scopesForSend: ScopeId[] = [...pinned, ...named];
      if (scopesForSend.length === 0) scopesForSend = [currentScope || "dashboard"];
      // History carries what happened to earlier actions, not just the prose.
      const historyForSend = annotateHistory(messages);

      const userMsg: AssistantMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      const assistantId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", content: "" },
      ]);
      setIsStreaming(true);

      const patchAssistant = (updater: (m: AssistantMessage) => AssistantMessage) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? updater(m) : m)));

      let final: AssistantMessage | null = null;
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Let the router model pick the sections for this message. Pinned
        // sections always stay; a router failure just falls back to them.
        if (autoContext) {
          setRouting(true);
          try {
            const routed = await routeScopes(
              { message: trimmed, history: historyForSend, current: currentScope, pinned },
              controller.signal,
            );
            const extra = Array.from(new Set([...named, ...routed.scopes])).filter((sc) => !pinned.includes(sc));
            setAutoScopes(extra);
            scopesForSend = [...pinned, ...extra];
            if (scopesForSend.length === 0) scopesForSend = [currentScope || "dashboard"];
          } catch (e) {
            if (e instanceof Error && e.name === "AbortError") throw e;
            setAutoScopes(named);
          } finally {
            setRouting(false);
          }
        }

        const { text: context, citations } = await gatherContext(
          user.id,
          scopesForSend,
          archiveItems,
          trimmed,
        );

        // The action protocol rides inside `context` (the function embeds it in
        // the system prompt), gated by the sections in play.
        const actionInstructions = buildActionInstructions(scopesForSend);
        const room = CONTEXT_MAX_CHARS - (actionInstructions ? actionInstructions.length + 2 : 0);
        const data = context.length > room
          ? context.slice(0, Math.max(0, room - CONTEXT_CUT_NOTE.length)) + CONTEXT_CUT_NOTE
          : context;
        const contextWithActions = actionInstructions
          ? `${data}\n\n${actionInstructions}`
          : data;

        const res = await fetch(ASSISTANT_FN_URL, {
          method: "POST",
          headers: await assistantAuthHeaders(),
          body: JSON.stringify({
            message: trimmed,
            history: historyForSend,
            context: contextWithActions,
            scopes: scopesForSend,
            voice: !!opts?.voice,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          if (res.status === 404) {
            throw new Error(
              "The assistant isn't available yet. The 'ai-assistant-chat' function needs to be deployed to Supabase before it can answer.",
            );
          }
          if (res.status === 401) throw new Error("Please sign in again to use the assistant.");
          if (res.status === 429) throw new Error("Rate limit reached. Please try again in a moment.");
          if (res.status === 402) throw new Error("AI credits are exhausted. Please add credits in Supabase.");
          throw new Error("The assistant could not be reached. Please try again.");
        }

        const modelHeader = res.headers.get("X-Assistant-Model");
        if (modelHeader) setLastModel(modelHeader);
        setBudgetExceeded(res.headers.get("X-Assistant-Budget") === "exceeded");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let acc = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const payload = t.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                acc += delta;
                const shown = replaceDashes(visibleReplyText(acc));
                patchAssistant((m) => ({ ...m, content: shown }));
              }
            } catch {
              /* ignore malformed chunk */
            }
          }
        }

        if (!acc.trim()) {
          final = {
            id: assistantId,
            role: "assistant",
            content: "I couldn't produce an answer this time. Please try rephrasing.",
          };
        } else {
          // Pull any proposed write actions out of the reply and gate them by the
          // sections in play. Navigation runs right away; the rest wait for a click
          // (or a spoken yes in voice mode).
          const { text: parsedText, actions, dropped, broken } = parseActions(replaceDashes(acc), scopesForSend);
          // A block that was cut off or malformed is never shown as raw JSON.
          const display = broken
            ? `${parsedText}\n\n(Nie udało się odczytać proponowanych akcji. Poproś jeszcze raz, krócej.)`.trim()
            : parsedText;
          const pending = actions.filter((a) => !isAutoApply(a));
          for (const a of actions.filter(isAutoApply)) void runActionRef.current(a);
          // Valid actions for a section that is not in play were left out; say
          // so once instead of letting the request vanish.
          if (dropped.length > 0) {
            const sections = Array.from(new Set(dropped.map((a) => ACTION_SCOPE[a.type]).filter((s): s is ScopeId => !!s)));
            toast.warning(
              `Pominięto ${dropped.length === 1 ? "akcję" : `akcje (${dropped.length})`} spoza sekcji tej rozmowy: ${sections.map((s) => SCOPE_MAP[s]?.label ?? s).join(", ")}`,
              { description: `${dropped.map(describeAction).join("\n")}\nPrzypnij ${sections.length === 1 ? "tę sekcję" : "te sekcje"} w Context i poproś jeszcze raz.` },
            );
          }
          // A reply that was only an action block still gets a line of text,
          // never the raw block.
          const fallback = pending.length > 0 ? "Proponuję te zmiany." : actions.length > 0 ? "Gotowe." : "Nic nie zostało zmienione.";
          final = {
            id: assistantId,
            role: "assistant",
            content: display || fallback,
            citations,
            actions: pending.length > 0 ? pending : undefined,
          };
        }
        const done = final;
        patchAssistant((m) => ({ ...m, ...done }));
      } catch (e) {
        const msg =
          e instanceof Error && e.name === "AbortError"
            ? "Stopped."
            : e instanceof Error
              ? e.message
              : "Something went wrong.";
        final = { id: assistantId, role: "assistant", content: msg, error: true };
        patchAssistant((m) => ({ ...m, content: msg, error: true }));
      } finally {
        setIsStreaming(false);
        setRouting(false);
        abortRef.current = null;
      }
      return final;
    },
    [isStreaming, user, selectedScopes, currentScope, messages, archiveItems, autoContext],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Execute one action via the existing state hooks / tables. Returns whether
  // it succeeded; the confirm flow and the auto-apply path both go through here.
  const runAction = useCallback(
    async (action: AssistantAction): Promise<boolean> => {
      if (!user) return false;
      let ok = 0;
      let failed = 0;
      {
        try {
          if (action.type === "navigate") {
            const module = action.module;
            const announce = () => window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: { module } }));
            if (module === "tracker") {
              navigate("/tracker");
            } else if (location.pathname !== "/") {
              // Index.tsx owns the tabs; it reads the module from the router state on mount.
              navigate("/", { state: { module } });
            } else {
              announce();
            }
            ok++;
          } else if (action.type === "complete_mission") {
            // Ticks belong to the day the state was last written; after the 04:00
            // rollover (applied lazily by completeMission) they are yesterday's.
            const dash = dashboardRef.current;
            const completed = dash.dayKey === todayKey() ? dash.completedMissions : [];
            const rolled = dash.dayKey === todayKey() ? dash.rolledVariants : {};
            const entries = listTodayMissions(dash.customMissions, completed, {}, undefined, rolled);
            const match = findMission(entries, action.title, action.categoryId);
            if (!match) {
              failed++;
              toast.error(`Nie znaleziono misji „${action.title}”`);
            } else if (match.done) {
              ok++;
              toast(`„${match.title}” jest już odhaczone`);
            } else {
              flushSync(() => completeMission(match.categoryId, match.index, match.xp));
              ok++;
              toast.success(`Odhaczono „${match.title}” (+${match.xp} XP)`);
            }
          } else if (action.type === "open_settings") {
            const detail = { module: "settings", tab: action.tab };
            if (location.pathname !== "/") navigate("/", { state: detail });
            else window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail }));
            ok++;
          } else if (action.type === "set_theme") {
            const r = await patchPreferences(user.id, {
              ...(action.theme ? { theme: action.theme } : {}),
              ...(action.accent ? { accentColor: action.accent } : {}),
            });
            if (r.ok) ok++;
            else { failed++; toast.error(r.error); }
          } else if (action.type === "toggle_module") {
            const r = await setModuleEnabled(user.id, action.module, action.enabled);
            if (r.ok) { ok++; toast.success(`${action.enabled ? "Włączono" : "Ukryto"} moduł ${action.module}`); }
            else { failed++; toast.error(r.error); }
          } else if (
            action.type === "uncomplete_mission" ||
            action.type === "edit_mission" ||
            action.type === "remove_mission"
          ) {
            const dash = dashboardRef.current;
            const completed = dash.dayKey === todayKey() ? dash.completedMissions : [];
            const rolled = dash.dayKey === todayKey() ? dash.rolledVariants : {};
            const entries = listTodayMissions(dash.customMissions, completed, {}, undefined, rolled);
            const pool = action.type === "uncomplete_mission" ? entries.filter((e) => e.done) : entries;
            const match = findMission(pool, action.title, action.categoryId) ?? findMission(entries, action.title, action.categoryId);
            if (!match) {
              failed++;
              toast.error(`Nie znaleziono misji „${action.title}”`);
            } else if (action.type === "uncomplete_mission") {
              if (match.done) {
                flushSync(() => uncompleteMission(match.categoryId, match.index, match.xp));
                toast.success(`Odznaczono „${match.title}” (−${match.xp} XP)`);
              } else {
                toast(`„${match.title}” nie była odhaczona`);
              }
              ok++;
            } else if (action.type === "remove_mission") {
              flushSync(() => removeMission(match.categoryId, match.index));
              toast.success(`Usunięto misję „${match.title}”`);
              ok++;
            } else {
              const custom = dash.customMissions[match.categoryId];
              const list = custom && custom.length > 0
                ? custom
                : CATEGORIES.find((c) => c.id === match.categoryId)?.missions || [];
              const current = list[match.index];
              if (!current) {
                failed++;
              } else {
                const updated = {
                  ...current,
                  ...(action.newTitle !== undefined ? { title: action.newTitle } : {}),
                  ...(action.description !== undefined ? { description: action.description } : {}),
                  ...(action.duration !== undefined ? { duration: action.duration } : {}),
                  ...(action.xp !== undefined ? { xp: action.xp } : {}),
                };
                // Every row carries its index so saveCustomMissions keeps ticks and rolled
                // variants on the same missions (a rename would otherwise lose the tick).
                flushSync(() => saveCustomMissions(
                  match.categoryId,
                  list.map((m, i) => ({ ...(i === match.index ? updated : m), __originalIndex: i })),
                ));
                toast.success(`Zmieniono misję „${action.newTitle || match.title}”`);
                ok++;
              }
            }
          } else if (action.type === "create_preset") {
            const map = action.missions as unknown as MissionMap;
            const r = await createPresetFromMissions(
              user.id,
              { name: action.name, emoji: action.emoji, description: action.description },
              map,
              action.apply,
            );
            if (!r.ok) { failed++; toast.error(r.error); }
            else {
              if (action.apply) flushSync(() => applyMissionPreset(missionsForApply(parseMissionMap(map))));
              ok++;
              toast.success(`${r.updated ? "Zaktualizowano" : "Utworzono"} preset „${r.name}”${action.apply ? " i załadowano na Home" : ""}`);
            }
          } else if (action.type === "save_preset") {
            const r = await saveCurrentAsPreset(user.id, { name: action.name, emoji: action.emoji }, dashboardRef.current.customMissions);
            if (r.ok) { ok++; toast.success(r.updated ? `Zaktualizowano preset „${r.name}”` : `Zapisano preset „${r.name}”`); }
            else { failed++; toast.error(r.error); }
          } else if (action.type === "log_metric") {
            const r = await logMetricEntry(user.id, action.metric, action.value);
            if (r.ok) {
              if (r.xp > 0) addXP(r.xp);
              ok++;
              toast.success(`${r.metric.icon ?? ""} ${r.metric.label}: +${action.value} ${r.metric.unit}${r.xp > 0 ? ` · +${r.xp} XP` : ""}`.trim());
            } else { failed++; toast.error(r.error); }
          } else if (action.type === "log_path_step") {
            const r = await logPathStepToday(user.id, action.pathName);
            if (r.ok) {
              if (r.xp > 0) completeExternal(r.categoryId, r.xp);
              ok++;
              toast.success(`${r.finished ? "Krok ukończony" : "Zalogowano dzień"}: ${r.stepTitle} · +${r.xp} XP`);
            } else { failed++; toast.error(r.error); }
          } else if (action.type === "create_path") {
            const r = await createPath(user.id, { name: action.name, diagnosis: action.diagnosis, steps: action.steps });
            if (r.ok) { ok++; toast.success(`Utworzono ścieżkę „${action.name}”`); }
            else { failed++; toast.error(r.error); }
          } else if (action.type === "complete_task") {
            const r = await completePlanningTask(user.id, action.title);
            if (r.ok) { ok++; toast.success(`Zadanie zrobione: „${r.title}”`); }
            else { failed++; toast.error(r.error); }
          } else if (action.type === "add_event") {
            const r = await addCalendarEvent(user.id, { title: action.title, date: action.date, time: action.time, notes: action.notes });
            if (r.ok) { ok++; toast.success(`Dodano do kalendarza: ${action.date} ${action.title}`); }
            else { failed++; toast.error(r.error); }
          } else if (action.type === "add_book") {
            const r = await addBooks(user.id, action.books);
            if (r.ok) {
              ok++;
              const skippedNote = r.skipped.length ? `Już na półce: ${r.skipped.join(", ")}` : undefined;
              if (r.added.length === 0) toast.info("Te książki już są w Library", { description: skippedNote });
              else toast.success(r.added.length === 1 ? `Dodano do Library: „${r.added[0]}”` : `Dodano ${r.added.length} książek do Library`, { description: skippedNote });
            } else { failed++; toast.error(r.error); }
          } else if (action.type === "add_transaction") {
            const r = await addFinanceTransaction(user.id, {
              type: action.kind, amount: action.amount, title: action.title, category: action.category, date: action.date,
            });
            if (r.ok) { ok++; toast.success(`${action.kind === "income" ? "Przychód" : "Wydatek"}: ${action.amount} · ${action.title}`); }
            else { failed++; toast.error(r.error); }
          } else if (action.type === "add_mission") {
            flushSync(() =>
              addMission(action.categoryId, {
                title: action.title,
                description: action.description || "",
                duration: action.duration || "",
                xp: action.xp ?? 20,
              }),
            );
            ok++;
          } else if (action.type === "apply_preset") {
            // Same write as the "Załaduj" chip on Home: replace every mission
            // list with the saved snapshot. Exact name first, then a unique
            // substring match so "monk" finds "Monk mode".
            const { data: rows } = await supabase
              .from("mission_presets")
              .select("id,name,missions")
              .eq("user_id", user.id);
            const wanted = action.presetName.trim().toLowerCase();
            const list = rows || [];
            const exact = list.filter((r) => r.name.toLowerCase() === wanted);
            const partial = list.filter((r) => r.name.toLowerCase().includes(wanted) || wanted.includes(r.name.toLowerCase()));
            const match = exact[0] ?? (partial.length === 1 ? partial[0] : undefined);
            if (!match) {
              failed++;
              toast.error(`Nie znaleziono presetu „${action.presetName}”`);
            } else {
              flushSync(() => applyMissionPreset(missionsForApply(parseMissionMap(match.missions))));
              ok++;
              toast.success(`Załadowano preset „${match.name}”`);
              await supabase
                .from("mission_presets")
                .update({ last_applied_at: new Date().toISOString() })
                .eq("id", match.id)
                .eq("user_id", user.id);
              window.dispatchEvent(new CustomEvent(MISSION_PRESETS_CHANGED_EVENT));
            }
          } else if (action.type === "add_task") {
            // Planning only lists rows of a board, so the task goes on the
            // default board (see defaultPlanningBoard); with no board at all
            // it is still saved, and the toast says where it went.
            const board = await defaultPlanningBoard(user.id);
            const { error } = await (supabase.from("planning_tasks" as never) as never as {
              insert: (rows: unknown[]) => Promise<{ error: unknown }>;
            }).insert([
              {
                user_id: user.id,
                project_id: null,
                board_id: board?.id ?? null,
                parent_id: null,
                level: action.level || "task",
                title: action.title,
                done: false,
                deadline: action.deadline ?? null,
                leverage: null,
                energy: null,
                time_minutes: null,
                url: null,
                icon: null,
                notes: action.notes || "",
                standalone: true,
                position_x: null,
                position_y: null,
                mentions: [],
              },
            ]);
            if (error) {
              failed++;
            } else {
              ok++;
              toast.success(`Dodano zadanie „${action.title}”`, { description: planningPlacement(board) });
              // Page-scoped planning hooks don't share state with this
              // provider, so nudge them to refetch immediately.
              window.dispatchEvent(new CustomEvent(PLANNING_TASKS_CHANGED_EVENT));
            }
          } else if (action.type === "add_note") {
            // Always auto-tag with "ainote"
            const tags = [...(action.tags || [])];
            if (!tags.includes("ainote")) tags.push("ainote");

            const { error } = await supabase
              .from("archive_blocks" as never)
              .insert({
                user_id: user.id,
                title: action.title,
                content: action.content,
                pillars: action.pillars || ["uncategorized"],
                tags,
                directions: [],
                source_url: null,
                is_pinned: false,
              } as never);

            if (error) {
              failed++;
            } else {
              ok++;
              // Nudge the archive query to refetch immediately.
              window.dispatchEvent(new CustomEvent(ARCHIVE_BLOCKS_CHANGED_EVENT));
            }
          } else if (action.type === "revise_path") {
            // The only action that edits rather than appends. It snapshots the
            // old plan first, so the whole rewrite is one click to undo from
            // the path's history.
            const target = await findPathByName(user.id, action.pathName);
            if (!target) {
              failed++;
            } else {
              const result = await revisePathPlan({
                userId: user.id,
                pathId: target.id,
                reason: action.reason,
                source: "assistant",
                diagnosis: action.diagnosis ?? null,
                // No days given: mode and target stay undefined, so a step the
                // plan matches keeps its own (a new one becomes a one-off).
                nextPlan: action.steps.map((step) => ({
                  title: step.title,
                  stage: step.stage ?? null,
                  mode: step.days === undefined ? undefined : step.days > 1 ? ("reps" as const) : ("once" as const),
                  repsTarget: step.days,
                  xp: step.xp,
                })),
              });
              if (!result.ok) {
                failed++;
              } else {
                ok++;
                if (result.kept > 0) {
                  toast(`${result.kept} step${result.kept > 1 ? "s" : ""} kept - already worked on.`);
                }
                notifyPathsChanged();
              }
            }
          } else if (action.type === "add_mindmap_nodes") {
            // Batch insert: insert all nodes first, then link parent references.
            // Each node is inserted with standalone=false so it's part of a tree.
            const nodes = action.nodes;
            const realIds: (string | null)[] = new Array(nodes.length).fill(null);
            // A new tree goes on the default board, like add_task.
            const board = await defaultPlanningBoard(user.id);

            // Phase 1: insert all nodes
            for (let i = 0; i < nodes.length; i++) {
              const n = nodes[i];
              const { data: inserted, error } = await supabase.from("planning_tasks").insert([{
                user_id: user.id,
                project_id: null,
                board_id: board?.id ?? null,
                parent_id: null,
                level: n.level,
                title: n.title,
                done: false,
                deadline: null,
                leverage: null,
                energy: null,
                time_minutes: null,
                url: null,
                icon: null,
                notes: "",
                standalone: false,
                position_x: null,
                position_y: null,
                mentions: [],
              }]).select("id");
              if (error || !inserted?.[0]?.id) {
                failed++;
              } else {
                realIds[i] = inserted[0].id;
              }
            }

            // Phase 2: link parent references
            for (let i = 0; i < nodes.length; i++) {
              const n = nodes[i];
              if (n.parentIndex != null && n.parentIndex >= 0 && n.parentIndex < nodes.length) {
                const parentId = realIds[n.parentIndex];
                const childId = realIds[i];
                if (parentId && childId) {
                  const { error } = await supabase.from("planning_tasks").update({ parent_id: parentId }).eq("id", childId).eq("user_id", user.id);
                  if (!error) ok++;
                }
              }
            }

            // Count successful top-level inserts (those without write errors in phase 1)
            const created = realIds.filter(id => id !== null).length;
            ok += created;
            if (created > 0) {
              toast.success(`Utworzono mapę „${nodes[0].title}” (${nodesLabel(created)})`, { description: planningPlacement(board) });
            }
            window.dispatchEvent(new CustomEvent(PLANNING_TASKS_CHANGED_EVENT));
          } else if (action.type === "extend_mindmap") {
            // Find an existing node whose title partially matches attachTo (case-insensitive)
            const search = action.attachTo.toLowerCase();
            const { data: existing } = await supabase.from("planning_tasks").select("id,title,project_id,board_id").eq("user_id", user.id).ilike("title", `%${search}%`).limit(5);
            const match = (existing || []).find((t: any) => t.title?.toLowerCase().includes(search));
            const parentId = match?.id || null;
            // New nodes live where the node they hang from lives (its board or
            // its project), like a child added by hand; with no match they
            // become new roots on the default board.
            const board = match ? null : await defaultPlanningBoard(user.id);
            const container = match
              ? { project_id: match.project_id ?? null, board_id: match.board_id ?? null }
              : { project_id: null, board_id: board?.id ?? null };

            const nodes = action.nodes;
            const realIds: (string | null)[] = new Array(nodes.length).fill(null);

            // Phase 1: insert all nodes (if parent found, set parent_id directly for root-of-batch nodes)
            for (let i = 0; i < nodes.length; i++) {
              const n = nodes[i];
              const nodeParentId = n.parentIndex == null ? parentId : null; // only root-of-batch gets the target parent
              const { data: inserted, error } = await supabase.from("planning_tasks").insert([{
                user_id: user.id,
                ...container,
                parent_id: nodeParentId,
                level: n.level,
                title: n.title,
                done: false,
                deadline: null,
                leverage: null,
                energy: null,
                time_minutes: null,
                url: null,
                icon: null,
                notes: "",
                standalone: false,
                position_x: null,
                position_y: null,
                mentions: [],
              }]).select("id");
              if (error || !inserted?.[0]?.id) {
                failed++;
              } else {
                realIds[i] = inserted[0].id;
              }
            }

            // Phase 2: link internal parent references (parentIndex within the batch)
            for (let i = 0; i < nodes.length; i++) {
              const n = nodes[i];
              if (n.parentIndex != null && n.parentIndex >= 0 && n.parentIndex < nodes.length) {
                const batchParentId = realIds[n.parentIndex];
                const childId = realIds[i];
                if (batchParentId && childId) {
                  const { error } = await supabase.from("planning_tasks").update({ parent_id: batchParentId }).eq("id", childId).eq("user_id", user.id);
                  if (!error) ok++;
                }
              }
            }

            const created = realIds.filter(id => id !== null).length;
            ok += created;
            if (created > 0) {
              toast.success(
                match ? `Dopięto ${nodesLabel(created)} pod „${match.title}”` : `Nie znaleziono „${action.attachTo}”, dodano ${nodesLabel(created)} jako nową mapę`,
                match ? undefined : { description: planningPlacement(board) },
              );
            }
            window.dispatchEvent(new CustomEvent(PLANNING_TASKS_CHANGED_EVENT));
          }
        } catch {
          failed++;
        }
      }
      return failed === 0 && ok > 0;
    },
    [user, addMission, applyMissionPreset, completeMission, uncompleteMission, removeMission, saveCustomMissions, completeExternal, addXP, navigate, location.pathname],
  );
  const runActionRef = useRef(runAction);
  useEffect(() => { runActionRef.current = runAction; }, [runAction]);

  // Apply the confirmed actions of one reply, in order. Returns the summary
  // line (also stored on the message) so voice mode can read it out.
  const applyActions = useCallback(
    async (messageId: string): Promise<string | null> => {
      if (!user) return null;
      const msg = messages.find((m) => m.id === messageId);
      if (!msg?.actions || msg.actions.length === 0 || msg.actionsResolved) return null;
      if (claimedRef.current.has(messageId)) return null;
      claimedRef.current.add(messageId);

      // Kept per action so the history records only what really happened.
      const results: boolean[] = [];
      for (const action of msg.actions) {
        results.push(await runActionRef.current(action));
      }
      const ok = results.filter(Boolean).length;
      const failed = results.length - ok;

      const result =
        failed === 0
          ? `Done. Applied ${ok} action${ok === 1 ? "" : "s"}.`
          : `Applied ${ok}, but ${failed} failed. Please try again.`;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, actionsResolved: "applied", actionResult: result, actionResults: results } : m,
        ),
      );
      return result;
    },
    [user, messages],
  );

  const dismissActions = useCallback((messageId: string) => {
    // No-op once the actions were applied, dismissed or are being applied.
    if (claimedRef.current.has(messageId)) return;
    claimedRef.current.add(messageId);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && !m.actionsResolved ? { ...m, actionsResolved: "dismissed" } : m,
      ),
    );
  }, []);

  // Put text in the panel's input without sending it, so the user can finish
  // the sentence. The nonce makes the same text requested twice land twice.
  const [prefillRequest, setPrefillRequest] = useState<{ text: string; nonce: number } | null>(null);
  const prefill = useCallback((text: string) => {
    setPrefillRequest((prev) => ({ text, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  return {
    open,
    setOpen,
    openPanel,
    messages,
    selectedScopes,
    toggleScope,
    setSelectedScopes,
    autoContext,
    setAutoContext,
    autoScopes,
    routing,
    lastModel,
    budgetExceeded,
    archiveItems,
    addArchiveItem,
    removeArchiveItem,
    currentScope,
    setCurrentScope,
    isStreaming,
    sendMessage,
    stop,
    clearConversation,
    applyActions,
    dismissActions,
    prefill,
    prefillRequest,
    voiceRequested,
    clearVoiceRequest,
  };
}

type AssistantApi = ReturnType<typeof useAssistantValue>;

const AssistantContext = createContext<AssistantApi | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const value = useAssistantValue();
  return createElement(AssistantContext.Provider, { value }, children);
}

export function useAssistant(): AssistantApi {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used within an AssistantProvider");
  return ctx;
}

/** Lets a page declare which scope it maps to so the panel can pre-select it. */
export function useAssistantCurrentScope(scope: ScopeId | null) {
  const { setCurrentScope } = useAssistant();
  useEffect(() => {
    setCurrentScope(scope);
  }, [scope, setCurrentScope]);
}
