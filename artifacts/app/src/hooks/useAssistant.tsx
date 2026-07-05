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
import {
  gatherContext,
  type ScopeId,
  type ArchiveItemRef,
  type Citation,
} from "@/lib/assistant-context";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  error?: boolean;
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
        );

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
            context,
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
          patchAssistant((m) => ({ ...m, citations }));
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
