/**
 * Small interface sounds made with the Web Audio API (no audio files).
 * Browsers only allow sound after a user gesture, so call these from a click
 * or key handler; outside one they stay silent rather than throw.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** One short sine blip with a fast attack and a quick fade, so it pops rather than beeps. */
function blip(ac: AudioContext, freq: number, start: number, duration: number, peak: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, start);
  // A slight lift in pitch gives the "pop".
  osc.frequency.exponentialRampToValueAtTime(freq * 1.06, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Two short rising tones (620 Hz, then 930 Hz): a "pop/check" for opening the assistant. */
export function playCheckSound(): void {
  try {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime + 0.005;
    blip(ac, 620, t, 0.085, 0.16);
    blip(ac, 930, t + 0.075, 0.12, 0.14);
  } catch {
    // Sound is a nicety; never let it break opening the panel.
  }
}

/**
 * The inbox chime: a clear two-note "ding-dong" (E6, then A5) that rings for
 * about half a second. Loud enough to notice in another window, short and
 * soft-edged enough not to jar.
 */
export function playNotifySound(): void {
  try {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    const bell = (freq: number, start: number, peak: number) => {
      // A sine with a quiet overtone sounds like a small bell rather than a beep.
      for (const [mult, share] of [[1, 1], [2.76, 0.18]] as const) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq * mult, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak * share, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
        osc.connect(gain).connect(ac.destination);
        osc.start(start);
        osc.stop(start + 0.6);
      }
    };
    bell(1318.5, t, 0.32);
    bell(880, t + 0.16, 0.36);
  } catch {
    /* no audio: stay silent */
  }
}

/** A small bell: a sine with a quiet inharmonic overtone and a soft tail. */
function bellTone(ac: AudioContext, freq: number, start: number, peak: number, length: number) {
  for (const [mult, share] of [[1, 1], [2.76, 0.16], [5.4, 0.05]] as const) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * mult, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak * share, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }
}

/**
 * Mission done: the robot's "pop" (the same rising sine blip as opening the
 * assistant) straight into a bright bell a fifth above, B5 then F#6. Rising,
 * major and over in half a second, like a correct answer in a language app.
 */
export function playMissionSound(): void {
  try {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime + 0.005;
    blip(ac, 988, t, 0.07, 0.18);
    bellTone(ac, 1480, t + 0.065, 0.24, 0.45);
  } catch {
    /* no audio: stay silent */
  }
}

/**
 * A whole category cleared or a new level: three quick robot pops climbing a
 * major chord, then a two-bell "ta-da" on top. About 0.9 s; `delay` lets it
 * follow the mission sound instead of covering it.
 */
export function playFanfareSound(delay = 0): void {
  try {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime + 0.005 + delay;
    blip(ac, 784, t, 0.07, 0.15);
    blip(ac, 988, t + 0.08, 0.07, 0.15);
    blip(ac, 1175, t + 0.16, 0.07, 0.15);
    bellTone(ac, 1568, t + 0.25, 0.22, 0.6);
    bellTone(ac, 1976, t + 0.25, 0.12, 0.65);
  } catch {
    /* no audio: stay silent */
  }
}
