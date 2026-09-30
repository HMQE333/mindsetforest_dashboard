import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tap to record, tap again to stop: the audio goes to the ai-transcribe
 * function (Whisper) and the text comes back through `onText`. Same pipeline
 * as the assistant's microphone, packaged for any text field.
 */
/** `language` ("pl", "en") forces the transcription language; left out, it is detected, so any language works. */
export function useVoiceNote(onText: (text: string) => void, language?: string) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => { onTextRef.current = onText; }, [onText]);

  const transcribe = useCallback(async (blob: Blob) => {
    setTranscribing(true);
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      const { data, error } = await supabase.functions.invoke("ai-transcribe", {
        body: { audio: btoa(binary), format: "webm", ...(language ? { language } : {}) },
      });
      if (error) throw new Error(error.message || "Transcription failed");
      const text = String(data?.text || "").trim();
      if (!text) {
        toast.error("I didn't catch anything, try again");
        return;
      }
      onTextRef.current(text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't transcribe the recording");
    } finally {
      setTranscribing(false);
    }
  }, [language]);

  const toggle = useCallback(async () => {
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("No access to the microphone");
      return;
    }
    try {
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recRef.current = null;
        setRecording(false);
        if (chunks.length > 0) void transcribe(new Blob(chunks, { type: mimeType }));
      };
      rec.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        recRef.current = null;
        setRecording(false);
        toast.error("Recording isn't working");
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      // Access was granted, so the recorder itself failed. Release the
      // microphone, or it stays on with nothing recording.
      stream.getTracks().forEach((t) => t.stop());
      recRef.current = null;
      toast.error("Couldn't start recording in this browser");
    }
  }, [transcribe]);

  useEffect(() => () => { recRef.current?.stop(); }, []);

  return { recording, transcribing, toggle };
}
