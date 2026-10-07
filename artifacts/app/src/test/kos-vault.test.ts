import { describe, it, expect } from "vitest";
import {
  clock,
  durationLabel,
  groupSessions,
  indexVault,
  obsidianUri,
  parseFrontmatter,
  parseKnowledgeNote,
  parseSessionNote,
  recordingNote,
  segmentAt,
  sourceLabel,
  wikiLinks,
  type RecordingRow,
} from "../lib/kos-vault";

const REC = "2026-10-07 14-03-12 bandicam 2026-10-07 14-03-12-123";

const reciprocity = {
  path: "Knowledge/Reciprocity.md",
  vault: "MindsetForest Vault",
  modified_at: "2026-10-07T15:00:00Z",
  content: `---
type: principle
sources: ["[[Recordings/${REC}#^t0750]]", "[[Recordings/${REC}#^t0812|later]]"]
confidence: High
created: 2026-10-07
---
# Reciprocity

People feel obliged to return a favour, even an **unasked** one, and [[Concessions]] work the same way.

> "If someone does you a favour, you feel you owe them, even if you never asked for it." ([[Recordings/${REC}#^t0750]])

Related: supports [[Commitment and consistency|Commitment]]; example of [[Influence]].
`,
};

describe("frontmatter", () => {
  it("reads scalars, inline lists with commas inside quotes, and block lists", () => {
    const { data, body } = parseFrontmatter(`---\na: "x: y"\nb: [one, "two, three", 'four']\nc:\n  - "[[A]]"\n  - B\nd: [[Only]]\n---\nBody`);
    expect(data).toEqual({ a: "x: y", b: ["one", "two, three", "four"], c: ["[[A]]", "B"], d: "[[Only]]" });
    expect(body).toBe("Body");
    expect(parseFrontmatter("no frontmatter").body).toBe("no frontmatter");
  });
});

describe("knowledge notes", () => {
  it("reads type, confidence, the cited segments, links, the statement and the quote", () => {
    const n = parseKnowledgeNote(reciprocity);
    expect(n.title).toBe("Reciprocity");
    expect(n.type).toBe("principle");
    expect(n.confidence).toBe("high");
    expect(n.sources).toEqual([
      { note: REC, seconds: 750 },
      { note: REC, seconds: 812 },
    ]);
    expect(n.links.sort()).toEqual(["Commitment and consistency", "Concessions", "Influence"]);
    expect(n.summary).toBe("People feel obliged to return a favour, even an unasked one, and Concessions work the same way.");
    expect(n.quote).toBe("If someone does you a favour, you feel you owe them, even if you never asked for it.");
  });

  it("takes a transcript moment linked without the Recordings/ folder as a source", () => {
    const n = parseKnowledgeNote({
      path: "Knowledge/Short link.md",
      vault: "V",
      modified_at: "",
      content: `---\nsources: ["[[${REC}#^t0042]]"]\n---\nText, see [[Reciprocity]].`,
    });
    expect(n.sources).toEqual([{ note: REC, seconds: 42 }]);
    expect(n.links).toEqual(["Reciprocity"]);
  });

  it("falls back to the file name and tolerates a note with nothing but text", () => {
    const n = parseKnowledgeNote({ path: "Knowledge/Sub/Loose idea.md", vault: "V", modified_at: "", content: "Just a thought." });
    expect([n.title, n.type, n.confidence, n.sources.length, n.summary]).toEqual(["Loose idea", "", null, 0, "Just a thought."]);
  });

  it("parses links with folders, headings, aliases and embeds", () => {
    expect(wikiLinks("![[Recordings/a b#^t0005|x]] and [[Note#Heading]]")).toEqual([
      { target: "Recordings/a b", name: "a b", anchor: "^t0005", alias: "x" },
      { target: "Note", name: "Note", anchor: "Heading", alias: null },
    ]);
  });
});

describe("sessions", () => {
  const session = {
    path: "Sessions/2026-10-07 14-03.md",
    vault: "V",
    modified_at: "",
    content: `---\ntype: session\nstatus: processed\ntopic: Influence, lecture 2\ncontinues: "[[Sessions/2026-09-30 14-00]]"\n---\n# Session\n\n## Recordings\n- Part 1: [[Recordings/${REC}]]\n\n## Knowledge\n- [[Reciprocity]] (new)\n- [[Influence]] (extended)\n`,
  };

  it("reads status, topic, the earlier session and the notes listed under Knowledge", () => {
    expect(parseSessionNote(session)).toEqual({
      key: "2026-10-07 14-03",
      path: session.path,
      vault: "V",
      status: "processed",
      topic: "Influence, lecture 2",
      continues: "2026-09-30 14-00",
      knowledge: ["Reciprocity", "Influence"],
    });
  });

  it("groups parts, adds durations, and finds the notes citing them", () => {
    const row = (id: string, part: number, at: string, note: string | null): RecordingRow => ({
      id, part, note_name: note, recorded_at: at, duration_seconds: 1800, session_key: part ? "2026-10-07 14-03" : "x",
      file_name: "bandicam 2026-10-07 14-03-12-123.mp3", language: "en", model: "m",
    });
    const index = indexVault([reciprocity, session, { path: "Knowledge/Influence.md", vault: "V", modified_at: "", content: "Links to [[Reciprocity]]." }]);
    expect(index.backlinks.get("Reciprocity")).toEqual(["Influence"]);
    const sessions = groupSessions(
      [row("b", 2, "2026-10-07T12:40:00Z", "part two"), row("a", 1, "2026-10-07T12:03:12Z", REC)],
      index,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].parts.map((p) => p.id)).toEqual(["a", "b"]);
    expect(sessions[0].seconds).toBe(3600);
    expect(sessions[0].note?.status).toBe("processed");
    // Reciprocity cites part one; Influence is only listed under the session's "## Knowledge".
    expect(sessions[0].knowledge.map((n) => n.name)).toEqual(["Reciprocity", "Influence"]);
  });
});

describe("helpers", () => {
  it("formats times and lengths", () => {
    expect([clock(5), clock(750), clock(4000)]).toEqual(["0:05", "12:30", "1:06:40"]);
    expect([durationLabel(20), durationLabel(300), durationLabel(4320)]).toEqual(["1 min", "5 min", "1h 12m"]);
  });

  it("labels a source by the recording's start and the cited moment", () => {
    expect(sourceLabel({ note: REC, seconds: 750 })).toBe("7 Oct, 14:03 · 12:30");
    expect(sourceLabel({ note: "lecture", seconds: null })).toBe("lecture");
  });

  it("finds the segment playing at a time", () => {
    const segs = [{ start: 0, end: 5, text: "a" }, { start: 5, end: 9, text: "b" }, { start: 9, end: 12, text: "c" }];
    expect([segmentAt(segs, 0), segmentAt(segs, 6), segmentAt(segs, 9), segmentAt(segs, 99)]).toEqual([0, 1, 2, 2]);
  });

  it("builds Obsidian links and an older row's note name", () => {
    expect(obsidianUri("My Vault", "Knowledge/A & B.md")).toBe("obsidian://open?vault=My%20Vault&file=Knowledge%2FA%20%26%20B");
    const d = new Date(2026, 9, 7, 14, 3, 12);
    expect(recordingNote({ note_name: null, recorded_at: d.toISOString(), file_name: "bandicam 2026-10-07 14-03-12-123.mp3" })).toBe(REC);
    expect(recordingNote({ note_name: "kept", recorded_at: d.toISOString(), file_name: "x.mp3" })).toBe("kept");
  });
});
