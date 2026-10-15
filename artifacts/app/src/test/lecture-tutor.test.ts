import { describe, it, expect, vi } from "vitest";

// A tiny stand-in for the Supabase query builder: rows per table, filtered by eq / in / like.
const fake = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const tables: Record<string, Row[]> = {};
  const calls: { table: string; filters: [string, string, unknown][] }[] = [];
  const from = (table: string) => {
    const filters: [string, string, unknown][] = [];
    calls.push({ table, filters });
    const rows = () =>
      (tables[table] ?? []).filter((r) =>
        filters.every(([op, col, val]) =>
          op === "eq"
            ? r[col] === val
            : op === "in"
              ? (val as unknown[]).includes(r[col])
              : new RegExp(`^${String(val).replace(/%/g, ".*")}$`).test(String(r[col])),
        ),
      );
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain,
      order: chain,
      range: chain,
      limit: chain,
      eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), b),
      in: (c: string, v: unknown) => (filters.push(["in", c, v]), b),
      like: (c: string, v: unknown) => (filters.push(["like", c, v]), b),
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok, bad),
    });
    return b;
  };
  return { tables, calls, supabase: { from } };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: fake.supabase }));

import {
  gatherLectureItems,
  guessLanguage,
  isLectureItem,
  knowledgeContext,
  lectureContext,
  lectureItemId,
  lectureMoments,
  openLectureTutor,
  parseLecture,
  selectExcerpts,
  stems,
  transcriptParts,
  tutorRequest,
  tutorRules,
  type RecordingInput,
  type TutorApi,
} from "../lib/lecture-tutor";
import { gatherContext } from "../lib/assistant-context";
import { keywordScopes } from "../lib/scope-hints";
import type { VaultFile } from "../lib/kos-vault";

const NOTE = "2026-10-11 13-32-45 lecture";
const at = (t: number, label: string) => `[[Recordings/${NOTE}#^t${String(t).padStart(4, "0")}|${label}]]`;

const LOGIKA = `---
type: lecture-summary
course: "Logika"
topic: "Zdania logiczne i zbiory"
date: 2026-10-11
language: pl
sessions: ["[[Sessions/2026-10-11 13-32]]"]
source: recording
---
# Zdania logiczne i zbiory

## W skrócie
Wykład wprowadza zdania logiczne, spójniki i zbiory. Prowadzący pokazuje tabele prawdy.

## 1. Zdania i spójniki ${at(120, "2:00")}
Zdanie logiczne to zdanie, któremu można przypisać prawdę albo fałsz. Implikacja $p \\Rightarrow q$ jest fałszywa tylko wtedy, gdy $p$ jest prawdziwe, a $q$ fałszywe.

> [!tip]- Dla zrozumienia (AI)
> Implikacja to obietnica: łamiemy ją tylko, gdy warunek zaszedł, a skutek nie.

> [!abstract]- Wizualizacja
> \`\`\`plot
> {"title": "sin i cos", "x": [-6, 6], "functions": [{"expr": "sin(x)"}]}
> \`\`\`

## 2. Zbiory ${at(1500, "25:00")}
Zbiór to kolekcja elementów. Suma zbiorów zawiera elementy obu.

## Na co prowadzący kładł nacisk
- Implikacja jest fałszywa tylko w jednym przypadku, "to będzie na egzaminie" ${at(300, "5:00")}
- Prawa De Morgana ${at(2400, "40:00")}

## Do wyjaśnienia
- Niewyraźne nagranie ${at(3000, "50:00")}

## Pojęcia
[[Implikacja]], [[Zbiór]]

> [!note]- Słowniczek PL ↔ EN
> implikacja = implication
`;

const LEGACY = `---
type: lecture-summary
session: "[[Sessions/2026-10-13 15-53]]"
topic: Defining data science, cloud and file formats
created: 2026-10-13
---

# Summary 2026-10-13 15-53

The lecture covers what data science is and how a project runs. Most of the rest is music and is not summarised.

**Defining data science.** Data science is the study of data ([[Data science is the study of data]]).
`;

const file = (path: string, content: string, modified_at = "2026-10-12T10:00:00Z"): VaultFile & { folder: string; user_id: string } => ({
  path,
  vault: "Vault",
  content,
  modified_at,
  folder: path.split("/")[0],
  user_id: "u1",
});

const logikaFile = file("Lectures/Logika/2026-10-11 Zdania logiczne i zbiory.md", LOGIKA);

/** One segment every 10 s; a few say something specific, the rest is filler. */
function longRecording(count = 2000): RecordingInput {
  const special: Record<number, string> = {
    120: "Zaczynamy od zdań logicznych i spójników.",
    300: "Implikacja jest fałszywa tylko gdy poprzednik prawdziwy a następnik fałszywy, to będzie na egzaminie.",
    2400: "Prawa De Morgana: negacja koniunkcji to alternatywa negacji.",
    3000: "[niewyraźnie] coś o dowodzie",
    3600: "Kwantyfikator ogólny mówi, że dla każdego x zachodzi własność.",
  };
  const segments = Array.from({ length: count }, (_, i) => {
    const start = i * 10;
    return { start, end: start + 10, text: special[start] ?? `I tutaj dalej mówimy o różnych sprawach organizacyjnych, numer ${i}.` };
  });
  return { note_name: NOTE, file_name: "lecture.mp3", recorded_at: "2026-10-11T11:32:45Z", part: 1, segments };
}

describe("stems", () => {
  it("matches Polish inflections without diacritics and drops function words", () => {
    expect(new Set(stems("Zbiory, zbiorów i zbiór"))).toEqual(new Set(["zbior"]));
    expect(stems("prośba")).toEqual(stems("prosby"));
    expect(stems("Czy to jest implikacja?")).toEqual(["impli"]);
    expect(stems("Łódź")).toEqual(["lodz"]);
  });
});

describe("lecture summaries", () => {
  it("reads a v2 summary: course, sessions, language, the short and stressed sections", () => {
    const d = parseLecture(logikaFile);
    expect(d.course).toBe("Logika");
    expect(d.topic).toBe("Zdania logiczne i zbiory");
    expect(d.date).toBe("2026-10-11");
    expect(d.language).toBe("pl");
    expect(d.sessions).toEqual(["2026-10-11 13-32"]);
    expect(d.short).toMatch(/^Wykład wprowadza zdania logiczne/);
    expect(d.stressed).toContain("Prawa De Morgana");
  });

  it("reads a legacy Sessions/Summary note as the summary of its session", () => {
    const d = parseLecture(file("Sessions/Summary 2026-10-13 15-53.md", LEGACY));
    expect(d.sessions).toEqual(["2026-10-13 15-53"]);
    expect(d.course).toBeNull();
    expect(d.date).toBe("2026-10-13");
    expect(d.language).toBe("en");
    expect(d.short).toMatch(/^The lecture covers what data science is/);
  });

  it("lists the cited moments in order and marks the stressed ones", () => {
    const m = lectureMoments(parseLecture(logikaFile).body);
    expect(m.map((x) => x.seconds)).toEqual([120, 1500, 300, 2400, 3000]);
    expect(m.filter((x) => x.stressed).map((x) => x.seconds)).toEqual([300, 2400]);
  });
});

describe("selectExcerpts", () => {
  const parts = transcriptParts([longRecording()]);
  const moments = lectureMoments(parseLecture(logikaFile).body);

  it("finds the passage the message is about, with its time, within the budget", () => {
    const ex = selectExcerpts(parts, { question: "Co mówił o kwantyfikatorach?", moments, budget: 3000, language: "pl" });
    expect(ex.full).toBe(false);
    expect(ex.text).toContain("Kwantyfikator ogólny");
    expect(ex.text).toMatch(/\[59:10–1:01:00\] .*Kwantyfikator ogólny/);
    expect(ex.text.length).toBeLessThanOrEqual(3000);
    expect(ex.picked).toBeLessThan(ex.total);
  });

  it("uses the reply being answered too: a bare quiz answer still finds its question's passage", () => {
    const ex = selectExcerpts(parts, {
      question: "nie wiem",
      previousReply: "Pytanie 2/5: Co mówią prawa De Morgana?",
      moments: [],
      budget: 1200,
      language: "pl",
    });
    expect(ex.text).toContain("negacja koniunkcji");
  });

  it("without a question, brings what the lecturer stressed first, then the other cited moments", () => {
    const small = selectExcerpts(parts, { moments, budget: 1700, language: "pl" });
    expect(small.text).toContain("to będzie na egzaminie");
    expect(small.text).toContain("Prawa De Morgana");
    expect(small.text).not.toContain("coś o dowodzie");
    const bigger = selectExcerpts(parts, { moments, budget: 6000, language: "pl" });
    expect(bigger.text).toContain("coś o dowodzie");
    // In recording order, whatever the priority was.
    expect(bigger.text.indexOf("Zaczynamy")).toBeLessThan(bigger.text.indexOf("egzaminie"));
    expect(bigger.text.indexOf("egzaminie")).toBeLessThan(bigger.text.indexOf("De Morgana"));
  });

  it("spreads passages over the recording when there is nothing to aim at", () => {
    const ex = selectExcerpts(parts, { question: "ok", moments: [], budget: 7000, language: "pl" });
    const starts = [...ex.text.matchAll(/^\[([\d:]+)–/gm)].map((m) => m[1].split(":").reduce((t, x) => t * 60 + Number(x), 0));
    expect(starts.length).toBeGreaterThanOrEqual(4);
    // 2000 segments of 10 s: the passages reach from the first quarter to the last.
    expect(Math.min(...starts)).toBeLessThan(5000);
    expect(Math.max(...starts)).toBeGreaterThan(15000);
  });

  it("widens the passages when the budget allows, and never goes over it", () => {
    const one = [{ note: NOTE, seconds: 3600, paragraph: null, stressed: true }];
    expect(selectExcerpts(parts, { moments: one, budget: 900, language: "pl" }).text.length).toBeLessThan(900);
    expect(selectExcerpts(parts, { moments: one, budget: 10_000, language: "pl" }).text.length).toBeGreaterThan(2000);
    const two = transcriptParts([longRecording(900), { ...longRecording(900), note_name: "b", recorded_at: "2026-10-11T14:00:00Z" }]);
    for (const budget of [300, 800, 2500, 7000, 20_000]) {
      for (const question of [undefined, "kwantyfikator ogólny", "sprawy organizacyjne numer"]) {
        expect(selectExcerpts(two, { question, moments, budget, language: "pl" }).text.length).toBeLessThanOrEqual(budget);
        expect(selectExcerpts(parts, { question, moments, budget, language: "en" }).text.length).toBeLessThanOrEqual(budget);
      }
    }
  });

  it("sends a short transcript whole", () => {
    const short = transcriptParts([longRecording(20)]);
    const ex = selectExcerpts(short, { question: "cokolwiek", moments: [], budget: 10_000, language: "pl" });
    expect(ex.full).toBe(true);
    expect(ex.picked).toBe(20);
    expect(ex.text.startsWith("[0:00–")).toBe(true);
  });

  it("labels paragraphs for an import without times and finds a cited paragraph", () => {
    const imported = transcriptParts([
      {
        note_name: "2026-10-12 notatki",
        file_name: "notatki.txt",
        recorded_at: "2026-10-12T08:00:00Z",
        part: 1,
        segments: Array.from({ length: 40 }, (_, i) => ({ start: 0, end: 0, text: i === 11 ? "Akapit dwunasty mówi o rachunku zdań." : `Akapit ${i + 1} o czymś innym, dość długi tekst wypełniający ${"x".repeat(80)}.` })),
      },
    ]);
    expect(imported[0].timed).toBe(false);
    const ex = selectExcerpts(imported, {
      moments: [{ note: "2026-10-12 notatki", seconds: null, paragraph: 12, stressed: true }],
      budget: 900,
      language: "pl",
    });
    expect(ex.text).toContain("Akapit dwunasty");
    expect(ex.text).toMatch(/\[¶\d+–\d+\]/);
  });

  it("names the part in the note's language when a lecture has several recordings", () => {
    const two = transcriptParts([
      { ...longRecording(5), note_name: "a", recorded_at: "2026-10-11T10:00:00Z" },
      { ...longRecording(5), note_name: "b", recorded_at: "2026-10-11T12:00:00Z" },
    ]);
    expect(selectExcerpts(two, { moments: [], budget: 5000, language: "pl" }).text).toContain("[cz. 2, 0:00–");
    expect(selectExcerpts(two, { moments: [], budget: 5000, language: "en" }).text).toContain("[part 2, 0:00–");
  });
});

describe("lectureContext", () => {
  it("fits the budget: the summary in full, moments as times, plots as one line, the tutoring rules", () => {
    const text = lectureContext({ file: logikaFile, rows: [longRecording()], question: "kwantyfikator", budget: 20_000 });
    expect(text.length).toBeLessThanOrEqual(20_000);
    expect(text).toContain("Lecture: Logika · 2026-10-11 · Zdania logiczne i zbiory");
    expect(text).toContain("## Na co prowadzący kładł nacisk");
    expect(text).toContain("Prawa De Morgana (40:00)");
    expect(text).toContain("## 1. Zdania i spójniki (2:00)");
    expect(text).toContain("(wykres: sin i cos)");
    expect(text).not.toContain('"functions"');
    expect(text).toContain("Dla zrozumienia (AI)");
    expect(text).toContain("Pytanie 1/5");
    expect(text).toContain("Kwantyfikator ogólny");
  });

  it("keeps what was stressed when the summary itself is too long", () => {
    const padded = LOGIKA.replace("## 2. Zbiory", `## 1b. Dygresja\n${"Bardzo długa dygresja o historii logiki. ".repeat(400)}\n\n## 2. Zbiory`);
    const text = lectureContext({ file: { ...logikaFile, content: padded }, rows: [longRecording()], budget: 12_000 });
    expect(text.length).toBeLessThanOrEqual(12_000);
    expect(text).toContain("Prawa De Morgana");
    expect(text).toContain("## Do wyjaśnienia");
    expect(text).toContain("(Podsumowanie ucięte tutaj.)");
  });

  it("says so when there is no transcript", () => {
    expect(lectureContext({ file: logikaFile, rows: [] })).toContain("only the summary is available");
  });
});

describe("tutor modes", () => {
  it("asks in the note's language", () => {
    for (const mode of ["explain", "quiz"] as const) {
      const pl = tutorRequest({ title: "Zdania logiczne i zbiory", language: "pl" }, mode);
      expect(pl).toContain("„Zdania logiczne i zbiory”");
      expect(guessLanguage(pl)).toBe("pl");
      expect(pl).not.toMatch(/\b(the|and|lecture|quiz|questions?)\b/i);
      const en = tutorRequest({ title: "Defining data science", language: "en" }, mode);
      expect(en).toContain('"Defining data science"');
      expect(guessLanguage(en)).toBe("en");
      expect(en).not.toMatch(/[ąćęłńóśźż]|wykład|pyta/i);
    }
    expect(tutorRequest({ title: "X", language: "pl" }, "quiz")).toMatch(/5 pytań, po jednym/);
    expect(tutorRequest({ title: "X", language: "en" }, "quiz")).toMatch(/5 questions, one at a time/);
  });

  it("gives each mode its rules, with the note's own headings and words", () => {
    const pl = tutorRules("pl");
    expect(pl).toContain("Write every reply in Polish");
    expect(pl).toContain('"Pytanie 1/5" to "Pytanie 5/5"');
    expect(pl).toContain('At least 3 come from "Na co prowadzący kładł nacisk"');
    expect(pl).toContain('start it with "Ode mnie:"');
    expect(pl).toContain("dobrze / częściowo / źle");
    expect(pl).toContain("one step per reply");
    const en = tutorRules("en");
    expect(en).toContain("Write every reply in English");
    expect(en).toContain('"Question 1/5"');
    expect(en).toContain('"What the lecturer stressed"');
    expect(en).toContain('"My addition:"');
  });
});

describe("openLectureTutor", () => {
  const api = (over: Partial<TutorApi> = {}) => ({
    openPanel: vi.fn(),
    sendMessage: vi.fn(async () => null),
    prefill: vi.fn(),
    isStreaming: false,
    archiveItems: [
      { id: "block-1", title: "My note" },
      { id: lectureItemId("Lectures/Old/2026-10-01 Old.md"), title: "Old" },
    ],
    addArchiveItem: vi.fn(),
    removeArchiveItem: vi.fn(),
    ...over,
  });
  const lecture = { path: logikaFile.path, title: "Zdania logiczne i zbiory", language: "pl" as const };

  it("pins this lecture instead of any other, opens the panel and asks in one click", () => {
    const a = api();
    openLectureTutor(a, lecture, "quiz");
    const item = { id: lectureItemId(lecture.path), title: lecture.title };
    expect(isLectureItem(item)).toBe(true);
    expect(a.removeArchiveItem).toHaveBeenCalledWith(lectureItemId("Lectures/Old/2026-10-01 Old.md"));
    expect(a.removeArchiveItem).toHaveBeenCalledTimes(1);
    expect(a.addArchiveItem).toHaveBeenCalledWith(item);
    expect(a.openPanel).toHaveBeenCalled();
    expect(a.sendMessage).toHaveBeenCalledWith(tutorRequest(lecture, "quiz"), {
      archiveItems: [{ id: "block-1", title: "My note" }, item],
    });
  });

  it("leaves the request in the input while a reply is still streaming", () => {
    const a = api({ isStreaming: true });
    openLectureTutor(a, lecture, "explain");
    expect(a.sendMessage).not.toHaveBeenCalled();
    expect(a.prefill).toHaveBeenCalledWith(tutorRequest(lecture, "explain"));
    expect(a.addArchiveItem).toHaveBeenCalled();
  });
});

describe("knowledge scope", () => {
  const files: VaultFile[] = [
    logikaFile,
    file("Sessions/Summary 2026-10-13 15-53.md", LEGACY),
    file(
      "Knowledge/Implication.md",
      `---\ntype: definition\nsources: ["[[Recordings/${NOTE}#^t0300]]"]\naliases: [implikacja]\ncourse: Logika\n---\n# Implication\n\nAn implication is false only when the antecedent is true and the consequent false.\n\n> "implikacja jest fałszywa tylko gdy" ([[Recordings/${NOTE}#^t0300]])\n`,
      "2026-10-11T12:00:00Z",
    ),
    file(
      "Knowledge/Reciprocity.md",
      `---\ntype: principle\naliases: ["wzajemność"]\n---\n# Reciprocity\n\nPeople return favours.\n`,
      "2026-10-14T12:00:00Z",
    ),
    file(
      "Knowledge/Data science is the study of data.md",
      `---\ntype: definition\n---\n# Data science is the study of data\n\nData science studies data.\n`,
      "2026-10-13T12:00:00Z",
    ),
  ];

  it("ranks by word overlap, and an alias lets a Polish question find an English note", () => {
    const text = knowledgeContext(files, "Kiedy implikacja jest fałszywa?");
    expect(text).toContain("Ranked by word overlap");
    const notes = text.slice(text.indexOf("Best matching knowledge notes"));
    expect(notes.split("\n")[1]).toMatch(/^- \[definition\] Implication \(= implikacja; Logika\): An implication is false/);
    expect(notes).toContain("· 5:00)");
    expect(notes).not.toContain("Reciprocity");
    const lectures = text.slice(text.indexOf("Best matching lectures"), text.indexOf("Best matching knowledge notes"));
    expect(lectures.split("\n")[1]).toMatch(/^- Logika · 2026-10-11 · Zdania logiczne i zbiory \[pl\] \(Lectures\/Logika\//);
    expect(lectures).toContain("Stressed: Implikacja jest fałszywa");
  });

  it("matches with or without diacritics", () => {
    expect(knowledgeContext(files, "wzajemność")).toContain("[principle] Reciprocity (= wzajemność)");
    expect(knowledgeContext(files, "wzajemnosc")).toContain("[principle] Reciprocity");
  });

  it("indexes every lecture with its course (legacy ones under Other) and lists the newest without a match", () => {
    const text = knowledgeContext(files, "pogoda na jutro");
    expect(text).toContain("Nothing shares words with the message");
    expect(text).toContain("Lecture summaries: 2 (Logika 1, Other 1). Knowledge notes: 3.");
    expect(text).toContain("- Other · 2026-10-13 · Defining data science, cloud and file formats [en]");
    const newest = text.slice(text.indexOf("Newest knowledge notes"));
    expect(newest.split("\n")[1]).toContain("Reciprocity");
  });

  it("says where the notes come from when there are none", () => {
    expect(knowledgeContext([], "x")).toMatch(/^No lecture summaries or knowledge notes yet/);
  });
});

describe("the pinned lecture in the assistant's context", () => {
  fake.tables.kos_vault_files = [{ ...logikaFile, user_id: "u2" }];
  fake.tables.kos_recordings = [{ ...longRecording(), user_id: "u2", session_key: "2026-10-11 13-32" }];

  it("loads the summary and its sessions' recordings", async () => {
    const text = await gatherLectureItems("u2", [{ id: lectureItemId(logikaFile.path), title: "Zdania" }], "kwantyfikator");
    expect(text).toContain("Kwantyfikator ogólny");
    expect(text).toContain("## W skrócie");
    const rec = fake.calls.find((c) => c.table === "kos_recordings" && c.filters.some(([op, col]) => op === "in" && col === "session_key"));
    expect(rec?.filters).toContainEqual(["in", "session_key", ["2026-10-11 13-32"]]);
  });

  it("goes first, with its own citation, and pinned archive notes still load", async () => {
    fake.tables.archive_blocks = [{ id: "b1", user_id: "u2", title: "Moja notatka", content: "treść" }];
    const { text, citations } = await gatherContext(
      "u2",
      [],
      [{ id: "b1", title: "Moja notatka" }, { id: lectureItemId(logikaFile.path), title: "Zdania" }],
      "De Morgan",
      "Pytanie 1/5: co mówią prawa De Morgana?",
    );
    const lecture = text.indexOf("## 🎓 Pinned lecture");
    expect(lecture).toBeGreaterThan(0);
    expect(lecture).toBeLessThan(text.indexOf("## 📦 Archive items"));
    expect(text).toContain("--- Archive note: Moja notatka ---");
    expect(text).toContain("negacja koniunkcji");
    expect(citations).toEqual([
      { key: lectureItemId(logikaFile.path), label: "Zdania", icon: "🎓" },
      { key: "archive:b1", label: "Moja notatka", icon: "📦" },
    ]);
  });
});

describe("keywordScopes: knowledge", () => {
  it("brings lectures along for lecture, class and exam words in Polish and English", () => {
    expect(keywordScopes("Sprawdź mnie z wykładu z logiki")).toContain("knowledge");
    expect(keywordScopes("co było na zajęciach w sobotę")).toContain("knowledge");
    expect(keywordScopes("notatki z zajęć")).toEqual(["archive", "knowledge"]);
    expect(keywordScopes("co będzie na egzaminie")).toEqual(["knowledge"]);
    expect(keywordScopes("przed kolokwium")).toEqual(["knowledge"]);
    expect(keywordScopes("ile mam wiedzy o zbiorach")).toEqual(["knowledge"]);
    expect(keywordScopes("what did the lecturer say about sets")).toEqual(["knowledge"]);
    expect(keywordScopes("my course on statistics")).toEqual(["knowledge"]);
  });

  it("leaves busy, knowing and 'of course' alone", () => {
    expect(keywordScopes("jestem dziś zajęty, wszyscy są zajęci")).toEqual([]);
    expect(keywordScopes("nie wiedziałem o tym")).toEqual([]);
    expect(keywordScopes("yes of course, go ahead")).toEqual([]);
  });
});
