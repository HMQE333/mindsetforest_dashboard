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
  BUILTIN_LEARNING,
  KNOWLEDGE_MAX_CHARS,
  PASSAGES_MAX,
  STUDY_PACK_MAX,
  buildCoursePack,
  buildStudyPack,
  claudeInstruction,
  knowledgeContext,
  lectureMoments,
  loadLectureRecordings,
  mergeGlossary,
  parseLecture,
  plainMarkdown,
  plainNote,
  selectExcerpts,
  stems,
  takeGlossary,
  transcriptParts,
  type RecordingInput,
} from "../lib/lecture-tutor";
import { gatherContext } from "../lib/assistant-context";
import { keywordScopes } from "../lib/scope-hints";
import { groupLectures, guessLanguage, indexVault, parseLectureSummary, type VaultFile } from "../lib/kos-vault";
import { FIXTURE_FILES, FIXTURE_RECORDINGS, FIXTURE_SEGMENTS, REC_PL } from "./lecture-fixtures";

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

  it("brings what the lecturer stressed first, then the other cited moments", () => {
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
    const ex = selectExcerpts(parts, { moments: [], budget: 7000, language: "pl" });
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
      for (const m of [moments, [], one]) {
        expect(selectExcerpts(two, { moments: m, budget, language: "pl" }).text.length).toBeLessThanOrEqual(budget);
        expect(selectExcerpts(parts, { moments: m, budget, language: "en" }).text.length).toBeLessThanOrEqual(budget);
      }
    }
  });

  it("sends a short transcript whole", () => {
    const short = transcriptParts([longRecording(20)]);
    const ex = selectExcerpts(short, { moments: [], budget: 10_000, language: "pl" });
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

// -- the hand-off: a vault note as plain Markdown, the study pack, Claude, the course pack ----

const index = indexVault(FIXTURE_FILES);
const lectureAt = (p: string) => index.lectureByPath.get(p.replace(/\.md$/i, "").toLowerCase())!;
const PL = lectureAt("Lectures/Logika/2026-10-11 Zdania logiczne i zbiory.md");
const PL2 = lectureAt("Lectures/Logika/2026-10-18 Kwantyfikatory.md");
const EN = lectureAt("Lectures/Intro to Data Science/2026-10-12 Measuring spread.md");
const TEXTBOOK = lectureAt("Lectures/Logika/_Podręcznik.md");
const rowsOf = (id: string): RecordingInput[] => {
  const r = FIXTURE_RECORDINGS.find((x) => x.id === id)!;
  return [{ note_name: r.note_name, file_name: r.file_name, recorded_at: r.recorded_at, part: r.part, segments: FIXTURE_SEGMENTS[id] }];
};
const LEARNING = "Tryb nauki: mój spersonalizowany workflow\nUcz mnie tak, żeby maksymalizować szybkie zrozumienie.\n1. Najpierw mapa dziedziny.";

describe("plainMarkdown", () => {
  it("turns links into their text, moments into times, callouts into bold titles and plots into one line", () => {
    const out = plainMarkdown(PL.body, "pl");
    expect(out).toContain("## 1. Zdanie logiczne (12:34)");
    expect(out).toContain("## 4. Funkcja zdaniowa i zbiór spełnienia (1:05:20)");
    expect(out).toContain("(zob. Implikacja)");
    expect(out).toContain("> **Dla zrozumienia (AI)**");
    expect(out).toContain("> **Słowniczek PL ↔ EN**");
    expect(out).toContain("> [wykres: x^2 < 4]");
    expect(out).toContain("> [wykres 3D: Siodło]");
    // Mermaid stays a code block; the plot JSON is gone.
    expect(out).toContain('> ```mermaid\n> flowchart LR\n>   N["ℕ: liczby naturalne"]');
    expect(out).not.toContain('"functions"');
    expect(out).not.toMatch(/\[\[|\]\]|\[!\w+\]/);
    // Math stays LaTeX for the model to read.
    expect(out).toContain("$p \\Rightarrow q$");
  });

  it("uses the note's language for a callout without a title and for plots, and drops Obsidian comments", () => {
    expect(plainMarkdown("> [!example]-\n> x", "en")).toBe("> **Example**\n> x");
    expect(plainMarkdown("> [!example]-\n> x", "pl")).toBe("> **Przykład**\n> x");
    expect(plainMarkdown('```plot\n{"x": [-1, 1], "functions": [{"expr": "x^2", "label": "parabola"}]}\n```', "en")).toBe("[plot: parabola]");
    expect(plainMarkdown('```plot3d\n{"kind": "points", "points": []}\n```', "pl")).toBe("[wykres 3D]");
    expect(plainMarkdown("a %%ukryte%% b\n%%cała linia%%\nc", "pl")).toBe("a  b\nc");
    expect(plainMarkdown("```js\nconst a = [[1]];\n```", "pl")).toBe("```js\nconst a = [[1]];\n```");
  });

  it("labels paragraphs of an import", () => {
    expect(plainMarkdown(EN.body, "en")).toContain("## 1. Why the mean is not enough (¶3)");
  });
});

describe("plainNote", () => {
  it("returns a note that fits whole, and when it does not, keeps the map, what was stressed and what to memorise", () => {
    expect(plainNote(PL2.body, "pl", 50_000)).toEqual({ text: plainMarkdown(PL2.body, "pl"), cut: false });
    const padded = PL2.body.replace("## 2. Kwantyfikator szczegółowy", `## 1b. Dygresja\n${"Bardzo długa dygresja o historii logiki. ".repeat(300)}\n\n## 2. Kwantyfikator szczegółowy`);
    const { text, cut } = plainNote(padded, "pl", 6000);
    expect(cut).toBe(true);
    expect(text.length).toBeLessThanOrEqual(6000);
    for (const kept of ["## W skrócie", "## Mapa wykładu", "```mermaid", "## Na co prowadzący kładł nacisk", "> **Do zapamiętania**", "## 3. Negacja"]) {
      expect(text).toContain(kept);
    }
    expect(text).toMatch(/\(Skrócone, żeby się zmieścić\. Całość jest w Obsidianie i w pakiecie przedmiotu\.\)$/);
    // What is kept stays in the note's order.
    expect(text.indexOf("## Mapa wykładu")).toBeLessThan(text.indexOf("## 1. Kwantyfikator ogólny"));
    expect(text.indexOf("## 1. Kwantyfikator ogólny")).toBeLessThan(text.indexOf("## Na co prowadzący"));
  });
});

describe("buildStudyPack", () => {
  it("without a ChatGPT project: the learning mode first, then the material, the passages, the rules and the start", () => {
    const pack = buildStudyPack({ lecture: PL, rows: rowsOf("rec-pl"), mode: "explain", learningMode: LEARNING, projectUrl: "" });
    expect(pack.startsWith(`# Jak mnie uczyć\n\n${LEARNING}\n\n# Materiał: Logika — Zdania logiczne i zbiory (2026-10-11)\n\n## W skrócie\n`)).toBe(true);
    expect(pack).toContain("## Na co prowadzący kładł nacisk");
    expect(pack).toContain("(26:20)");
    expect(pack).toContain("## Fragmenty zapisu wykładu\n(Cały zapis. Transkrypcja automatyczna, może przekręcać słowa.)");
    expect(pack).toMatch(/^\[0:00–[\d:]+\] Dzień dobry państwu/m);
    expect(pack).toContain("Z fałszu wynika wszystko, proszę to zapamiętać.");
    expect(pack).toContain("Zasady: trzymaj się tego materiału. To, co dodajesz od siebie, wyraźnie zaznacz („Ode mnie:”). Kiedy to pomaga, rysuj w czacie diagramy i wykresy.");
    expect(pack.endsWith("Zacznij od mapy tego wykładu (punkt 1 mojego trybu), potem prowadź mnie pętlą Predict → Name → Place → Refine.")).toBe(true);
    // The summary comes before the transcript, the rules after both.
    expect(pack.indexOf("## Pojęcia")).toBeLessThan(pack.indexOf("## Fragmenty zapisu"));
    expect(pack.indexOf("## Fragmenty zapisu")).toBeLessThan(pack.indexOf("Zasady:"));
    expect(pack).not.toMatch(/\[\[|\]\]|"functions"/);
  });

  it("with a ChatGPT project: one line instead of the learning mode", () => {
    const pack = buildStudyPack({ lecture: PL, rows: [], mode: "explain", learningMode: LEARNING, projectUrl: "https://chatgpt.com/g/g-p-abc/project" });
    expect(pack.startsWith("Ucz mnie według instrukcji tego projektu (tryb nauki).\n\n# Materiał: Logika")).toBe(true);
    expect(pack).not.toContain("Jak mnie uczyć");
    expect(pack).not.toContain("spersonalizowany workflow");
    // No transcript rows: no passages section.
    expect(pack).not.toContain("Fragmenty zapisu");
  });

  it("without a learning mode in Settings: a short built-in summary of the method", () => {
    const pack = buildStudyPack({ lecture: PL, rows: [], mode: "explain", learningMode: "  ", projectUrl: "" });
    expect(pack.startsWith(`# Jak mnie uczyć\n\n${BUILTIN_LEARNING.pl}\n\n# Materiał`)).toBe(true);
    expect(BUILTIN_LEARNING.pl).toMatch(/^Prowadź mnie według mojego trybu nauki:\n1\. Najpierw mapa/);
    expect(BUILTIN_LEARNING.pl).toContain("Predict → Name → Place → Refine");
    expect(BUILTIN_LEARNING.pl).toContain("A/B/C/D");
  });

  it("a link that would not open the project does not stand in for the learning mode", () => {
    for (const projectUrl of ["https://chatgpt.com:8443/g/x", "https://example.com/g/x", "chatgpt.com/g/x"]) {
      const pack = buildStudyPack({ lecture: PL, rows: [], mode: "explain", learningMode: LEARNING, projectUrl });
      expect(pack.startsWith(`# Jak mnie uczyć\n\n${LEARNING.trim()}`)).toBe(true);
    }
  });

  it("says which language to talk in, just before the opening move", () => {
    const pl = buildStudyPack({ lecture: PL, rows: [], mode: "explain", learningMode: LEARNING });
    expect(pl).toContain("\n\nJęzyk: rozmawiaj ze mną po polsku, w języku tego materiału.\n\nZacznij od mapy");
    // An English lecture with the user's Polish learning mode: still English.
    const en = buildStudyPack({ lecture: EN, rows: [], mode: "test", learningMode: LEARNING });
    expect(en).toContain(LEARNING.trim());
    expect(en).toContain("\n\nLanguage: talk to me in English, the language of this material, even where my learning mode is written in Polish.\n\ntest: start");
  });

  it("test mode starts with A/B/C/D questions from what the lecturer stressed", () => {
    const pack = buildStudyPack({ lecture: PL, rows: [], mode: "test", learningMode: LEARNING });
    expect(pack.endsWith("test: zacznij od pytań A/B/C/D z sensownymi dystraktorami, głównie z „Na co prowadzący kładł nacisk”, po jednym; potem krótkie odtwarzanie.")).toBe(true);
  });

  it("speaks the note's language: an English note gets an English pack", () => {
    const pack = buildStudyPack({ lecture: EN, rows: rowsOf("rec-en"), mode: "test", learningMode: "", projectUrl: "" });
    expect(pack.startsWith(`# How to teach me\n\n${BUILTIN_LEARNING.en}\n\n# Material: Intro to Data Science — Measuring spread: variance and standard deviation (2026-10-12)`)).toBe(true);
    expect(pack).toContain("## Transcript passages\n(The whole transcript. Speech-to-text, may mishear words.)");
    expect(pack).toContain("[¶1–");
    expect(pack).toContain("(¶3)");
    expect(pack).toContain('Rules: stick to this material. Mark clearly what you add yourself ("My addition:").');
    expect(pack.endsWith('test: start with A/B/C/D questions with plausible distractors, mostly from "What the lecturer stressed", one at a time; then short recall.')).toBe(true);
    const chrome = pack.replace(EN.body, "");
    expect(chrome).not.toMatch(/[ąćęłńśźż]|Materiał|Zasady|Zacznij/);
    expect(guessLanguage(pack)).toBe("en");
    const project = buildStudyPack({ lecture: EN, rows: [], mode: "explain", projectUrl: "https://chatgpt.com/g/g-p-1/project" });
    expect(project.startsWith("Teach me following this project's instructions (my learning mode).")).toBe(true);
    expect(project.endsWith("Start with the map of this lecture (point 1 of my learning mode), then take me through the Predict → Name → Place → Refine loop.")).toBe(true);
  });

  it("keeps a long transcript to its most important passages, stressed moments first", () => {
    const lecture = parseLectureSummary(logikaFile);
    const pack = buildStudyPack({ lecture, rows: [longRecording()], mode: "explain", learningMode: LEARNING });
    const passages = pack.slice(pack.indexOf("## Fragmenty zapisu"), pack.indexOf("---\n\nZasady"));
    expect(passages).toContain("(Najważniejsze fragmenty, najpierw to, na co prowadzący kładł nacisk.");
    expect(passages.length).toBeLessThanOrEqual(PASSAGES_MAX + 200);
    expect(passages).toContain("to będzie na egzaminie");
    expect(passages).toContain("Prawa De Morgana");
    expect(passages).toMatch(/^\[\d+:\d{2}–/m);
  });

  it("never goes over the cap: the summary whole first, then what room is left for passages", () => {
    const long = parseLectureSummary({
      ...logikaFile,
      content: LOGIKA.replace("## 2. Zbiory", `## 1b. Dygresja\n${"Bardzo długa dygresja o historii logiki. ".repeat(600)}\n\n## 2. Zbiory`),
    });
    const fits = buildStudyPack({ lecture: long, rows: [longRecording()], mode: "explain", learningMode: LEARNING });
    expect(fits.length).toBeLessThanOrEqual(STUDY_PACK_MAX);
    expect(fits.match(/Bardzo długa dygresja/g)).toHaveLength(600);
    expect(fits).not.toContain("Skrócone");
    // The summary took most of the room: the passages get what is left, not their usual 6000.
    const passages = fits.slice(fits.indexOf("## Fragmenty zapisu"), fits.indexOf("---\n\nZasady"));
    expect(passages.length).toBeGreaterThan(400);
    expect(passages.length).toBeLessThan(PASSAGES_MAX - 1000);
    const huge = parseLectureSummary({
      ...logikaFile,
      content: LOGIKA.replace("## 2. Zbiory", `## 1b. Dygresja\n${"Bardzo długa dygresja o historii logiki. ".repeat(2000)}\n\n## 2. Zbiory`),
    });
    for (const learningMode of [LEARNING, "x".repeat(40_000)]) {
      const pack = buildStudyPack({ lecture: huge, rows: [longRecording()], mode: "test", learningMode });
      expect(pack.length).toBeLessThanOrEqual(STUDY_PACK_MAX);
      expect(pack).toContain("Prawa De Morgana");
      expect(pack).toContain("(Skrócone, żeby się zmieścić.");
      expect(pack).toContain("test: zacznij od pytań A/B/C/D");
    }
  });

  it("names the part of a lecture recorded in two files", () => {
    const two = [
      { ...rowsOf("rec-pl")[0] },
      { note_name: "2026-10-11 15-00-00 Logika cz 2", file_name: "b.mp3", recorded_at: "2026-10-11T13:00:00Z", part: 2, segments: [{ start: 5, end: 9, text: "Druga część." }] },
    ];
    const pack = buildStudyPack({ lecture: PL, rows: two, mode: "explain", learningMode: LEARNING });
    expect(pack).toContain("## 1. Zdanie logiczne (cz. 1, 12:34)");
    expect(pack).toContain("[cz. 2, 0:05–0:09] Druga część.");
  });

  it("packs a textbook without a transcript, opening on the course map", () => {
    const pack = buildStudyPack({ lecture: TEXTBOOK, mode: "explain", learningMode: LEARNING });
    expect(pack).toContain("# Materiał: Logika — Podręcznik przedmiotu (2026-10-19)");
    expect(pack).toContain("## Mapa przedmiotu\n```mermaid");
    expect(pack).toContain("## Pytania sprawdzające");
    expect(pack).toContain("pierwszy wykład (2026-10-11)");
    expect(pack).not.toContain("Fragmenty zapisu");
    expect(pack.endsWith("Zacznij od mapy tego przedmiotu (punkt 1 mojego trybu), potem prowadź mnie pętlą Predict → Name → Place → Refine.")).toBe(true);
    expect(buildStudyPack({ lecture: TEXTBOOK, mode: "test" })).toMatch(/głównie z „Pytań sprawdzających” i „Do zapamiętania”, po jednym; potem krótkie odtwarzanie\.$/);
  });
});

describe("a textbook too long for the pack", () => {
  const section = (heading: string, chars: number) => `## ${heading}\n${"Zdanie o tym, jak działa przedmiot. ".repeat(Math.ceil(chars / 36))}`;
  const body = [
    "## W skrócie\nCały przedmiot w trzech zdaniach.",
    "## Mapa przedmiotu\n```mermaid\nflowchart LR\n  A --> B\n```",
    section("Mechanizmy", 9000),
    section("Ograniczenia", 3000),
    section("Co zapamiętać, a co wyprowadzić", 3000),
    section("Cały przedmiot na jednej stronie", 2000),
    section("Pytania sprawdzające", 6000),
  ].join("\n\n");

  it("keeps the mechanisms and constraints whole and cuts the questions first", () => {
    const { text, cut } = plainNote(body, "pl", 20_000);
    expect(cut).toBe(true);
    const part = (h: string) => text.slice(text.indexOf(`## ${h}`)).split("\n## ")[0];
    expect(part("Mechanizmy").length).toBeGreaterThan(9000);
    expect(part("Ograniczenia").length).toBeGreaterThan(3000);
    expect(text).toContain("## Mapa przedmiotu");
    expect(text).toContain("## Cały przedmiot na jednej stronie");
    expect(text.indexOf("## Pytania sprawdzające") === -1 || part("Pytania sprawdzające").length < 6000).toBe(true);
    expect(text.length).toBeLessThanOrEqual(20_000);
  });
});

describe("claudeInstruction", () => {
  it("names the note's vault path and the learning mode file, in the note's language", () => {
    const pl = claudeInstruction(PL, "Tryb nauki: …");
    expect(pl).toBe(
      "Przegadajmy wykład z mojego skarbca Obsidiana „Studia”: Lectures/Logika/2026-10-11 Zdania logiczne i zbiory.md\n" +
        "Najpierw przeczytaj _SYSTEM/learning-mode.md (mój tryb nauki) i prowadź mnie według niego.\n" +
        "Trzymaj się tej notatki i zapisu wykładu, do którego linkuje (Recordings/); to, co dodajesz od siebie, zaznacz. Zacznij od mapy wykładu.\n" +
        "Nie zmieniaj niczego w _SYSTEM/ (nadpisuje to tracker). Log nauki zapisz, jeśli chcesz, w osobnej notatce poza _SYSTEM/.",
    );
    const en = claudeInstruction(EN, "Tryb nauki: …");
    expect(en).toContain('Let\'s talk through the lecture in my Obsidian vault "Studia": Lectures/Intro to Data Science/2026-10-12 Measuring spread.md');
    expect(en).toContain("First read _SYSTEM/learning-mode.md (my learning mode)");
    expect(en).toContain("Talk to me in English");
    expect(en).toContain("Do not change anything in _SYSTEM/");
    expect(guessLanguage(en)).toBe("en");
    expect(claudeInstruction(TEXTBOOK, "x")).toContain("Przegadajmy podręcznik przedmiotu z mojego skarbca Obsidiana „Studia”: Lectures/Logika/_Podręcznik.md");
    expect(claudeInstruction(TEXTBOOK, "x")).toContain("Zacznij od mapy przedmiotu.");
  });

  it("brings the built-in method when no learning mode is saved (the tracker then wrote no file)", () => {
    const pl = claudeInstruction(PL);
    expect(pl).toContain("Jeśli jest plik _SYSTEM/learning-mode.md (mój tryb nauki), przeczytaj go i prowadź mnie według niego. Jeśli go nie ma:\n");
    expect(pl).toContain(BUILTIN_LEARNING.pl);
    expect(pl).not.toContain("Najpierw przeczytaj");
    expect(claudeInstruction(EN, "  ")).toContain(BUILTIN_LEARNING.en);
  });
});

describe("the course pack", () => {
  it("is the textbook, then every summary oldest first, then one merged glossary", () => {
    const logika = groupLectures(index.lectures, "", index.textbooks).find((g) => g.course === "Logika")!;
    const pack = buildCoursePack(logika);
    expect(pack.fileName).toBe("Logika – pakiet do nauki.md");
    expect(pack.language).toBe("pl");
    const heads = pack.text.split("\n").filter((l) => /^# /.test(l));
    expect(heads).toEqual([
      "# Logika – pakiet do nauki",
      "# Podręcznik przedmiotu (zaktualizowany 2026-10-19)",
      "# Zdania logiczne i zbiory (2026-10-11)",
      "# Kwantyfikatory (2026-10-18)",
      "# Słowniczek PL ↔ EN",
    ]);
    // The glossaries leave the summaries and come back once, one line per term, the first one kept.
    expect(pack.text.match(/Słowniczek PL ↔ EN/g)).toHaveLength(1);
    const glossary = pack.text.slice(pack.text.indexOf("# Słowniczek PL ↔ EN"));
    expect(glossary.split("\n").filter((l) => l.startsWith("- "))).toEqual([
      "- **implikacja**: implication",
      "- **kwantyfikator ogólny**: universal quantifier",
      "- **kwantyfikator szczegółowy**: existential quantifier",
      "- **zbiór**: set",
      "- **zbiór spełnienia**: solution set",
      "- **zdanie logiczne**: proposition",
    ]);
    expect(pack.text).toContain("> **Do zapamiętania**");
    expect(pack.text).toContain("[wykres 3D: Siodło]");
    expect(pack.text).not.toMatch(/\[\[|\]\]|"functions"/);
    expect(pack.text.endsWith("\n")).toBe(true);
  });

  it("speaks English for an English course and makes the course name safe as a file name", () => {
    const en = buildCoursePack({ course: "Intro to Data Science", lectures: [EN], textbook: null });
    expect(en.fileName).toBe("Intro to Data Science – study pack.md");
    expect(en.text).toContain("# Intro to Data Science – study pack\n\nThe summaries of every lecture (1), oldest first; one merged glossary at the end.");
    expect(en.text).toContain("# Glossary EN ↔ PL\n\n- **standard deviation**: odchylenie standardowe\n- **variance**: wariancja");
    expect(buildCoursePack({ course: 'Fizyka: ruch/siły?', lectures: [PL], textbook: null }).fileName).toBe("Fizyka- ruch-siły- – pakiet do nauki.md");
  });

  it("in a mixed course, merges only the pack language's glossaries; the other note keeps its own", () => {
    const mixed = buildCoursePack({ course: "Inne", lectures: [PL, EN], textbook: null });
    expect(mixed.language).toBe("pl");
    const merged = mixed.text.slice(mixed.text.lastIndexOf("# Słowniczek PL ↔ EN"));
    expect(merged).toContain("- **zbiór**: set");
    expect(merged).not.toContain("variance");
    // The English summary keeps its EN ↔ PL glossary under it.
    expect(mixed.text).toMatch(/Measuring spread[\s\S]*\*\*variance\*\*[\s\S]*# Słowniczek PL ↔ EN/);
  });

  it("takes glossary callouts out of a note and merges entries by term", () => {
    const g = takeGlossary("Tekst.\n\n> [!note]- Słowniczek PL ↔ EN\n> - **zbiór**: set\n> 2. implikacja = implication\n\nDalej.");
    expect(g.body).toBe("Tekst.\n\n\nDalej.");
    expect(g.entries).toEqual(["**zbiór**: set", "implikacja = implication"]);
    expect(takeGlossary("> [!tip]- Wskazówka\n> - a: b").entries).toEqual([]);
    expect(mergeGlossary(["**Zbiór**: set", "zbior: collection", "*b* — c", "a → d"])).toEqual(["a → d", "*b* — c", "**Zbiór**: set"]);
  });
});

describe("loading a lecture's transcript", () => {
  it("fetches its sessions' recordings and the ones it cites, once", async () => {
    fake.tables.kos_recordings = [
      { ...rowsOf("rec-pl")[0], user_id: "u3", session_key: "2026-10-11 13-32" },
      { ...rowsOf("rec-pl")[0], note_name: "other", user_id: "u3", session_key: "2026-10-01 10-00" },
    ];
    const before = fake.calls.length;
    const rows = await loadLectureRecordings("u3", PL);
    expect(rows.map((r) => r.note_name)).toEqual([REC_PL]);
    const calls = fake.calls.slice(before);
    expect(calls.find((c) => c.filters.some(([, col]) => col === "session_key"))?.filters).toContainEqual(["in", "session_key", ["2026-10-11 13-32"]]);
    expect(calls.find((c) => c.filters.some(([, col]) => col === "note_name"))?.filters).toContainEqual(["in", "note_name", [REC_PL]]);
    const again = fake.calls.length;
    await loadLectureRecordings("u3", PL);
    expect(fake.calls.length).toBe(again);
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

  it("points long study sessions to ChatGPT and Claude, and names textbooks without listing them as lectures", () => {
    const text = knowledgeContext(FIXTURE_FILES, "kwantyfikator");
    expect(text).toContain('presses "Ucz się w ChatGPT" or "Test w ChatGPT"');
    expect(text).toContain("Course textbooks (built from the summaries): Logika (Lectures/Logika/_Podręcznik.md, 2026-10-19).");
    expect(text).toContain("Lecture summaries: 4 (Logika 2, Intro to Data Science 1, Other 1).");
    expect(text).not.toContain("Logika · 2026-10-19 · Podręcznik przedmiotu");
    expect(text).not.toContain("Przegadaj temat");
  });

  it("stays under the cap however big the vault is", () => {
    const many: VaultFile[] = [];
    for (let i = 0; i < 150; i++) {
      many.push(file(`Lectures/Kurs ${i % 7}/2026-09-${String((i % 28) + 1).padStart(2, "0")} Temat ${i}.md`, LOGIKA.replace('topic: "Zdania logiczne i zbiory"', `topic: "Temat ${i} o implikacji"`).replace('course: "Logika"', `course: "Kurs ${i % 7}"`)));
    }
    for (let i = 0; i < 400; i++) {
      many.push(file(`Knowledge/Implikacja ${i}.md`, `---\ntype: definition\naliases: [implication]\n---\n# Implikacja ${i}\n\n${"Implikacja jest fałszywa tylko wtedy, gdy poprzednik jest prawdziwy. ".repeat(6)}\n`));
    }
    for (const q of ["implikacja", "pogoda", undefined]) {
      const text = knowledgeContext(many, q);
      expect(text.length).toBeLessThanOrEqual(KNOWLEDGE_MAX_CHARS);
      expect(text).toContain("All lectures");
    }
  });
});

describe("the knowledge scope in the assistant's context", () => {
  it("sends summaries and notes for short questions, never a transcript", async () => {
    fake.tables.kos_vault_files = [{ ...logikaFile, user_id: "u2" }];
    fake.tables.kos_recordings = [{ ...longRecording(), user_id: "u2", session_key: "2026-10-11 13-32" }];
    const before = fake.calls.length;
    const { text, citations } = await gatherContext("u2", ["knowledge"], [], "Co mówił o kwantyfikatorach?");
    expect(text).toContain("Logika · 2026-10-11 · Zdania logiczne i zbiory");
    expect(text).not.toContain("Kwantyfikator ogólny mówi");
    expect(fake.calls.slice(before).some((c) => c.table === "kos_recordings")).toBe(false);
    expect(citations).toEqual([{ key: "knowledge", label: "Wykłady", icon: "🎓" }]);
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
