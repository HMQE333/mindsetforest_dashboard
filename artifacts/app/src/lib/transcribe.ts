/**
 * Speech to text through the ai-transcribe function (GPT-4o Transcribe via
 * OpenRouter). One path for the assistant's microphone, voice mode and voice
 * notes, so they all hear the same way.
 */
import { supabase } from "@/integrations/supabase/client";

/** The first recording format this browser can make: Chrome/Firefox webm, Safari mp4. */
export function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

/** The format name the transcription API wants for a recorder MIME type. */
export function audioFormat(mime: string): "webm" | "m4a" | "ogg" | "wav" {
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

// Phrases speech models are known to invent on silence or noise at the end
// of a recording (they come from subtitled video they were trained on).
// A bare "you" only counts as its own sentence (". you"), never "I told you".
const PHANTOM =
  /(?:^|[\s.,!?])(?:thank you(?: (?:so much|very much))?(?: for watching)?|thanks for watching|dziękuję(?: za uwagę)?|dzięki za oglądanie|napisy stworzone przez społeczność amara\.org|subtitles by the amara\.org community)[.!?,…]*\s*$|(?:^|[.!?]\s+)you[.!?,…]*\s*$/i;

/**
 * Drops invented endings: "...content creation. you thank you. thank you."
 * loses " you thank you. thank you." A single closing "thank you" stays (it
 * may well have been said), unless something else invented sits next to it;
 * an utterance that is nothing but "thank you" stays too.
 */
export function cleanTranscript(raw: string): string {
  const original = raw.replace(/\s+/g, " ").trim();
  let text = original;
  let removed = 0;
  let lastTail = "";
  for (let guard = 0; guard < 8; guard++) {
    const m = PHANTOM.exec(text);
    if (!m) break;
    const rest = text.slice(0, m.index + (/[.!?]/.test(m[0][0]) ? 1 : 0)).replace(/[,\s]+$/, "").trim();
    if (!rest) break;
    lastTail = m[0];
    text = rest;
    removed++;
  }
  // One lone "Thank you." is probably real: keep the sentence as it was.
  if (removed === 1 && /thank you\W*$|dziękuję\W*$/i.test(lastTail) && !/for watching|amara/i.test(lastTail)) return original;
  return text;
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

/**
 * The words in a recording, cleaned of invented endings ("" when nothing was
 * said). `language` ("pl", "en") forces it; left out, it is detected, which
 * also handles Polish and English in one sentence. Throws when the call fails.
 */
export async function transcribeBlob(blob: Blob, language?: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("ai-transcribe", {
    body: { audio: await toBase64(blob), format: audioFormat(blob.type), ...(language ? { language } : {}) },
  });
  if (error) throw new Error(error.message || "Transcription failed");
  return cleanTranscript(String(data?.text || ""));
}
