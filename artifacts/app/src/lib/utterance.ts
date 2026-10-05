/**
 * One spoken turn from the microphone: opens it, records, and stops on its
 * own once the speaker pauses (SpeechGate decides from the loudness). The
 * microphone is closed again after every turn, so nothing listens while the
 * assistant talks and phones keep their normal audio routing.
 */
import { SpeechGate, type GateOptions } from "@/lib/speech-gate";
import { pickRecorderMime } from "@/lib/transcribe";

export interface UtteranceHandle {
  /** The recording, or null when nothing was said or the turn was cancelled. Rejects when the microphone fails. */
  promise: Promise<Blob | null>;
  cancel: () => void;
}

export function recorderSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!(window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  );
}

export function recordUtterance(opts: { gate?: GateOptions; onSpeech?: () => void } = {}): UtteranceHandle {
  let cancel = () => { cancelled = true; };
  let cancelled = false;

  const promise = (async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (cancelled) {
      stream.getTracks().forEach((t) => t.stop());
      return null;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    void ctx.resume().catch(() => undefined);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    const mime = pickRecorderMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.start();

    return new Promise<Blob | null>((resolve) => {
      const gate = new SpeechGate(opts.gate);
      let spoke = false;
      let settled = false;
      const close = (keep: boolean) => {
        if (settled) return;
        settled = true;
        clearInterval(timer);
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          void ctx.close().catch(() => undefined);
          resolve(keep && chunks.length > 0 ? new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }) : null);
        };
        try { rec.stop(); } catch { rec.onstop?.(new Event("stop")); }
      };
      cancel = () => { cancelled = true; close(false); };
      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
        const state = gate.push(Math.sqrt(sum / samples.length), performance.now());
        if (state === "speaking" && !spoke) {
          spoke = true;
          opts.onSpeech?.();
        }
        if (state === "done") close(true);
        else if (state === "silent") close(false);
      }, 50);
    });
  })();

  return { promise, cancel: () => cancel() };
}
