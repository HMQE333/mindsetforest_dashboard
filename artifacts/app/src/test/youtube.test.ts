import { describe, it, expect } from "vitest";
import { splitStamps, toSeconds, youtubeId } from "../lib/youtube";

describe("youtubeId", () => {
  it("reads every link form", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=h_e7gdMyLPw&pp=ugUEEg")).toBe("h_e7gdMyLPw");
    expect(youtubeId("https://youtu.be/gTyRQert4JY?si=x")).toBe("gTyRQert4JY");
    expect(youtubeId("https://m.youtube.com/shorts/abcdefghijk")).toBe("abcdefghijk");
    expect(youtubeId("https://www.youtube.com/live/abcdefghijk?feature=share")).toBe("abcdefghijk");
    expect(youtubeId("https://www.youtube.com/embed/abcdefghijk")).toBe("abcdefghijk");
  });

  it("refuses channels, other sites and junk", () => {
    expect(youtubeId("https://www.youtube.com/@3blue1brown")).toBeNull();
    expect(youtubeId("https://www.youtube.com/")).toBeNull();
    expect(youtubeId("https://vimeo.com/834997734")).toBeNull();
    expect(youtubeId("https://notyoutube.com/watch?v=h_e7gdMyLPw")).toBeNull();
    expect(youtubeId("not a url")).toBeNull();
  });
});

describe("splitStamps", () => {
  const stamps = (t: string) => splitStamps(t).filter((p) => "stamp" in p).map((p) => ("stamp" in p ? `${p.stamp}=${p.seconds}` : ""));
  const plain = (t: string) => splitStamps(t).map((p) => ("stamp" in p ? p.stamp : p.text)).join("");

  it("links single times, lists and ranges inside brackets", () => {
    expect(stamps("Catch the thought [02:55].")).toEqual(["02:55=175"]);
    expect(stamps("Daily [03:57, 04:19] and [00:06-00:14]")).toEqual(["03:57=237", "04:19=259", "00:06=6", "00:14=14"]);
    expect(stamps("[1:02:03] late")).toEqual(["1:02:03=3723"]);
  });

  it("keeps the text exactly as written", () => {
    const t = "Daily [03:57, 04:19], see [on screen: a slide] at 10:30 [x].";
    expect(plain(t)).toBe(t);
    expect(stamps(t)).toEqual(["03:57=237", "04:19=259"]);
  });

  it("converts times to seconds", () => {
    expect(toSeconds("00:42")).toBe(42);
    expect(toSeconds("12:05")).toBe(725);
  });
});
