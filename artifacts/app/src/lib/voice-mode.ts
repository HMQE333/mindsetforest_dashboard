/**
 * Pure helpers for the hands-free voice conversation. The browser APIs
 * (SpeechRecognition, speechSynthesis) live in hooks/useVoiceMode.ts; this
 * file is what the tests cover.
 */

export type VoiceLang = "pl-PL" | "en-US";

export const VOICE_LANG_KEY = "mf-assistant-voice-lang";
export const VOICE_ID_KEY = "mf-assistant-voice-id";

/** One ElevenLabs voice as the ai-tts function lists it. */
export interface TtsVoice {
  id: string;
  name: string;
  gender: string | null;
  accent: string | null;
  description: string | null;
  category: string | null;
  preview: string | null;
}

export function loadVoiceId(): string | null {
  try {
    return localStorage.getItem(VOICE_ID_KEY) || null;
  } catch {
    return null;
  }
}

export function saveVoiceId(id: string | null): void {
  try {
    if (id) localStorage.setItem(VOICE_ID_KEY, id);
    else localStorage.removeItem(VOICE_ID_KEY);
  } catch { /* ignore */ }
}

/** "♂ George · British" for a select option. */
export function voiceLabel(v: TtsVoice): string {
  const mark = v.gender === "male" ? "♂" : v.gender === "female" ? "♀" : "•";
  const bits = [v.name, v.accent ? v.accent.replace(/^\w/, (c) => c.toUpperCase()) : null].filter(Boolean);
  return `${mark} ${bits.join(" · ")}`;
}

/** Short line spoken when previewing a voice. */
export function sampleSentence(lang: VoiceLang): string {
  return lang === "pl-PL"
    ? "Cześć, tu Twój asystent MindsetForest. Tak będę brzmieć w rozmowie."
    : "Hi, I'm your MindsetForest assistant. This is how I sound.";
}

export function defaultVoiceLang(navigatorLang: string | undefined = typeof navigator !== "undefined" ? navigator.language : undefined): VoiceLang {
  return (navigatorLang || "").toLowerCase().startsWith("pl") ? "pl-PL" : "en-US";
}

/** Guess the language of a reply so the synthesizer picks a matching voice. */
export function detectLang(text: string, fallback: VoiceLang = "en-US"): VoiceLang {
  const t = text.toLowerCase();
  if (/[ąćęłńóśźż]/.test(t)) return "pl-PL";
  const plWords = (t.match(/\b(nie|jest|się|dzisiaj|dziś|masz|twoje|twój|jeszcze|zrobione|misja|misje|jutro|tak)\b/g) || []).length;
  const enWords = (t.match(/\b(the|you|your|today|is|are|have|done|mission|missions|tomorrow|yes)\b/g) || []).length;
  if (plWords > enWords) return "pl-PL";
  if (enWords > plWords) return "en-US";
  return fallback;
}

/** Strip everything a speech synthesizer would read badly: action blocks, markdown, URLs, emoji. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```action[\s\S]*?```/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_`#>|]+/g, " ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Yes/no in Polish or English for the spoken confirm step. */
export function parseYesNo(text: string): "yes" | "no" | null {
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .trim();
  if (!t) return null;
  const words = t.split(/\s+/);
  const NO = new Set(["nie", "no", "nope", "anuluj", "cancel", "stop", "odrzuc", "nah"]);
  const YES = new Set(["tak", "yes", "yeah", "yep", "ok", "okay", "okej", "zrob", "dawaj", "zastosuj", "potwierdzam", "jasne", "pewnie", "sure", "apply", "confirm", "go"]);
  if (words.some((w) => NO.has(w))) return "no";
  if (words.some((w) => YES.has(w))) return "yes";
  return null;
}

/** Spoken phrases that end the conversation. */
export function isStopPhrase(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /^(koniec|koniec rozmowy|zakoncz|zakończ|do widzenia|pa pa|stop|goodbye|bye|end conversation|that's all|to wszystko)[.!]?$/.test(t);
}

/** Pick the best available voice for a language; prefers natural-sounding online voices. */
export function pickVoice<T extends { lang: string; name: string; localService?: boolean }>(voices: T[], lang: VoiceLang): T | null {
  const prefix = lang.slice(0, 2).toLowerCase();
  const matching = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(prefix));
  if (matching.length === 0) return null;
  const score = (v: T) => {
    let s = 0;
    if (v.lang.toLowerCase().replace("_", "-") === lang.toLowerCase()) s += 4;
    if (/natural|neural|online|premium|enhanced/i.test(v.name)) s += 3;
    if (/google|microsoft|apple|siri/i.test(v.name)) s += 2;
    if (v.localService === false) s += 1;
    return s;
  };
  return [...matching].sort((a, b) => score(b) - score(a))[0];
}

export const VOICE_PROMPTS = {
  "pl-PL": {
    confirm: "Zastosować? Powiedz tak lub nie.",
    applied: "Zrobione.",
    dismissed: "Dobrze, pomijam.",
    unclear: "Nie zrozumiałam. Tak czy nie?",
    bye: "Do usłyszenia.",
    nothing: "Nie słyszę cię. Kończę rozmowę.",
    error: "Coś poszło nie tak. Spróbuj jeszcze raz.",
  },
  "en-US": {
    confirm: "Apply it? Say yes or no.",
    applied: "Done.",
    dismissed: "Okay, skipping that.",
    unclear: "I didn't catch that. Yes or no?",
    bye: "Talk to you later.",
    nothing: "I can't hear you. Ending the conversation.",
    error: "Something went wrong. Please try again.",
  },
} as const;
