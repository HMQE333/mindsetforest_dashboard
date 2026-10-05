import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { pickRecorderMime, transcribeBlob } from "@/lib/transcribe";

/**
 * Tap to record, tap again to stop: the audio goes to the ai-transcribe
 * function (GPT-4o Transcribe) and the text comes back through `onText`. Same
 * pipeline as the assistant's microphone, packaged for any text field.
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
      const text = await transcribeBlob(blob, language);
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
      const mimeType = pickRecorderMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recRef.current = null;
        setRecording(false);
        if (chunks.length > 0) void transcribe(new Blob(chunks, { type: rec.mimeType || mimeType }));
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
