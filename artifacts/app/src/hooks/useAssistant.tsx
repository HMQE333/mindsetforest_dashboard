import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  createElement,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardState } from "@/hooks/useDashboardState";
import { PLANNING_TASKS_CHANGED_EVENT } from "@/hooks/usePlanningState";
import {
  gatherContext,
  type ScopeId,
  type ArchiveItemRef,
  type Citation,
} from "@/lib/assistant-context";
import {
  buildActionInstructions,
  parseActions,
  type AssistantAction,
} from "@/lib/assistant-actions";
import { ARCHIVE_BLOCKS_CHANGED_EVENT } from "@/lib/archive-data";

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
}

const OPEN_KEY = "assistant_panel_open";
const MSG_KEY = "assistant_messages";
const SCOPE_KEY = "assistant_scopes";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

function loadMessages(): AssistantMessage[] {
  try {
    const raw = sessionStorage.getItem(MSG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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

function useAssistantValue() {
  const { user } = useAuth();
  const { addMission } = useDashboardState();
  const [open, setOpenState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [messages, setMessages] = useState<AssistantMessage[]>(loadMessages);
  const [selectedScopes, setSelectedScopes] = useState<ScopeId[]>(loadScopes);
  const [archiveItems, setArchiveItems] = useState<ArchiveItemRef[]>([]);
  const [currentScope, setCurrentScope] = useState<ScopeId | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Persist panel open/closed across reloads.
  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
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
    setSelectedScopes((prev) => (prev.length > 0 ? prev : [currentScope || "dashboard"]));
  }, [currentScope]);

  const openPanel = useCallback(() => {
    ensureDefaultScope();
    setOpen(true);
  }, [ensureDefaultScope, setOpen]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming || !user) return;

      const scopesForSend = selectedScopes.length > 0 ? selectedScopes : [currentScope || "dashboard"];
      const historyForSend = messages
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role, content: m.content }));

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

      try {
        const { text: context, citations } = await gatherContext(
          user.id,
          scopesForSend,
          archiveItems,
          trimmed,
        );

        // Inject action-protocol instructions for whatever writable scopes the
        // user granted. This rides on the existing edge function (which embeds
        // `context` in the system prompt) so it works without a redeploy.
        const actionInstructions = buildActionInstructions(scopesForSend);
        const contextWithActions = actionInstructions
          ? `${context}\n\n${actionInstructions}`
          : context;

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token || SUPABASE_KEY;

        const controller = new AbortController();
        abortRef.current = controller;

        const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant-chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: trimmed,
            history: historyForSend,
            context: contextWithActions,
            scopes: scopesForSend,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          if (res.status === 404) {
            throw new Error(
              "The assistant isn't available yet. The 'ai-assistant-chat' function needs to be deployed to Supabase before it can answer.",
            );
          }
          if (res.status === 429) throw new Error("Rate limit reached. Please try again in a moment.");
          if (res.status === 402) throw new Error("AI credits are exhausted. Please add credits in Supabase.");
          throw new Error("The assistant could not be reached. Please try again.");
        }

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
                patchAssistant((m) => ({ ...m, content: acc }));
              }
            } catch {
              /* ignore malformed chunk */
            }
          }
        }

        if (!acc.trim()) {
          patchAssistant((m) => ({
            ...m,
            content: "I couldn't produce an answer this time. Please try rephrasing.",
          }));
        } else {
          // Pull any proposed write actions out of the reply and gate them by the
          // scopes the user actually granted for this message.
          const { text: display, actions } = parseActions(acc, scopesForSend);
          patchAssistant((m) => ({
            ...m,
            content: display || acc,
            citations,
            actions: actions.length > 0 ? actions : undefined,
          }));
        }
      } catch (e) {
        const msg =
          e instanceof Error && e.name === "AbortError"
            ? "Stopped."
            : e instanceof Error
              ? e.message
              : "Something went wrong.";
        patchAssistant((m) => ({ ...m, content: msg, error: true }));
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, user, selectedScopes, currentScope, messages, archiveItems],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Execute the confirmed write actions via the existing state hooks / tables.
  // Runs in order and reports how many succeeded so partial failures are visible.
  const applyActions = useCallback(
    async (messageId: string) => {
      if (!user) return;
      const msg = messages.find((m) => m.id === messageId);
      if (!msg?.actions || msg.actions.length === 0 || msg.actionsResolved) return;

      let ok = 0;
      let failed = 0;
      for (const action of msg.actions) {
        try {
          if (action.type === "add_mission") {
            addMission(action.categoryId, {
              title: action.title,
              description: action.description || "",
              duration: action.duration || "",
              xp: action.xp ?? 20,
            });
            ok++;
          } else if (action.type === "add_task") {
            const { error } = await (supabase.from("planning_tasks" as never) as never as {
              insert: (rows: unknown[]) => Promise<{ error: unknown }>;
            }).insert([
              {
                user_id: user.id,
                project_id: null,
                board_id: null,
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
          } else if (action.type === "add_mindmap_nodes") {
            // Batch insert: insert all nodes first, then link parent references.
            // Each node is inserted with standalone=false so it's part of a tree.
            const nodes = action.nodes;
            const realIds: (string | null)[] = new Array(nodes.length).fill(null);

            // Phase 1: insert all nodes
            for (let i = 0; i < nodes.length; i++) {
              const n = nodes[i];
              const { data: inserted, error } = await (supabase.from("planning_tasks" as never) as never as {
                insert: (rows: unknown[]) => Promise<{ data: { id: string }[] | null; error: unknown }>;
              }).insert([{
                user_id: user.id,
                project_id: null,
                board_id: null,
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
                  const { error } = await (supabase.from("planning_tasks" as never) as never as {
                    update: (patch: unknown) => Promise<{ eq: (col: string, val: string) => Promise<{ error: unknown }> }>;
                  }).update({ parent_id: parentId }).eq("id", childId).eq("user_id", user.id);
                  if (!error) ok++;
                }
              }
            }

            // Count successful top-level inserts (those without write errors in phase 1)
            ok += realIds.filter(id => id !== null).length;
            window.dispatchEvent(new CustomEvent(PLANNING_TASKS_CHANGED_EVENT));
          } else if (action.type === "extend_mindmap") {
            // Find an existing node whose title partially matches attachTo (case-insensitive)
            const search = action.attachTo.toLowerCase();
            const { data: existing } = await (supabase.from("planning_tasks" as never) as never as {
              select: (cols: string) => Promise<{ data: { id: string; title: string }[] | null; error: unknown }>;
            }).select("id,title").eq("user_id", user.id).ilike("title", `%${search}%`).limit(5);
            const match = (existing || []).find((t: any) => t.title?.toLowerCase().includes(search));
            const parentId = match?.id || null;

            const nodes = action.nodes;
            const realIds: (string | null)[] = new Array(nodes.length).fill(null);

            // Phase 1: insert all nodes (if parent found, set parent_id directly for root-of-batch nodes)
            for (let i = 0; i < nodes.length; i++) {
              const n = nodes[i];
              const nodeParentId = n.parentIndex == null ? parentId : null; // only root-of-batch gets the target parent
              const { data: inserted, error } = await (supabase.from("planning_tasks" as never) as never as {
                insert: (rows: unknown[]) => Promise<{ data: { id: string }[] | null; error: unknown }>;
              }).insert([{
                user_id: user.id,
                project_id: null,
                board_id: null,
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
                  const { error } = await (supabase.from("planning_tasks" as never) as never as {
                    update: (patch: unknown) => Promise<{ eq: (col: string, val: string) => Promise<{ error: unknown }> }>;
                  }).update({ parent_id: batchParentId }).eq("id", childId).eq("user_id", user.id);
                  if (!error) ok++;
                }
              }
            }

            ok += realIds.filter(id => id !== null).length;
            window.dispatchEvent(new CustomEvent(PLANNING_TASKS_CHANGED_EVENT));
          }
        } catch {
          failed++;
        }
      }

      const result =
        failed === 0
          ? `Done. Applied ${ok} action${ok === 1 ? "" : "s"}.`
          : `Applied ${ok}, but ${failed} failed. Please try again.`;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, actionsResolved: "applied", actionResult: result } : m,
        ),
      );
    },
    [user, messages, addMission],
  );

  const dismissActions = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, actionsResolved: "dismissed" } : m,
      ),
    );
  }, []);

  return {
    open,
    setOpen,
    openPanel,
    messages,
    selectedScopes,
    toggleScope,
    setSelectedScopes,
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
