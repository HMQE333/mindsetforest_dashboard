import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Plus, Trash2, Square, Search, Mic, MicOff, Headphones, PhoneOff, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useAssistant } from "@/hooks/useAssistant";
import { useAuth } from "@/hooks/useAuth";
import { useIsWatch } from "@/hooks/useIsWatch";
import {
  SCOPES,
  SCOPE_MAP,
  searchArchiveItems,
  type ScopeId,
  type ArchiveItemRef,
} from "@/lib/assistant-context";
import { describeAction, mindmapPreview } from "@/lib/assistant-actions";
import { processVoiceTranscript } from "@/lib/voice-format";
import { pickRecorderMime, transcribeBlob } from "@/lib/transcribe";
import { useVoiceMode } from "@/hooks/useVoiceMode";
import { VOICE_PROMPTS, isStopPhrase, parseYesNo, voiceLabel, type VoiceLang } from "@/lib/voice-mode";
import { prettyModelName } from "@/lib/assistant-api";
import { robotSignal } from "@/lib/assistant-robot";
import AssistantRobot from "./AssistantRobot";
import type { AssistantMessage } from "@/hooks/useAssistant";

function ScopeMenu({ isWatch }: { isWatch: boolean }) {
  const { user } = useAuth();
  const {
    selectedScopes,
    toggleScope,
    currentScope,
    archiveItems,
    addArchiveItem,
    removeArchiveItem,
    autoContext,
    setAutoContext,
    autoScopes,
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
      collisionPadding={8}
      className={`${isWatch ? "w-[min(88vw,224px)] p-2" : "w-72 p-3"} rounded-2xl bg-card/95 backdrop-blur-xl border border-white/10 shadow-xl max-h-[70vh] overflow-y-auto z-[9999]`}
    >
      <button
        type="button"
        onClick={() => setAutoContext(!autoContext)}
        role="switch"
        aria-checked={autoContext}
        className={`w-full flex items-center gap-2 px-2.5 py-2 mb-2 rounded-xl text-sm transition-all border ${
          autoContext
            ? "bg-primary/15 border-primary/30 text-foreground"
            : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5"
        }`}
      >
        <Wand2 className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1 text-left font-semibold">Auto-context</span>
        <span className={`w-8 h-4 rounded-full relative transition-colors flex-shrink-0 ${autoContext ? "bg-primary/70" : "bg-white/15"}`}>
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${autoContext ? "left-4" : "left-0.5"}`} />
        </span>
      </button>
      {!isWatch && (
        <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
          {autoContext
            ? "I pick the sections each question needs. Tick any below to pin it for every question."
            : "Only the sections you tick below are read."}
        </p>
      )}
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
        {autoContext ? "Pinned sections" : "What can I read?"}
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
              <span className="flex-1 text-left font-semibold truncate">{s.label}</span>
              {isCurrent && !isWatch && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-bold flex-shrink-0">
                  this page
                </span>
              )}
              {autoContext && !active && autoScopes.includes(s.id) && !isWatch && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-muted-foreground font-bold flex-shrink-0">
                  auto
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
        {!isWatch && (
          <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
            The full archive is off by default. Point me at specific notes instead.
          </p>
        )}
        {archiveItems.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {archiveItems.map((it) => (
              <span
                key={it.id}
                className="text-[10px] px-2 py-1 rounded-lg bg-muted/60 border border-white/10 flex items-center gap-1"
              >
                <span className="truncate max-w-[90px]">{it.title}</span>
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
            className="p-1.5 rounded-lg bg-muted/50 border border-white/10 text-muted-foreground hover:text-foreground flex-shrink-0"
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
        Dismissed. Nothing was saved.
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
        {actions.map((a, i) => {
          const preview = mindmapPreview(a);
          return (
          <li key={i} className="text-xs text-foreground/85">
            <div className="flex items-start gap-1.5">
              <span className="text-primary mt-0.5">•</span>
              <span>{describeAction(a)}</span>
            </div>
            {preview && (
              <div className="ml-4 mt-1 text-[10px] text-muted-foreground font-mono whitespace-pre-wrap bg-black/20 rounded-lg px-2 py-1.5 border border-white/5 max-h-32 overflow-y-auto">
                {preview}
              </div>
            )}
          </li>
        )})}
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
  { icon: "📊", label: "Summarize my progress this week" },
  { icon: "🎯", label: "What should I focus on today?" },
  { icon: "🔄", label: "Analyze my habit consistency" },
  { icon: "💰", label: "Review my finances this month" },
  { icon: "❤️", label: "How's my health trending?" },
  { icon: "📅", label: "Plan my next 7 days" },
  { icon: "📦", label: "What's in my archive about productivity?" },
  { icon: "🏆", label: "Generate a new mission for me" },
  { icon: "😴", label: "How's my sleep and recovery?" },
  { icon: "🏷️", label: "What are my most used tags?" },
  { icon: "🔥", label: "How's my streak going?" },
  { icon: "🧘", label: "Summarize my breathing practice" },
  { icon: "✍️", label: "Save a quick note (e.g. \"save: idea about X\")" },
  { icon: "🧘", label: "Włącz preset Monk mode" },
  { icon: "✅", label: "Zrobiłem dzisiejszą misję z Body" },
  { icon: "🧭", label: "Otwórz statystyki" },
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
    applyActions,
    dismissActions,
    autoContext,
    autoScopes,
    routing,
    lastModel,
    budgetExceeded,
    prefillRequest,
    voiceRequested,
    clearVoiceRequest,
  } = useAssistant();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef("");
  const lastChunkRef = useRef("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const isWatch = useIsWatch();

  // Hands-free conversation: the reply is read out; proposed actions are
  // confirmed with a spoken yes/no; "koniec" / "bye" ends it.
  const awaitingConfirmRef = useRef<string | null>(null);
  const sendRef = useRef(sendMessage);
  const applyRef = useRef(applyActions);
  const dismissRef = useRef(dismissActions);
  useEffect(() => {
    sendRef.current = sendMessage;
    applyRef.current = applyActions;
    dismissRef.current = dismissActions;
  }, [sendMessage, applyActions, dismissActions]);
  const voiceLangRef = useRef<VoiceLang>("pl-PL");
  const voiceActiveRef = useRef(false);
  const onUtterance = useCallback(async (text: string) => {
    const prompts = VOICE_PROMPTS[voiceLangRef.current];
    if (isStopPhrase(text)) {
      awaitingConfirmRef.current = null;
      return { text: prompts.bye, end: true };
    }
    const pendingId = awaitingConfirmRef.current;
    if (pendingId) {
      const yn = parseYesNo(text, voiceLangRef.current);
      if (yn === "yes") {
        awaitingConfirmRef.current = null;
        const result = await applyRef.current(pendingId);
        return result ? prompts.applied : prompts.error;
      }
      if (yn === "no") {
        awaitingConfirmRef.current = null;
        dismissRef.current(pendingId);
        return prompts.dismissed;
      }
      return prompts.unclear;
    }
    const reply = await sendRef.current(text, { voice: true });
    // The user may have ended voice mode while the request was in flight;
    // never arm a spoken confirm for a session that is over.
    if (!voiceActiveRef.current) return null;
    if (!reply) return prompts.error;
    if (reply.error) return reply.content;
    if (reply.actions && reply.actions.length > 0) {
      awaitingConfirmRef.current = reply.id;
      return `${reply.content} ${prompts.confirm}`;
    }
    return reply.content;
  }, []);
  const voice = useVoiceMode({
    onUtterance,
    onEnd: (reason) => {
      awaitingConfirmRef.current = null;
      if (reason === "silence") toast(VOICE_PROMPTS[voiceLangRef.current].nothing);
      if (reason === "error") toast.error("Voice mode is not available here. Use Chrome, Edge or Safari and allow the microphone.");
    },
  });
  useEffect(() => { voiceLangRef.current = voice.lang; }, [voice.lang]);
  // What the robot shows: thinking while an answer is coming, and a reaction to the latest reply.
  const robot = useMemo(
    () => robotSignal(messages, isStreaming, voice.active && voice.phase === "thinking"),
    [messages, isStreaming, voice.active, voice.phase],
  );
  useEffect(() => { voiceActiveRef.current = voice.active; }, [voice.active]);
  // The spoken confirm waits on one reply. Once that reply's actions are
  // settled some other way (Apply or Dismiss clicked, chat cleared), a later
  // "tak" must go to the conversation, not to a card that is gone.
  useEffect(() => {
    const pendingId = awaitingConfirmRef.current;
    if (!pendingId) return;
    const pending = messages.find((m) => m.id === pendingId);
    if (!pending || pending.actionsResolved) awaitingConfirmRef.current = null;
  }, [messages]);
  const startVoice = () => {
    if (!voice.supported) {
      toast.error("This browser has no speech recognition. Use Chrome, Edge or Safari.");
      return;
    }
    awaitingConfirmRef.current = null;
    voiceActiveRef.current = true;
    voice.start();
  };
  const toggleVoiceMode = () => {
    if (voice.active) {
      voice.stop();
      return;
    }
    startVoice();
  };

  // A `?assistant=voice` link asked for the conversation. A page opened from
  // a link may not use the microphone or play sound before the first tap, so
  // unless the browser already allows it, the panel shows one big "Tap to
  // talk" (a shortcut app can tap it too, e.g. MacroDroid's UI Interaction).
  const [tapToTalk, setTapToTalk] = useState(false);
  useEffect(() => {
    if (!voiceRequested || !open) return;
    clearVoiceRequest();
    if (voice.active) return;
    const activated = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive === true;
    if (activated) startVoice();
    else setTapToTalk(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceRequested, open]);
  useEffect(() => { if (!open) setTapToTalk(false); }, [open]);

  useEffect(() => {
    // An empty chat stays at the top, where the robot and the welcome are.
    if (listRef.current && messages.length > 0) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Keep inputRef in sync for voice formatting (needs current value synchronously).
  useEffect(() => { inputRef.current = input; }, [input]);

  // An entry point elsewhere in the app asked for text to be typed in for the
  // user (see `prefill`). Fill the input and put the caret at its end.
  useEffect(() => {
    if (!prefillRequest) return;
    setInput(prefillRequest.text);
    const frame = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [prefillRequest]);

  const handleSend = () => {
    const text = input;
    setInput("");
    sendMessage(text);
  };

  // Apply a transcribed+formatted chunk to the input, handling control commands.
  const applyVoiceResult = useCallback((text: string, command: "pause" | "undo" | "clear" | null) => {
    if (command === "clear") {
      setInput("");
      lastChunkRef.current = "";
      return;
    }
    if (command === "undo") {
      setInput((p) => {
        const lc = lastChunkRef.current;
        if (lc && p.endsWith(lc)) return p.slice(0, p.length - lc.length).trimEnd();
        return p;
      });
      lastChunkRef.current = "";
      return;
    }
    if (text) {
      lastChunkRef.current = text;
      setInput((p) => (p.trim() ? p.trimEnd() + " " + text : text));
    }
  }, []);

  // Send a recorded audio blob to the ai-transcribe edge function (GPT-4o
  // Transcribe via OpenRouter), then format + append the result.
  const transcribeAndAppend = useCallback(async (blob: Blob) => {
    setTranscribing(true);
    try {
      const rawText = await transcribeBlob(blob);
      if (!rawText.trim()) {
        toast.error("Couldn't hear anything. Try again");
        return;
      }
      const { text, command } = processVoiceTranscript(rawText, inputRef.current);
      applyVoiceResult(text, command);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setTranscribing(false);
    }
  }, [applyVoiceResult]);

  const toggleVoice = useCallback(async () => {
    // Stop an in-progress recording.
    if (listening) {
      mediaRecorderRef.current?.stop();
      return;
    }
    // Start recording.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Microphone access denied");
      return;
    }
    try {
      const mimeType = pickRecorderMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: rec.mimeType || mimeType });
        await transcribeAndAppend(blob);
      };
      rec.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        toast.error("Recording failed");
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      // Access was granted, so the recorder itself failed (e.g. no webm
      // support). Release the microphone, or it stays on with nothing recording.
      stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
      toast.error("Could not start recording in this browser");
    }
  }, [listening, transcribeAndAppend]);

  useEffect(() => {
    return () => mediaRecorderRef.current?.stop();
  }, []);

  // All hooks are above this line. Early return must come after every hook to
  // keep the hook count stable across renders (React invariant #310).
  if (!user) return null;

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
            className={`fixed z-[9998] rounded-full drop-shadow-[0_6px_18px_rgba(139,92,246,0.55)] hover:drop-shadow-[0_8px_24px_rgba(139,92,246,0.75)] transition-[filter] ${isWatch ? "bottom-2 right-2" : "bottom-5 right-5"}`}
            title="Ask the assistant"
            aria-label="Open the assistant"
          >
            <AssistantRobot size={isWatch ? 32 : 56} mood={robot.mood} reaction={robot.reaction} allowJump jumpOnHover />
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
              className={`fixed top-0 right-0 bottom-0 z-[9999] w-full ${isWatch ? "" : "sm:w-[380px]"} flex flex-col bg-card/95 backdrop-blur-2xl border-l border-white/10 shadow-2xl`}
            >
              {tapToTalk && (
                <div className="absolute inset-0 z-20 flex flex-col bg-card/95 backdrop-blur-2xl">
                  <button
                    onClick={() => { setTapToTalk(false); startVoice(); }}
                    className="flex-1 flex flex-col items-center justify-center gap-4 text-foreground"
                  >
                    <span className="w-28 h-28 rounded-full gradient-purple glow-sm flex items-center justify-center animate-pulse">
                      <Mic className="w-12 h-12 text-primary-foreground" />
                    </span>
                    <span className="text-2xl font-bold">Tap to talk</span>
                    <span className="text-xs text-muted-foreground max-w-[240px] text-center">
                      Tap anywhere. The browser needs one tap before it can listen and speak.
                    </span>
                  </button>
                  <button
                    onClick={() => setTapToTalk(false)}
                    className="py-4 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Type instead
                  </button>
                </div>
              )}
              {/* Header */}
              <div className={`flex items-center justify-between gap-1.5 border-b border-white/10 ${isWatch ? "px-2 py-1.5" : "px-4 py-3"}`}>
                <div className="flex items-center gap-1.5 min-w-0">
                  <AssistantRobot size={isWatch ? 20 : 32} mood={robot.mood} reaction={robot.reaction} />
                  {!isWatch && (
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-foreground leading-tight truncate">Assistant</p>
                      <p className="text-[10px] text-muted-foreground leading-tight truncate">
                        {voice.active
                          ? voice.phase === "listening"
                            ? "Listening…"
                            : voice.phase === "speaking"
                              ? "Speaking…"
                              : "Thinking…"
                          : lastModel
                            ? prettyModelName(lastModel)
                            : "Answers from your data"}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={toggleVoiceMode}
                    className={`rounded-lg transition-colors ${isWatch ? "p-1" : "p-2"} ${
                      voice.active ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    }`}
                    title={voice.active ? "End voice conversation" : "Voice conversation (hands-free)"}
                    aria-pressed={voice.active}
                  >
                    {voice.active ? <PhoneOff className={isWatch ? "w-3 h-3" : "w-4 h-4"} /> : <Headphones className={isWatch ? "w-3 h-3" : "w-4 h-4"} />}
                  </button>
                  {messages.length > 0 && (
                    <button
                      onClick={clearConversation}
                      className={`rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors ${isWatch ? "p-1" : "p-2"}`}
                      title="Clear conversation"
                    >
                      <Trash2 className={isWatch ? "w-3 h-3" : "w-4 h-4"} />
                    </button>
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    className={`rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors ${isWatch ? "p-1" : "p-2"}`}
                    title="Collapse"
                  >
                    <X className={isWatch ? "w-3 h-3" : "w-4 h-4"} />
                  </button>
                </div>
              </div>

              {/* Scope bar */}
              <div className={`border-b border-white/10 flex items-center flex-wrap ${isWatch ? "px-1.5 py-1 gap-1" : "px-3 py-2 gap-1.5"}`}>
                <Popover open={scopeOpen} onOpenChange={setScopeOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className={`flex items-center gap-1 font-semibold rounded-lg bg-muted/50 border border-white/10 text-muted-foreground hover:text-foreground transition-colors ${
                        isWatch ? "text-[9px] px-1.5 py-1" : "text-[11px] px-2.5 py-1.5"
                      }`}
                    >
                      <Plus className={isWatch ? "w-2.5 h-2.5" : "w-3 h-3"} />
                      {!isWatch && "Context"}
                    </button>
                  </PopoverTrigger>
                  <ScopeMenu isWatch={isWatch} />
                </Popover>
                {!isWatch &&
                  selectedScopes.map((s: ScopeId) => (
                    <span
                      key={s}
                      className="text-[10px] px-2 py-1 rounded-lg bg-primary/12 border border-primary/25 text-foreground/80 flex items-center gap-1"
                    >
                      {SCOPE_MAP[s].icon} {SCOPE_MAP[s].label}
                    </span>
                  ))}
                {!isWatch &&
                  autoContext &&
                  autoScopes
                    .filter((s) => !selectedScopes.includes(s))
                    .map((s: ScopeId) => (
                      <span
                        key={`auto-${s}`}
                        title="Picked automatically for the last question"
                        className="text-[10px] px-2 py-1 rounded-lg border border-dashed border-primary/40 text-foreground/70 flex items-center gap-1"
                      >
                        {SCOPE_MAP[s].icon} {SCOPE_MAP[s].label}
                      </span>
                    ))}
                {!isWatch && routing && (
                  <span className="text-[10px] text-primary animate-pulse">Choosing context…</span>
                )}
                {!isWatch &&
                  archiveItems.map((it) => (
                    <span
                      key={it.id}
                      className="text-[10px] px-2 py-1 rounded-lg bg-primary/12 border border-primary/25 text-foreground/80 flex items-center gap-1"
                    >
                      📦 <span className="truncate max-w-[90px]">{it.title}</span>
                    </span>
                  ))}
                {isWatch && activeScopeCount > 0 && (
                  <span className="text-[9px] px-1.5 py-1 rounded-lg bg-primary/12 border border-primary/25 text-foreground/80">
                    {activeScopeCount} selected
                  </span>
                )}
                {activeScopeCount === 0 && autoScopes.length === 0 && !routing && !isWatch && (
                  <span className="text-[10px] text-muted-foreground">
                    {autoContext
                      ? "Auto: I'll pick the sections your question needs."
                      : `No context selected. I'll use ${currentScope ? SCOPE_MAP[currentScope]?.label : "the dashboard"}.`}
                  </span>
                )}
                {activeScopeCount === 0 && isWatch && (
                  <span className="text-[9px] text-muted-foreground truncate">
                    {currentScope ? SCOPE_MAP[currentScope]?.label : "dashboard"}
                  </span>
                )}
              </div>

              {/* Voice conversation status */}
              {voice.active && (
                <div className={`border-b border-white/10 flex items-center gap-2 ${isWatch ? "px-2 py-1" : "px-3 py-2"}`}>
                  <span
                    title={voice.provider === "elevenlabs" ? "Voice: ElevenLabs" : voice.provider === "browser" ? "Voice: browser" : undefined}
                    className={`w-2 h-2 rounded-full flex-shrink-0 animate-pulse ${
                      voice.phase === "listening" ? "bg-red-400" : voice.phase === "speaking" ? "bg-primary" : "bg-amber-400"
                    }`}
                  />
                  <span className="flex-1 min-w-0 text-[11px] text-muted-foreground truncate">
                    {voice.interim ||
                      (voice.phase === "listening"
                        ? voice.lang === "pl-PL" ? "Słucham…" : "Listening…"
                        : voice.phase === "speaking"
                          ? voice.lang === "pl-PL" ? "Mówię…" : "Speaking…"
                          : voice.lang === "pl-PL" ? "Myślę…" : "Thinking…")}
                  </span>
                  {voice.phase === "speaking" && (
                    <button
                      onClick={voice.interrupt}
                      className="text-[10px] px-2 py-1 rounded-lg bg-muted/50 border border-white/10 text-muted-foreground hover:text-foreground"
                    >
                      {voice.lang === "pl-PL" ? "Przerwij" : "Interrupt"}
                    </button>
                  )}
                  {voice.voices.length > 0 && (
                    <>
                      <select
                        value={voice.voiceId ?? ""}
                        onChange={(e) => voice.setVoiceId(e.target.value || null)}
                        className="text-[10px] max-w-[7.5rem] px-1.5 py-1 rounded-lg bg-muted/50 border border-white/10 text-muted-foreground"
                        title="Voice"
                        aria-label="Voice"
                      >
                        <option value="">{voice.lang === "pl-PL" ? "Głos domyślny" : "Default voice"}</option>
                        {voice.voices.map((v) => (
                          <option key={v.id} value={v.id}>{voiceLabel(v)}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => void voice.preview()}
                        className="text-[10px] px-2 py-1 rounded-lg bg-muted/50 border border-white/10 text-muted-foreground hover:text-foreground"
                        title={voice.lang === "pl-PL" ? "Posłuchaj tego głosu" : "Preview this voice"}
                      >
                        ▶
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => voice.setLang(voice.lang === "pl-PL" ? "en-US" : "pl-PL")}
                    className="text-[10px] px-2 py-1 rounded-lg bg-muted/50 border border-white/10 text-muted-foreground hover:text-foreground"
                    title="Speech recognition language"
                  >
                    {voice.lang === "pl-PL" ? "PL" : "EN"}
                  </button>
                  <button
                    onClick={voice.stop}
                    className="text-[10px] px-2 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 hover:text-red-200"
                  >
                    Stop
                  </button>
                </div>
              )}

              {/* Messages */}
              <div ref={listRef} className={`flex-1 overflow-y-auto space-y-3 ${isWatch ? "px-2 py-2" : "px-4 py-4 space-y-4"}`}>
                {messages.length === 0 && (
                  <div className={isWatch ? "text-center py-4" : "text-center py-10"}>
                    <AssistantRobot
                      size={isWatch ? 36 : 72}
                      className={`mx-auto ${isWatch ? "mb-2" : "mb-4 mt-6"}`}
                      allowJump
                      jumpOnClick
                      greet
                    />
                    <p className={`font-semibold text-foreground mb-1 ${isWatch ? "text-[11px]" : "text-sm"}`}>Ask about your quest</p>
                    {!isWatch && (
                      <p className="text-xs text-muted-foreground mb-4 leading-relaxed px-2">
                        I read the sections your question needs (auto-context) and can operate the app: open sections,
                        tick missions, load presets, add missions and notes. The headphones start a hands-free conversation.
                      </p>
                    )}
                    <div className="grid grid-cols-1 gap-1.5">
                      {(isWatch ? SUGGESTIONS.slice(0, 1) : SUGGESTIONS).map((s) => (
                        <button
                          key={s.label}
                          onClick={() => sendMessage(s.label)}
                          className={`w-full text-left rounded-xl bg-muted/40 border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 transition-all flex items-center gap-2 ${
                            isWatch ? "text-[10px] px-2 py-1.5 leading-snug" : "text-xs px-3 py-2"
                          }`}
                        >
                          <span className="flex-shrink-0">{s.icon}</span>
                          <span className="truncate">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m) => (
                  <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div className={m.role === "user" ? "max-w-[88%]" : "max-w-[96%] w-full"}>
                      <div
                        className={`rounded-2xl whitespace-pre-wrap leading-relaxed ${isWatch ? "px-2.5 py-2 text-[11px]" : "px-3.5 py-2.5 text-sm"} ${
                          m.role === "user"
                            ? "gradient-purple text-primary-foreground rounded-br-md"
                            : m.error
                              ? "bg-destructive/10 border border-destructive/30 text-foreground rounded-bl-md"
                              : "bg-muted/40 border border-white/10 text-foreground rounded-bl-md"
                        }`}
                      >
                        {m.content || (isStreaming ? <span className="animate-pulse text-muted-foreground">Thinking…</span> : "")}
                      </div>
                      {m.role === "assistant" && m.citations && m.citations.length > 0 && !isWatch && (
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
              <div className={`border-t border-white/10 ${isWatch ? "px-1.5 py-1.5" : "px-3 py-3"}`}>
                <div className={`flex items-end rounded-2xl bg-background/60 border border-white/10 focus-within:border-primary/40 transition-colors ${isWatch ? "gap-1 px-1.5 py-1" : "gap-2 px-2.5 py-2"}`}>
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={isWatch ? "Ask…" : "Ask about your data…"}
                    rows={1}
                    className={`flex-1 min-w-0 resize-none bg-transparent focus:outline-none max-h-28 py-1 text-foreground placeholder:text-muted-foreground ${isWatch ? "text-[11px]" : "text-sm"}`}
                  />
                  <button
                    onClick={toggleVoice}
                    disabled={transcribing}
                    className={`rounded-xl flex-shrink-0 transition-colors ${isWatch ? "p-1.5" : "p-2"} ${
                      listening
                        ? "bg-red-500/20 text-red-400 animate-pulse"
                        : transcribing
                          ? "bg-amber-500/20 text-amber-400 animate-pulse"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                    title={listening ? "Stop recording" : transcribing ? "Transcribing…" : "Voice input"}
                  >
                    {listening ? <MicOff className={isWatch ? "w-3 h-3" : "w-4 h-4"} /> : <Mic className={isWatch ? "w-3 h-3" : "w-4 h-4"} />}
                  </button>
                  {isStreaming ? (
                    <button
                      onClick={stop}
                      className={`rounded-xl bg-muted/60 text-foreground hover:bg-muted transition-colors flex-shrink-0 ${isWatch ? "p-1.5" : "p-2"}`}
                      title="Stop"
                    >
                      <Square className={isWatch ? "w-3 h-3" : "w-4 h-4"} />
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={!input.trim()}
                      className={`rounded-xl gradient-purple text-primary-foreground disabled:opacity-40 transition-opacity flex-shrink-0 ${isWatch ? "p-1.5" : "p-2"}`}
                      title="Send"
                    >
                      <Send className={isWatch ? "w-3 h-3" : "w-4 h-4"} />
                    </button>
                  )}
                </div>
                {!isWatch && (lastModel || budgetExceeded) && (
                  <p className="mt-1.5 px-1 text-[10px] text-muted-foreground/70 truncate">
                    {budgetExceeded
                      ? "Monthly AI budget reached · using the cheaper model until next month"
                      : `Model: ${prettyModelName(lastModel || "")}${autoContext ? " · auto-context" : ""}`}
                  </p>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
