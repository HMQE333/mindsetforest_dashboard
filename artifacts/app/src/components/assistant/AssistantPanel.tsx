import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Send, Plus, Trash2, Square, Search } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useAssistant } from "@/hooks/useAssistant";
import { useAuth } from "@/hooks/useAuth";
import {
  SCOPES,
  SCOPE_MAP,
  searchArchiveItems,
  type ScopeId,
  type ArchiveItemRef,
} from "@/lib/assistant-context";
import { describeAction } from "@/lib/assistant-actions";
import type { AssistantMessage } from "@/hooks/useAssistant";

function ScopeMenu() {
  const { user } = useAuth();
  const {
    selectedScopes,
    toggleScope,
    currentScope,
    archiveItems,
    addArchiveItem,
    removeArchiveItem,
  } = useAssistant();
  const [archiveQuery, setArchiveQuery] = useState("");
  const [archiveResults, setArchiveResults] = useState<ArchiveItemRef[]>([]);
  const [searching, setSearching] = useState(false);

  const runSearch = useCallback(async () => {
    if (!user) return;
    setSearching(true);
    try {
      const results = await searchArchiveItems(user.id, archiveQuery);
      setArchiveResults(results);
    } catch {
      setArchiveResults([]);
    }
    setSearching(false);
  }, [user, archiveQuery]);

  return (
    <PopoverContent
      align="start"
      sideOffset={8}
      className="w-72 p-3 rounded-2xl bg-card/95 backdrop-blur-xl border border-white/10 shadow-xl max-h-[70vh] overflow-y-auto"
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
        What can I read?
      </p>
      <div className="space-y-1">
        {SCOPES.map((s) => {
          const active = selectedScopes.includes(s.id);
          const isCurrent = currentScope === s.id;
          return (
            <button
              key={s.id}
              onClick={() => toggleScope(s.id)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm transition-all ${
                active
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <span
                className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] flex-shrink-0 ${
                  active ? "border-primary/50 bg-primary/25 text-foreground" : "border-white/20"
                }`}
              >
                {active && "✓"}
              </span>
              <span>{s.icon}</span>
              <span className="flex-1 text-left font-semibold">{s.label}</span>
              {isCurrent && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-bold">
                  this page
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-white/10">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
          📦 Archive items
        </p>
        <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
          The full archive is off by default. Point me at specific notes instead.
        </p>
        {archiveItems.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {archiveItems.map((it) => (
              <span
                key={it.id}
                className="text-[10px] px-2 py-1 rounded-lg bg-muted/60 border border-white/10 flex items-center gap-1"
              >
                <span className="truncate max-w-[110px]">{it.title}</span>
                <button
                  onClick={() => removeArchiveItem(it.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <input
            value={archiveQuery}
            onChange={(e) => setArchiveQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search notes..."
            className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-lg bg-background/60 border border-white/10 focus:outline-none focus:border-primary/40"
          />
          <button
            onClick={runSearch}
            className="p-1.5 rounded-lg bg-muted/50 border border-white/10 text-muted-foreground hover:text-foreground"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </div>
        {searching && <p className="text-[10px] text-muted-foreground mt-1.5 animate-pulse">Searching…</p>}
        {!searching && archiveResults.length > 0 && (
          <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
            {archiveResults.map((r) => {
              const added = archiveItems.some((i) => i.id === r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => addArchiveItem(r)}
                  disabled={added}
                  className="w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground disabled:opacity-40 flex items-center gap-1.5"
                >
                  <Plus className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{r.title}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </PopoverContent>
  );
}

function ActionConfirm({ message }: { message: AssistantMessage }) {
  const { applyActions, dismissActions } = useAssistant();
  const [applying, setApplying] = useState(false);
  const actions = message.actions;
  if (!actions || actions.length === 0) return null;

  if (message.actionsResolved === "applied") {
    return (
      <div className="mt-2 text-[11px] px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-foreground/80">
        ✓ {message.actionResult || "Applied."}
      </div>
    );
  }
  if (message.actionsResolved === "dismissed") {
    return (
      <div className="mt-2 text-[11px] px-3 py-2 rounded-xl bg-muted/40 border border-white/10 text-muted-foreground">
        Dismissed — nothing was saved.
      </div>
    );
  }

  const handleApply = async () => {
    setApplying(true);
    await applyActions(message.id);
    setApplying(false);
  };

  return (
    <div className="mt-2 rounded-xl bg-primary/8 border border-primary/25 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-primary mb-2">
        Confirm {actions.length === 1 ? "action" : `${actions.length} actions`}
      </p>
      <ul className="space-y-1 mb-3">
        {actions.map((a, i) => (
          <li key={i} className="text-xs text-foreground/85 flex items-start gap-1.5">
            <span className="text-primary mt-0.5">•</span>
            <span>{describeAction(a)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <button
          onClick={handleApply}
          disabled={applying}
          className="flex-1 text-xs font-semibold px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground disabled:opacity-50 transition-opacity"
        >
          {applying ? "Applying…" : "Apply"}
        </button>
        <button
          onClick={() => dismissActions(message.id)}
          disabled={applying}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-muted/50 border border-white/10 text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  "Summarize my progress this week",
  "What should I focus on today?",
  "How is my streak looking?",
];

export default function AssistantPanel() {
  const { user } = useAuth();
  const {
    open,
    setOpen,
    openPanel,
    messages,
    selectedScopes,
    currentScope,
    archiveItems,
    isStreaming,
    sendMessage,
    stop,
    clearConversation,
  } = useAssistant();
  const [input, setInput] = useState("");
  const [scopeOpen, setScopeOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  if (!user) return null;

  const handleSend = () => {
    const text = input;
    setInput("");
    sendMessage(text);
  };

  const activeScopeCount = selectedScopes.length + archiveItems.length;

  return (
    <>
      {/* Collapsed launcher */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={openPanel}
            className="fixed bottom-5 right-5 z-[9998] flex items-center gap-2 px-4 py-3 rounded-2xl gradient-purple text-primary-foreground font-bold glow-md hover:-translate-y-0.5 transition-transform"
            title="Ask the assistant"
          >
            <Sparkles className="w-5 h-5" />
            <span className="hidden sm:inline text-sm">Assistant</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <>
            {/* Mobile backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm sm:hidden"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 z-[9999] w-full sm:w-[380px] flex flex-col bg-card/95 backdrop-blur-2xl border-l border-white/10 shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary/15 border border-primary/25">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-foreground leading-tight">Assistant</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Answers from your data
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {messages.length > 0 && (
                    <button
                      onClick={clearConversation}
                      className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                      title="Clear conversation"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                    title="Collapse"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Scope bar */}
              <div className="px-3 py-2 border-b border-white/10 flex items-center gap-1.5 flex-wrap">
                <Popover open={scopeOpen} onOpenChange={setScopeOpen}>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-muted/50 border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
                      <Plus className="w-3 h-3" />
                      Context
                    </button>
                  </PopoverTrigger>
                  <ScopeMenu />
                </Popover>
                {selectedScopes.map((s: ScopeId) => (
                  <span
                    key={s}
                    className="text-[10px] px-2 py-1 rounded-lg bg-primary/12 border border-primary/25 text-foreground/80 flex items-center gap-1"
                  >
                    {SCOPE_MAP[s].icon} {SCOPE_MAP[s].label}
                  </span>
                ))}
                {archiveItems.map((it) => (
                  <span
                    key={it.id}
                    className="text-[10px] px-2 py-1 rounded-lg bg-primary/12 border border-primary/25 text-foreground/80 flex items-center gap-1"
                  >
                    📦 <span className="truncate max-w-[90px]">{it.title}</span>
                  </span>
                ))}
                {activeScopeCount === 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    No context selected — I'll use {currentScope ? SCOPE_MAP[currentScope]?.label : "the dashboard"}.
                  </span>
                )}
              </div>

              {/* Messages */}
              <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center py-10">
                    <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center bg-primary/10 border border-primary/20 mb-3">
                      <Sparkles className="w-6 h-6 text-primary" />
                    </div>
                    <p className="text-sm font-semibold text-foreground mb-1">Ask about your quest</p>
                    <p className="text-xs text-muted-foreground mb-4 leading-relaxed px-2">
                      I answer using only the data you allow via the Context menu above.
                    </p>
                    <div className="space-y-1.5">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => sendMessage(s)}
                          className="w-full text-left text-xs px-3 py-2 rounded-xl bg-muted/40 border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 transition-all"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m) => (
                  <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div className={m.role === "user" ? "max-w-[85%]" : "max-w-[92%] w-full"}>
                      <div
                        className={`px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                          m.role === "user"
                            ? "gradient-purple text-primary-foreground rounded-br-md"
                            : m.error
                              ? "bg-destructive/10 border border-destructive/30 text-foreground rounded-bl-md"
                              : "bg-muted/40 border border-white/10 text-foreground rounded-bl-md"
                        }`}
                      >
                        {m.content || (isStreaming ? <span className="animate-pulse text-muted-foreground">Thinking…</span> : "")}
                      </div>
                      {m.role === "assistant" && m.citations && m.citations.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <span className="text-[9px] text-muted-foreground self-center">Sources:</span>
                          {m.citations.map((c) => (
                            <span
                              key={c.key}
                              className="text-[9px] px-1.5 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-foreground/70 flex items-center gap-1"
                            >
                              <span>{c.icon}</span>
                              <span className="truncate max-w-[100px]">{c.label}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {m.role === "assistant" && <ActionConfirm message={m} />}
                    </div>
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="px-3 py-3 border-t border-white/10">
                <div className="flex items-end gap-2 rounded-2xl bg-background/60 border border-white/10 px-2.5 py-2 focus-within:border-primary/40 transition-colors">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Ask about your data…"
                    rows={1}
                    className="flex-1 resize-none bg-transparent text-sm focus:outline-none max-h-28 py-1 text-foreground placeholder:text-muted-foreground"
                  />
                  {isStreaming ? (
                    <button
                      onClick={stop}
                      className="p-2 rounded-xl bg-muted/60 text-foreground hover:bg-muted transition-colors flex-shrink-0"
                      title="Stop"
                    >
                      <Square className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={!input.trim()}
                      className="p-2 rounded-xl gradient-purple text-primary-foreground disabled:opacity-40 transition-opacity flex-shrink-0"
                      title="Send"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
