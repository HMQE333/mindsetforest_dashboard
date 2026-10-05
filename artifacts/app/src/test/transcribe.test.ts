import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { audioFormat, cleanTranscript } from "../lib/transcribe";
import { SpeechGate } from "../lib/speech-gate";

describe("cleanTranscript", () => {
  it("drops the endings speech models invent on silence", () => {
    expect(
      cleanTranscript("Save a note that today is the day when I solved my problems with content creation. you thank you. thank you."),
    ).toBe("Save a note that today is the day when I solved my problems with content creation.");
    expect(cleanTranscript("Add a task to call mom. Thanks for watching!")).toBe("Add a task to call mom.");
    expect(cleanTranscript("Zapisz notatkę o planie. Dziękuję. Dziękuję.")).toBe("Zapisz notatkę o planie.");
    expect(cleanTranscript("Read pages 100 to 123. Napisy stworzone przez społeczność Amara.org")).toBe("Read pages 100 to 123.");
  });

  it("keeps what was likely said", () => {
    expect(cleanTranscript("Okay, thank you.")).toBe("Okay, thank you.");
    expect(cleanTranscript("Thank you.")).toBe("Thank you.");
    expect(cleanTranscript("I told you")).toBe("I told you");
    expect(cleanTranscript("See you. Thank you.")).toBe("See you. Thank you.");
    expect(cleanTranscript("  spaced   out  ")).toBe("spaced out");
    expect(cleanTranscript("")).toBe("");
  });

  it("names the recording format", () => {
    expect(audioFormat("audio/webm;codecs=opus")).toBe("webm");
    expect(audioFormat("audio/mp4")).toBe("m4a");
    expect(audioFormat("audio/ogg;codecs=opus")).toBe("ogg");
    expect(audioFormat("")).toBe("webm");
  });
});

/** Feeds a level every 50 ms for `ms`, returning the state after. */
function feed(g: SpeechGate, from: number, ms: number, rms: number) {
  let s = g.state;
  for (let t = from; t < from + ms; t += 50) s = g.push(rms, t);
  return s;
}

describe("SpeechGate", () => {
  it("learns the room, hears speech, and ends the turn after a pause", () => {
    const g = new SpeechGate();
    expect(feed(g, 0, 300, 0.005)).toBe("calibrating");
    expect(feed(g, 300, 500, 0.006)).toBe("waiting");
    expect(g.level).toBeCloseTo(0.015, 3); // 3x the noise floor
    expect(feed(g, 800, 2000, 0.08)).toBe("speaking");
    // A short breath between words does not end it...
    expect(feed(g, 2800, 600, 0.004)).toBe("speaking");
    expect(feed(g, 3400, 500, 0.08)).toBe("speaking");
    // ...a real pause does.
    expect(feed(g, 3900, 1400, 0.004)).toBe("done");
    expect(g.heard).toBe(true);
  });

  it("gives up when nothing is said, and ignores a click", () => {
    const g = new SpeechGate({ waitMs: 3000 });
    feed(g, 0, 400, 0.003);
    g.push(0.3, 450); // one loud sample: a click
    expect(feed(g, 500, 3000, 0.003)).toBe("silent");
    expect(g.heard).toBe(false);
  });

  it("stops a turn that runs too long", () => {
    const g = new SpeechGate({ maxMs: 2000 });
    feed(g, 0, 400, 0.003);
    expect(feed(g, 400, 2000, 0.1)).toBe("done");
  });

  it("does not take a loud room for speech", () => {
    const g = new SpeechGate();
    feed(g, 0, 350, 0.05);
    expect(g.level).toBeCloseTo(0.15, 2);
    expect(feed(g, 350, 1000, 0.06)).toBe("waiting");
  });
});
