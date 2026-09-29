import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSpeech, fetchVoices } from "@/lib/assistant-api";
import {
  VOICE_LANG_KEY,
  cleanForSpeech,
  defaultVoiceLang,
  detectLang,
  loadVoiceId,
  pickVoice,
  sampleSentence,
  saveVoiceId,
  type TtsVoice,
  type VoiceLang,
} from "@/lib/voice-mode";

/**
 * Hands-free conversation loop on the browser's own speech APIs (free, no
 * server): listen -> hand the utterance to `onUtterance` -> speak what it
 * returns -> listen again. Ends itself after a few silent rounds so the
 * microphone never stays open unattended.
 */
export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";
/** Which synthesizer produced the last reply. */
export type VoiceProvider = "elevenlabs" | "browser" | null;

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
  const [provider, setProvider] = useState<VoiceProvider>(null);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [voiceId, setVoiceIdState] = useState<string | null>(loadVoiceId);
  const supported = voiceModeSupported();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioDoneRef = useRef<(() => void) | null>(null);

  const activeRef = useRef(false);
  const langRef = useRef(lang);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const silentRef = useRef(0);
  // Bumped on every start/interrupt so a continuation from an older cycle
  // (e.g. the cancelled utterance's onend) never starts a second listener.
  const generationRef = useRef(0);
  const onUtteranceRef = useRef(onUtterance);
  const onEndRef = useRef(onEnd);
  useEffect(() => { onUtteranceRef.current = onUtterance; }, [onUtterance]);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);
  useEffect(() => { langRef.current = lang; }, [lang]);

  const setVoiceId = useCallback((next: string | null) => {
    setVoiceIdState(next);
    saveVoiceId(next);
  }, []);

  /** Load the account's voices once (no-op when ElevenLabs is not configured). */
  const refreshVoices = useCallback(async () => {
    const { voices: list } = await fetchVoices();
    setVoices(list);
  }, []);

  const setLang = useCallback((next: VoiceLang) => {
    setLangState(next);
    try { localStorage.setItem(VOICE_LANG_KEY, next); } catch { /* ignore */ }
  }, []);

  const cancelSpeech = useCallback(() => {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    const audio = audioRef.current;
    if (audio) {
      try { audio.pause(); audio.removeAttribute("src"); audio.load(); } catch { /* ignore */ }
    }
    audioDoneRef.current?.();
  }, []);

  /** Play an MP3 blob; resolves true when it finished, false when it could not play. */
  const playBlob = useCallback((blob: Blob): Promise<boolean> => new Promise<boolean>((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (audioRef.current === audio) audioRef.current = null;
      if (audioDoneRef.current === done) audioDoneRef.current = null;
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    const done = () => finish(true);
    audioDoneRef.current = done;
    audio.onended = done;
    audio.onerror = () => finish(false);
    audio.play().catch(() => finish(false));
  }), []);

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
    generationRef.current += 1;
    stopRecognition();
    cancelSpeech();
    setActive(false);
    setPhase("idle");
    setInterim("");
    onEndRef.current?.(reason);
  }, [stopRecognition, cancelSpeech]);

  /** The browser's own synthesizer; resolves when done (or at once when unavailable). */
  const speakBrowser = useCallback((clean: string, chosenLang: VoiceLang): Promise<void> => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = chosenLang;
      const voice = pickVoice(window.speechSynthesis.getVoices(), chosenLang);
      if (voice) utter.voice = voice as SpeechSynthesisVoice;
      utter.rate = 1.02;
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const done = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve();
      };
      utter.onend = done;
      utter.onerror = done;
      window.speechSynthesis.speak(utter);
      // Safari sometimes never fires onend for cancelled utterances.
      timer = setTimeout(done, Math.min(60000, 4000 + clean.length * 90));
    });
  }, []);

  /**
   * Speak text and resolve when done. ElevenLabs (via ai-tts) when the key is
   * configured, otherwise the browser voice, so voice mode works either way.
   */
  const speak = useCallback(async (text: string, langHint?: VoiceLang): Promise<void> => {
    const clean = cleanForSpeech(text);
    if (!clean) return;
    const chosenLang = langHint || detectLang(clean, langRef.current);
    cancelSpeech();
    setPhase("speaking");
    const generation = generationRef.current;
    // Read the choice fresh so a pick made in Settings applies to the next reply.
    const blob = await fetchSpeech(clean, chosenLang, loadVoiceId());
    // Stopped or interrupted while the audio was being generated.
    if (generation !== generationRef.current) return;
    if (blob) {
      setProvider("elevenlabs");
      if (await playBlob(blob)) return;
      if (generation !== generationRef.current) return;
    }
    setProvider("browser");
    await speakBrowser(clean, chosenLang);
  }, [cancelSpeech, playBlob, speakBrowser]);

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
      const generation = generationRef.current;
      setPhase("thinking");
      let reply: UtteranceReply = null;
      try {
        reply = await onUtteranceRef.current(text);
      } catch {
        reply = null;
      }
      if (!activeRef.current || generation !== generationRef.current) return;
      const replyText = typeof reply === "string" ? reply : reply?.text ?? null;
      const endAfter = typeof reply === "object" && reply !== null && reply.end === true;
      if (replyText) await speak(replyText);
      // An interrupt (or stop/start) while speaking already started its own listener.
      if (!activeRef.current || generation !== generationRef.current) return;
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
    generationRef.current += 1;
    setActive(true);
    // Warm the voice lists (Chrome loads the browser one lazily).
    try { window.speechSynthesis.getVoices(); } catch { /* ignore */ }
    void refreshVoices();
    listen();
  }, [supported, listen, refreshVoices]);

  const stop = useCallback(() => finish("manual"), [finish]);

  /** Say a sample line in the chosen voice, pausing the microphone meanwhile. */
  const preview = useCallback(async () => {
    generationRef.current += 1;
    stopRecognition();
    await speak(sampleSentence(langRef.current), langRef.current);
    if (activeRef.current) listen();
  }, [stopRecognition, speak, listen]);

  /** Interrupt the synthesizer and go straight back to listening. */
  const interrupt = useCallback(() => {
    if (!activeRef.current) return;
    generationRef.current += 1;
    cancelSpeech();
    listen();
  }, [cancelSpeech, listen]);

  useEffect(() => () => {
    activeRef.current = false;
    stopRecognition();
    cancelSpeech();
  }, [stopRecognition, cancelSpeech]);

  return { supported, active, phase, interim, lang, setLang, provider, voices, voiceId, setVoiceId, refreshVoices, preview, start, stop, interrupt, speak };
}
