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
      summary: null,
      modified: "",
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

// -- vault format 2: lecture summaries, paragraphs, aliases, the routine's log --------------

import {
  asSegments,
  groupLectures,
  isUntimed,
  momentLabel,
  parseLectureSummary,
  parseRoutineLog,
  resolveLink,
  segmentForParagraph,
  sourceRef,
  staleSessions,
} from "../lib/kos-vault";
import { FIXTURE_FILES, FIXTURE_RECORDINGS, REC_EN, REC_PL } from "./lecture-fixtures";

const byPath = (p: string) => FIXTURE_FILES.find((f) => f.path === p)!;

describe("lecture summaries", () => {
  it("reads a format 2 summary: frontmatter, sections, the short text and the moment of each section", () => {
    const l = parseLectureSummary(byPath("Lectures/Logika/2026-10-11 Zdania logiczne i zbiory.md"));
    expect([l.course, l.topic, l.date, l.language, l.source, l.legacy]).toEqual(["Logika", "Zdania logiczne i zbiory", "2026-10-11", "pl", "recording", false]);
    expect(l.sessions).toEqual(["2026-10-11 13-32"]);
    expect(l.short).toMatch(/^Wykład wprowadził zdanie logiczne i pięć spójników/);
    expect(l.short).toContain("$p \\Rightarrow q$");
    expect(l.sections.map((s) => s.kind)).toEqual(["short", "section", "section", "section", "section", "stressed", "clarify", "concepts"]);
    expect(l.sections[1]).toMatchObject({ title: "1. Zdanie logiczne", moment: { note: REC_PL, seconds: 754 } });
    expect(l.sections[4].moment?.seconds).toBe(3920);
  });

  it("reads an imported English summary with paragraph anchors", () => {
    const l = parseLectureSummary(byPath("Lectures/Intro to Data Science/2026-10-12 Measuring spread.md"));
    expect([l.language, l.source, l.course]).toEqual(["en", "import", "Intro to Data Science"]);
    expect(l.sections.map((s) => s.kind)).toEqual(["short", "section", "section", "section", "stressed", "clarify", "concepts"]);
    expect(l.sections[1].moment).toEqual({ note: REC_EN, seconds: null, paragraph: 3 });
  });

  it("reads a legacy Sessions/Summary note as the summary of its session, course unknown, language guessed", () => {
    const l = parseLectureSummary(byPath("Sessions/Summary 2026-10-13 15-53.md"));
    expect([l.legacy, l.course, l.topic, l.date, l.language]).toEqual([true, null, "Defining data science and the cloud", "2026-10-13", "en"]);
    expect(l.sessions).toEqual(["2026-10-13 15-53"]);
    expect(l.short).toMatch(/^The recording is about 3 hours long/);
    // Without a topic, the file name stands in, never "Summary 2026-…".
    const bare = parseLectureSummary({ path: "Sessions/Summary 2026-10-01 10-00.md", vault: "V", modified_at: "", content: "# Summary 2026-10-01 10-00\n\nPojęcia się nie zgadzają i jest to ważne." });
    expect([bare.topic, bare.date, bare.language, bare.sessions[0]]).toEqual(["2026-10-01 10-00", "2026-10-01", "pl", "2026-10-01 10-00"]);
  });

  it("indexes summaries apart from session notes, maps them to sessions and reads the routine's log", () => {
    const index = indexVault(FIXTURE_FILES);
    expect(index.lectures).toHaveLength(3);
    expect([...index.sessions.keys()].sort()).toEqual(["2026-10-11 13-32", "2026-10-12 09-00", "2026-10-13 15-53", "2026-10-14 08-10"]);
    expect(index.sessions.get("2026-10-11 13-32")?.summary).toBe("Lectures/Logika/2026-10-11 Zdania logiczne i zbiory");
    // The summary link under "## Knowledge" is not a knowledge note.
    expect(index.sessions.get("2026-10-11 13-32")?.knowledge).toEqual(["Zdanie logiczne", "Implikacja"]);
    expect(index.routineLog?.last?.when).toBe("2026-10-13 23:47");
    const sessions = groupSessions(FIXTURE_RECORDINGS, index);
    const summaryOf = (key: string) => sessions.find((s) => s.key === key)?.summary?.path ?? null;
    expect(summaryOf("2026-10-11 13-32")).toBe("Lectures/Logika/2026-10-11 Zdania logiczne i zbiory.md");
    expect(summaryOf("2026-10-12 09-00")).toBe("Lectures/Intro to Data Science/2026-10-12 Measuring spread.md");
    expect(summaryOf("2026-10-13 15-53")).toBe("Sessions/Summary 2026-10-13 15-53.md");
    expect(summaryOf("2026-10-14 08-10")).toBeNull();
  });

  it("groups by course, newest first, unknown courses last as Inne, and searches without diacritics", () => {
    const { lectures } = indexVault(FIXTURE_FILES);
    expect(groupLectures(lectures).map((g) => [g.course, g.lectures.length])).toEqual([
      ["Intro to Data Science", 1],
      ["Logika", 1],
      ["Inne", 1],
    ]);
    expect(groupLectures(lectures, "zbior").map((g) => g.course)).toEqual(["Logika"]);
    expect(groupLectures(lectures, "SPÓJNIKÓW zdanie").map((g) => g.course)).toEqual(["Logika"]);
    expect(groupLectures(lectures, "cloud").map((g) => g.course)).toEqual(["Inne"]);
    expect(groupLectures(lectures, "nothing like this")).toEqual([]);
  });

  it("resolves links the way Obsidian does: moments, knowledge notes, other summaries, missing notes", () => {
    const index = indexVault(FIXTURE_FILES);
    const kind = (s: string) => resolveLink(index, wikiLinks(s)[0]).kind;
    expect(kind(`[[Recordings/${REC_PL}#^t0754|12:34]]`)).toBe("moment");
    expect(kind(`[[${REC_EN}#^p0003]]`)).toBe("moment");
    expect(kind("[[Implikacja]]")).toBe("note");
    expect(kind("[[implikacja|tu]]")).toBe("note");
    expect(kind("[[Knowledge/Zdanie logiczne]]")).toBe("note");
    expect(kind("[[Lectures/Logika/2026-10-11 Zdania logiczne i zbiory]]")).toBe("lecture");
    expect(kind("[[2026-10-12 Measuring spread]]")).toBe("lecture");
    expect(kind("[[Sessions/2026-10-11 13-32]]")).toBe("missing");
    expect(kind("[[Nie istnieje]]")).toBe("missing");
  });
});

describe("paragraph anchors and aliases", () => {
  it("takes ^pNNNN as a paragraph of an import and labels it", () => {
    const ref = sourceRef(wikiLinks(`[[Recordings/${REC_EN}#^p0012]]`)[0])!;
    expect(ref).toEqual({ note: REC_EN, seconds: null, paragraph: 12 });
    expect([momentLabel(ref), momentLabel({ seconds: 754 }), momentLabel({ seconds: null })]).toEqual(["¶12", "12:34", null]);
    expect(sourceLabel(ref)).toBe("12 Oct, 09:00 · ¶12");
    expect(sourceLabel({ note: REC_PL, seconds: 754 }, "pl-PL")).toBe("11 paź, 13:32 · 12:34");
  });

  it("keeps a paragraph number on untimed segments and finds the paragraph", () => {
    const segs = asSegments([{ start: 0, end: 0, text: "a" }, { start: 0, end: 0, text: "" }, { start: 0, end: 0, text: "c", p: 7 }]);
    expect(segs).toEqual([{ start: 0, end: 0, text: "a", p: 1 }, { start: 0, end: 0, text: "c", p: 7 }]);
    expect(isUntimed(segs)).toBe(true);
    expect(isUntimed(asSegments([{ start: 1.5, end: 3, text: "x" }]))).toBe(false);
    expect([segmentForParagraph(segs, 7), segmentForParagraph(segs, 1), segmentForParagraph(segs, 99)]).toEqual([1, 0, 1]);
  });

  it("reads aliases and course on knowledge notes and dedupes sources by paragraph too", () => {
    const n = parseKnowledgeNote({
      path: "Knowledge/Implikacja.md",
      vault: "V",
      modified_at: "",
      content: `---\ncourse: "Logika"\naliases: ["implication", conditional]\nsources: ["[[${REC_EN}#^p0003]]", "[[${REC_EN}#^p0004]]"]\n---\n# Implikacja\n\nTekst.`,
    });
    expect([n.course, n.aliases]).toEqual(["Logika", ["implication", "conditional"]]);
    expect(n.sources.map((s) => s.paragraph)).toEqual([3, 4]);
  });
});

describe("routine health", () => {
  it("reads last_run and the last entry, with its problems", () => {
    const log = parseRoutineLog(byPath("_SYSTEM/routine-log.md").content);
    expect(log.lastRun).toEqual(new Date(2026, 9, 15, 7, 5));
    expect(log.last?.items.map((i) => i.key)).toEqual(["sessions", "summaries", "notes", "problems"]);
    expect(log.last?.problems).toBe("¶7 of the import was cut off mid-sentence");
    const quiet = parseRoutineLog("# Routine log\n\n## 2026-10-12 23:40\n- sessions: x\n- problems: none\n");
    expect([quiet.lastRun, quiet.last?.problems]).toEqual([new Date(2026, 9, 12, 23, 40), null]);
    expect(parseRoutineLog("nothing yet")).toEqual({ lastRun: null, last: null });
  });

  it("finds sessions waiting for the routine more than a day", () => {
    const index = indexVault(FIXTURE_FILES);
    expect(staleSessions(index, new Date("2026-10-15T07:00:00Z")).map((s) => s.key)).toEqual(["2026-10-14 08-10"]);
    expect(staleSessions(index, new Date("2026-10-14T20:00:00Z"))).toEqual([]);
  });
});
