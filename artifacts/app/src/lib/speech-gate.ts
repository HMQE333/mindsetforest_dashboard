/**
 * When a spoken turn starts and ends, from the microphone's loudness. Pure:
 * fed one level reading at a time (RMS 0..1 and a time in ms), so the rules
 * are tested without a microphone.
 *
 * The first readings set the room's noise floor; speech is a stretch clearly
 * above it, and the turn ends after a pause long enough not to be a breath
 * between words.
 */
export interface GateOptions {
  /** Time to learn the room's noise before listening for speech. */
  calibrateMs?: number;
  /** Loud for this long counts as speech starting (a click or a cough does not). */
  speechMs?: number;
  /** Quiet for this long after speech ends the turn. */
  pauseMs?: number;
  /** Nothing said in this long: the turn was silent. */
  waitMs?: number;
  /** A turn never runs longer than this. */
  maxMs?: number;
  /** The quietest level that can count as speech, however quiet the room. */
  minLevel?: number;
}

export type GateState = "calibrating" | "waiting" | "speaking" | "done" | "silent";

export class SpeechGate {
  state: GateState = "calibrating";
  private readonly o: Required<GateOptions>;
  private start: number | null = null;
  private noise: number[] = [];
  private threshold = 0;
  private loudSince: number | null = null;
  private quietSince: number | null = null;
  private speechAt: number | null = null;

  constructor(options: GateOptions = {}) {
    this.o = {
      calibrateMs: 300,
      speechMs: 120,
      pauseMs: 1300,
      waitMs: 8000,
      maxMs: 60000,
      minLevel: 0.012,
      ...options,
    };
  }

  /** The level that counts as speech (known once calibration is over). */
  get level(): number {
    return this.threshold;
  }

  /** Whether speech was heard at all. */
  get heard(): boolean {
    return this.speechAt !== null;
  }

  push(rms: number, t: number): GateState {
    if (this.state === "done" || this.state === "silent") return this.state;
    if (this.start === null) this.start = t;
    const elapsed = t - this.start;

    if (this.state === "calibrating") {
      this.noise.push(rms);
      if (elapsed < this.o.calibrateMs) return this.state;
      const sorted = [...this.noise].sort((a, b) => a - b);
      const floor = sorted[Math.floor(sorted.length / 2)] || 0;
      this.threshold = Math.max(this.o.minLevel, floor * 3);
      this.state = "waiting";
    }

    if (elapsed >= this.o.maxMs) return (this.state = this.heard ? "done" : "silent");

    const loud = rms >= this.threshold;
    if (this.state === "waiting") {
      if (loud) {
        this.loudSince ??= t;
        if (t - this.loudSince >= this.o.speechMs) {
          this.state = "speaking";
          this.speechAt = this.loudSince;
          this.quietSince = null;
        }
      } else {
        this.loudSince = null;
        if (elapsed >= this.o.waitMs) this.state = "silent";
      }
      return this.state;
    }

    // Speaking: a little hysteresis, so the tail of a word does not end the turn.
    if (rms >= this.threshold * 0.7) {
      this.quietSince = null;
    } else {
      this.quietSince ??= t;
      if (t - this.quietSince >= this.o.pauseMs) this.state = "done";
    }
    return this.state;
  }
}
