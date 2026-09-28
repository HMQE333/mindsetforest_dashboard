import { useCallback, useEffect, useRef, useState } from "react";
import {
  VOICE_LANG_KEY,
  cleanForSpeech,
  defaultVoiceLang,
  detectLang,
  pickVoice,
  type VoiceLang,
} from "@/lib/voice-mode";

/**
 * Hands-free conversation loop on the browser's own speech APIs (free, no
 * server): listen -> hand the utterance to `onUtterance` -> speak what it
 * returns -> listen again. Ends itself after a few silent rounds so the
 * microphone never stays open unattended.
 */
export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

type RecognitionCtor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function voiceModeSupported(): boolean {
  return !!recognitionCtor() && typeof window !== "undefined" && "speechSynthesis" in window;
}

function loadLang(): VoiceLang {
  try {
    const v = localStorage.getItem(VOICE_LANG_KEY);
    if (v === "pl-PL" || v === "en-US") return v;
  } catch { /* ignore */ }
  return defaultVoiceLang();
}

/** What to say back; `end` closes the conversation after speaking. */
export type UtteranceReply = string | null | { text: string | null; end?: boolean };

export interface UseVoiceModeOptions {
  /** Called with each final transcript. Return the text to speak back, or null for silence. */
  onUtterance: (text: string) => Promise<UtteranceReply>;
  /** Called when the loop ends on its own (silence, unsupported, error). */
  onEnd?: (reason: "silence" | "error" | "manual") => void;
  /** Consecutive empty listening rounds before the loop gives up. */
  maxSilentRounds?: number;
}

export function useVoiceMode({ onUtterance, onEnd, maxSilentRounds = 3 }: UseVoiceModeOptions) {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [interim, setInterim] = useState("");
  const [lang, setLangState] = useState<VoiceLang>(loadLang);
  const supported = voiceModeSupported();

  const activeRef = useRef(false);
  const langRef = useRef(lang);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const silentRef = useRef(0);
  const onUtteranceRef = useRef(onUtterance);
  const onEndRef = useRef(onEnd);
  useEffect(() => { onUtteranceRef.current = onUtterance; }, [onUtterance]);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);
  useEffect(() => { langRef.current = lang; }, [lang]);

  const setLang = useCallback((next: VoiceLang) => {
    setLangState(next);
    try { localStorage.setItem(VOICE_LANG_KEY, next); } catch { /* ignore */ }
  }, []);

  const cancelSpeech = useCallback(() => {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }, []);

  const stopRecognition = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try { rec.abort(); } catch { /* ignore */ }
    }
  }, []);

  const finish = useCallback((reason: "silence" | "error" | "manual") => {
    if (!activeRef.current) return;
    activeRef.current = false;
    stopRecognition();
    cancelSpeech();
    setActive(false);
    setPhase("idle");
    setInterim("");
    onEndRef.current?.(reason);
  }, [stopRecognition, cancelSpeech]);

  /** Speak text and resolve when done (or immediately when synthesis is unavailable). */
  const speak = useCallback((text: string, langHint?: VoiceLang): Promise<void> => {
    const clean = cleanForSpeech(text);
    if (!clean || typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      cancelSpeech();
      const utter = new SpeechSynthesisUtterance(clean);
      const chosenLang = langHint || detectLang(clean, langRef.current);
      utter.lang = chosenLang;
      const voice = pickVoice(window.speechSynthesis.getVoices(), chosenLang);
      if (voice) utter.voice = voice as SpeechSynthesisVoice;
      utter.rate = 1.02;
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(); } };
      utter.onend = done;
      utter.onerror = done;
      setPhase("speaking");
      window.speechSynthesis.speak(utter);
      // Safari sometimes never fires onend for cancelled utterances.
      setTimeout(done, Math.min(60000, 4000 + clean.length * 90));
    });
  }, [cancelSpeech]);

  const listen = useCallback(() => {
    if (!activeRef.current) return;
    const Ctor = recognitionCtor();
    if (!Ctor) { finish("error"); return; }
    stopRecognition();
    const rec = new Ctor();
    rec.lang = langRef.current;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    let gotResult = false;
    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0]?.transcript || "";
        if (r.isFinal) finalText += t;
        else interimText += t;
      }
      setInterim(finalText || interimText);
      if (finalText.trim()) gotResult = true;
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") finish("error");
      // "no-speech" / "aborted" fall through to onend.
    };
    rec.onend = async () => {
      if (recRef.current !== rec) return;
      recRef.current = null;
      if (!activeRef.current) return;
      const text = finalText.trim();
      setInterim("");
      if (!text || !gotResult) {
        silentRef.current += 1;
        if (silentRef.current >= maxSilentRounds) { finish("silence"); return; }
        listen();
        return;
      }
      silentRef.current = 0;
      setPhase("thinking");
      let reply: UtteranceReply = null;
      try {
        reply = await onUtteranceRef.current(text);
      } catch {
        reply = null;
      }
      if (!activeRef.current) return;
      const replyText = typeof reply === "string" ? reply : reply?.text ?? null;
      const endAfter = typeof reply === "object" && reply !== null && reply.end === true;
      if (replyText) await speak(replyText);
      if (!activeRef.current) return;
      if (endAfter) { finish("manual"); return; }
      listen();
    };
    recRef.current = rec;
    setPhase("listening");
    try {
      rec.start();
    } catch {
      finish("error");
    }
  }, [finish, speak, stopRecognition, maxSilentRounds]);

  const start = useCallback(() => {
    if (!supported || activeRef.current) return;
    activeRef.current = true;
    silentRef.current = 0;
    setActive(true);
    // Warm the voice list (Chrome loads it lazily).
    try { window.speechSynthesis.getVoices(); } catch { /* ignore */ }
    listen();
  }, [supported, listen]);

  const stop = useCallback(() => finish("manual"), [finish]);

  /** Interrupt the synthesizer and go straight back to listening. */
  const interrupt = useCallback(() => {
    if (!activeRef.current) return;
    cancelSpeech();
    listen();
  }, [cancelSpeech, listen]);

  useEffect(() => () => {
    activeRef.current = false;
    stopRecognition();
    cancelSpeech();
  }, [stopRecognition, cancelSpeech]);

  return { supported, active, phase, interim, lang, setLang, start, stop, interrupt, speak };
}
