import { describe, it, expect } from "vitest";
import {
  appendNote,
  childrenMap,
  compareSiblings,
  counts,
  descendants,
  droppedWith,
  editPatch,
  frontier,
  hasRecord,
  isBareUrl,
  isRecord,
  isRule,
  isWaiting,
  lineOf,
  linkOf,
  nextPerRoot,
  nodeFieldsOf,
  openDescendants,
  outline,
  parseLine,
  parsePaste,
  pasteStructure,
  placeholderFor,
  placeNew,
  planMove,
  planTree,
  PLACEHOLDERS,
  recordIds,
  renumber,
  setKindUnder,
  settleDrops,
  siblingsAt,
  stateOf,
  statePatch,
  titleSettle,
  wouldCycle,
  type PlanNode,
} from "../lib/planning-model";

const T0 = "2026-10-15T10:00:00.000Z";
const NOW = "2026-10-15T12:00:00.000Z";

let seq = 0;
function node(id: string, parent_id: string | null, title: string, extra: Partial<PlanNode> = {}): PlanNode {
  seq += 1;
  return {
    id, board_id: "b1", parent_id, title,
    ask: false, done: false, dropped: false, guess: null, outcome: null, verdict: null, closed_at: null,
    sort_order: seq, created_at: T0,
    ...extra,
  };
}

/** A pasted outline as stored nodes (what insertTree writes), ids n1, n2, ... */
function treeOf(text: string): PlanNode[] {
  let i = 0;
  const plan = planTree(parsePaste(text), null, 1, () => `n${++i}`);
  return plan.rows.map((r) => ({
    id: r.id, board_id: "b1", parent_id: r.parent_id, title: r.title,
    ask: r.ask, done: r.done, dropped: false, guess: r.guess, outcome: r.outcome, verdict: null,
    closed_at: r.done ? T0 : null, sort_order: r.sort_order, created_at: T0,
  }));
}

const idOf = (nodes: PlanNode[], title: string) => {
  const n = nodes.find((x) => x.title === title);
  if (!n) throw new Error(`no node "${title}"`);
  return n.id;
};
const titles = (nodes: PlanNode[], ids: Iterable<string>) =>
  [...ids].map((id) => nodes.find((n) => n.id === id)!.title);

/** Applies the patch columns to the given ids (what usePlanningState writes). */
function apply(nodes: PlanNode[], ids: string[], patch: Partial<PlanNode>): PlanNode[] {
  return nodes.map((n) => (ids.includes(n.id) ? { ...n, ...patch } : n));
}

// The worked example from the planning analysis (result.json), pasted with 2 spaces per level.
const RYBIAPAKA = [
  "Reach 1,000 active users",
  "  Which channel do we push next month? ~ creators",
  "    Creator partnerships",
  "      Will creators accept CPA? ~ yes if payout > X",
  "        Contact 10 creators",
  "      Which creator size converts best?",
  "      Run micro-creator campaign",
  "    Referral system",
  "      Does the current reward motivate? ~ no",
  "        Test alternative reward",
].join("\n");

// His real "Zawody" spec, one paste.
const ZAWODY = [
  "Zawody RybiaPaka",
  "  Kto organizuje zawody? = wyłącznie Rybia Paka",
  "  Czy nagrody mogą być losowane? = nie, każda nagroda za wynik",
  "  Kody pisane na kartce? = odrzucone, nie sprawdzi się w praktyce",
  "  Jaka część puli idzie na nagrody? = minimum 20%",
  "  Jakie tryby widoczności? = Otwarte, Częściowo zakryte, Koperta",
  "  Jaki procent wpisowego na nagrody? ~ 60%",
  "  Kto fizycznie wysyła nagrody? ~ sponsor bezpośrednio do zwycięzcy",
  "  Co dokładnie kupuje sponsor w pakiecie?",
  "  Jaki próg kwotowy między małą a dużą pulą?",
  "  > Każde zgłoszenie to zweryfikowany połów, paliwo dla kalendarza brań",
  "  Spec docs/spec/zawody.md",
  "  Model danych w Prismie",
  "  Warsztat UI /design/zawody",
].join("\n");

describe("parseLine", () => {
  it("reads the kind from the text", () => {
    expect(parseLine("Kontakt z 10 twórcami")).toEqual({ kind: "step", title: "Kontakt z 10 twórcami" });
    expect(parseLine("Czy twórcy przyjmą CPA?")).toEqual({ kind: "question", title: "Czy twórcy przyjmą CPA?" });
    expect(parseLine("Will creators accept CPA? ~ yes if payout > X"))
      .toEqual({ kind: "question", title: "Will creators accept CPA?", guess: "yes if payout > X" });
    expect(parseLine("Kto organizuje zawody? = wyłącznie Rybia Paka"))
      .toEqual({ kind: "settled", title: "Kto organizuje zawody?", outcome: "wyłącznie Rybia Paka" });
  });

  it("reads '= text' as a settled rule whose answer is its own title", () => {
    expect(parseLine("= ZAKAZ LOSOWANIA")).toEqual({ kind: "settled", title: "ZAKAZ LOSOWANIA", outcome: "ZAKAZ LOSOWANIA" });
  });

  it("reads '>' lines and bare links as notes for the parent", () => {
    expect(parseLine("> Każde zgłoszenie to zweryfikowany połów"))
      .toEqual({ kind: "note", title: "Każde zgłoszenie to zweryfikowany połów" });
    expect(parseLine("  https://rybiapaka.pl/zawody?tab=2  ")).toEqual({ kind: "note", title: "https://rybiapaka.pl/zawody?tab=2" });
    expect(parseLine("www.rybiapaka.pl").kind).toBe("note");
    // A link inside a sentence, or a path, is not a bare link.
    expect(parseLine("Spec docs/spec/zawody.md")).toEqual({ kind: "step", title: "Spec docs/spec/zawody.md" });
    expect(parseLine("Zobacz https://rybiapaka.pl").kind).toBe("step");
  });

  it("counts markers only right after the LAST '?' (maths and Polish stay text)", () => {
    expect(parseLine("Czy X ~ N(0,1)?")).toEqual({ kind: "question", title: "Czy X ~ N(0,1)?" });
    expect(parseLine("Czy P(A|B) = P(B|A)?")).toEqual({ kind: "question", title: "Czy P(A|B) = P(B|A)?" });
    expect(parseLine("Czy σ = 2? = tak, z próby n=40"))
      .toEqual({ kind: "settled", title: "Czy σ = 2?", outcome: "tak, z próby n=40" });
    expect(parseLine("Czy x² ~ y? ~ chyba nie")).toEqual({ kind: "question", title: "Czy x² ~ y?", guess: "chyba nie" });
    // A '?' followed by more question is not a marker position.
    expect(parseLine("Is A? = B the same as C?")).toEqual({ kind: "question", title: "Is A? = B the same as C?" });
    // A guess after the last '?' may itself contain '=' (it is all guess).
    expect(parseLine("Ile wynosi E[X]? ~ x = 1/p")).toEqual({ kind: "question", title: "Ile wynosi E[X]?", guess: "x = 1/p" });
  });

  it("makes a line with text after its last '?' a step (the kind is a trailing '?')", () => {
    expect(parseLine("Dlaczego? Bo tak.")).toEqual({ kind: "step", title: "Dlaczego? Bo tak." });
    expect(parseLine("Sprawdź https://x.pl/?q=1 jutro")).toEqual({ kind: "step", title: "Sprawdź https://x.pl/?q=1 jutro" });
  });

  it("ignores an empty guess or answer, and trims", () => {
    expect(parseLine("  Jaki próg kwotowy między małą a dużą pulą?  ~   "))
      .toEqual({ kind: "question", title: "Jaki próg kwotowy między małą a dużą pulą?" });
    expect(parseLine("Kto wysyła? =")).toEqual({ kind: "question", title: "Kto wysyła?" });
    expect(parseLine("")).toEqual({ kind: "step", title: "" });
  });
});

describe("lineOf", () => {
  const fromLine = (text: string, extra: Partial<PlanNode> = {}) => {
    const f = nodeFieldsOf(parseLine(text));
    return node("x", null, f.title, { ask: f.ask, done: f.done, guess: f.guess, outcome: f.outcome, ...extra });
  };

  it("round-trips the canonical forms", () => {
    for (const text of [
      "Kontakt z 10 twórcami",
      "Czy twórcy przyjmą CPA?",
      "Will creators accept CPA? ~ yes if payout > X",
      "Kto organizuje zawody? = wyłącznie Rybia Paka",
      "= ZAKAZ LOSOWANIA",
      "Czy X ~ N(0,1)?",
      "Czy σ = 2? = tak",
    ]) {
      expect(lineOf(fromLine(text))).toBe(text);
      expect(parseLine(lineOf(fromLine(text)))).toEqual(parseLine(text));
    }
  });

  it("adds the '?' a toggled question lacks, so it reads back as a question", () => {
    expect(lineOf(node("q", null, "Kto organizuje", { ask: true }))).toBe("Kto organizuje?");
    expect(lineOf(node("q", null, "Kto organizuje", { ask: true, guess: "my" }))).toBe("Kto organizuje? ~ my");
    expect(lineOf(node("q", null, "Kto organizuje", { ask: true, done: true, outcome: "Rybia Paka" })))
      .toBe("Kto organizuje? = Rybia Paka");
  });

  it("prints a dropped node in its open form and a ticked step as its title", () => {
    expect(lineOf(node("q", null, "Referral?", { ask: true, guess: "no", done: true, dropped: true, outcome: "nie teraz" })))
      .toBe("Referral? ~ no");
    expect(lineOf(node("s", null, "Contact 10 creators", { done: true }))).toBe("Contact 10 creators");
    expect(lineOf(node("q", null, "Settled with no answer?", { ask: true, done: true }))).toBe("= Settled with no answer?");
  });
});

describe("nodeFieldsOf", () => {
  it("maps each kind to its columns", () => {
    expect(nodeFieldsOf({ kind: "step", title: " X ", guess: "ignored" }))
      .toEqual({ ask: false, done: false, title: "X", guess: null, outcome: null });
    expect(nodeFieldsOf({ kind: "question", title: "X?", guess: "g", outcome: "ignored" }))
      .toEqual({ ask: true, done: false, title: "X?", guess: "g", outcome: null });
    expect(nodeFieldsOf({ kind: "settled", title: "X?", outcome: "a" }))
      .toEqual({ ask: true, done: true, title: "X?", guess: null, outcome: "a" });
  });

  it("gives a settled rule its own title as the answer, but not a settled question", () => {
    expect(nodeFieldsOf({ kind: "settled", title: "Organizator: wyłącznie Rybia Paka" }).outcome)
      .toBe("Organizator: wyłącznie Rybia Paka");
    expect(nodeFieldsOf({ kind: "settled", title: "Kto organizuje?", guess: "my" }))
      .toEqual({ ask: true, done: true, title: "Kto organizuje?", guess: "my", outcome: null });
  });
});

describe("parsePaste", () => {
  it("parses the Zawody outline by indentation, with markers per line", () => {
    const rows = parsePaste(ZAWODY);
    expect(rows).toHaveLength(14);
    expect(rows[0]).toEqual({ depth: 0, heading: false, line: { kind: "step", title: "Zawody RybiaPaka" } });
    expect(rows.slice(1).every((r) => r.depth === 1 && !r.heading)).toBe(true);
    expect(rows.map((r) => r.line.kind)).toEqual([
      "step", "settled", "settled", "settled", "settled", "settled",
      "question", "question", "question", "question", "note", "step", "step", "step",
    ]);
    expect(rows[3].line).toEqual({ kind: "settled", title: "Kody pisane na kartce?", outcome: "odrzucone, nie sprawdzi się w praktyce" });
    expect(rows[6].line).toEqual({ kind: "question", title: "Jaki procent wpisowego na nagrody?", guess: "60%" });
  });

  it("reads a real Markdown section: headings, bold bullets, wrapped lines", () => {
    const md = [
      "# Zawody RybiaPaka",
      "",
      "## 3. Decyzje",
      "",
      "- **Organizator:** wyłącznie Rybia Paka.",
      "- **Losowanie nagród** – nie, każda nagroda jest za wynik",
      "  (ZAKAZ LOSOWANIA).",
      "",
      "## 10. Otwarte pytania",
      "",
      "- **Co dokładnie kupuje sponsor w pakiecie?** Logo na stronie zawodów, kod rabatowy,",
      "  wpis w kalendarzu brań.",
      "- **Jaki próg kwotowy między małą a dużą pulą?**",
      "- **Kto fizycznie wysyła nagrody?** Sponsor bezpośrednio do zwycięzcy czy przez",
      "  Rybią Pakę? ~ sponsor bezpośrednio",
      "- Jaki procent wpisowego idzie na nagrody?",
      "  ~ 60%",
    ].join("\n");
    const rows = parsePaste(md);
    expect(rows.map((r) => [r.depth, r.heading, r.line.title])).toEqual([
      [0, true, "Zawody RybiaPaka"],
      [1, true, "Decyzje"],
      [2, false, "Organizator: wyłącznie Rybia Paka."],
      [2, false, "Losowanie nagród – nie, każda nagroda jest za wynik (ZAKAZ LOSOWANIA)."],
      [1, true, "Otwarte pytania"],
      [2, false, "Co dokładnie kupuje sponsor w pakiecie? Logo na stronie zawodów, kod rabatowy, wpis w kalendarzu brań."],
      [2, false, "Jaki próg kwotowy między małą a dużą pulą?"],
      [2, false, "Kto fizycznie wysyła nagrody? Sponsor bezpośrednio do zwycięzcy czy przez Rybią Pakę?"],
      [2, false, "Jaki procent wpisowego idzie na nagrody?"],
    ]);
    // Text after the last '?' makes a step; one tap on the heading fixes the section.
    expect(rows[5].line.kind).toBe("step");
    expect(rows[6].line.kind).toBe("question");
    expect(rows[7].line).toMatchObject({ kind: "question", guess: "sponsor bezpośrednio" });
    expect(rows[8].line).toMatchObject({ kind: "question", guess: "60%" });
  });

  it("strips '-', '*', '+', '1.' and '1)' bullets, task boxes and '**' / '__'", () => {
    const rows = parsePaste(["* jeden", "+ dwa", "1. trzy", "2) cztery", "- [ ] pięć", "- [x] __sześć__", "-5 stopni to minimum"].join("\n"));
    expect(rows.map((r) => r.line.title)).toEqual(["jeden", "dwa", "trzy", "cztery", "pięć", "sześć", "-5 stopni to minimum"]);
    expect(rows.every((r) => r.depth === 0)).toBe(true);
  });

  it("joins a line starting with a single space to the previous line", () => {
    const rows = parsePaste(["Czy sponsor płaci z góry,", " czy po zawodach?", "Następny krok"].join("\n"));
    expect(rows.map((r) => r.line)).toEqual([
      { kind: "question", title: "Czy sponsor płaci z góry, czy po zawodach?" },
      { kind: "step", title: "Następny krok" },
    ]);
  });

  it("keeps a nested bullet as a child, and a note or link under a bullet as its own row", () => {
    const rows = parsePaste([
      "- Kanały",
      "  - Twórcy",
      "    > mikro działają lepiej",
      "    https://rybiapaka.pl/brief",
      "  - Polecenia",
      "    = nagroda za polecenie: 10 zł",
    ].join("\n"));
    expect(rows.map((r) => [r.depth, r.line.kind, r.line.title])).toEqual([
      [0, "step", "Kanały"],
      [1, "step", "Twórcy"],
      [2, "note", "mikro działają lepiej"],
      [2, "note", "https://rybiapaka.pl/brief"],
      // "= ..." wrapped under a bullet continues it; the bullet has no '?', so it stays a step
      [1, "step", "Polecenia = nagroda za polecenie: 10 zł"],
    ]);
  });

  it("settles a question whose answer is on the wrapped line", () => {
    const rows = parsePaste(["- Kto organizuje zawody?", "  = wyłącznie Rybia Paka"].join("\n"));
    expect(rows).toEqual([{ depth: 0, heading: false, line: { kind: "settled", title: "Kto organizuje zawody?", outcome: "wyłącznie Rybia Paka" } }]);
  });

  it("measures depth relative to the smallest indent, with tabs and any width", () => {
    const rows = parsePaste(["    Cel", "        Krok A", "            Krok A1", "        Krok B", "\tKrok C (tab = same as 4)"].join("\n"));
    expect(rows.map((r) => [r.depth, r.line.title])).toEqual([
      [0, "Cel"], [1, "Krok A"], [2, "Krok A1"], [1, "Krok B"], [0, "Krok C (tab = same as 4)"],
    ]);
  });

  it("nests headings by level and counts indents afresh under each heading", () => {
    const rows = parsePaste(["# A", "### C (skipped a level)", "item", "  sub", "## B ##", "## C#", "item2"].join("\n"));
    expect(rows.map((r) => [r.depth, r.heading, r.line.title])).toEqual([
      [0, true, "A"], [1, true, "C (skipped a level)"], [2, false, "item"], [3, false, "sub"],
      [1, true, "B"], [1, true, "C#"], [2, false, "item2"],
    ]);
  });

  it("skips blank lines, rules, fences and empty bullets; handles CRLF", () => {
    const rows = parsePaste(["Cel", "", "---", "```", "- ", "***", "##", "  Krok"].join("\r\n"));
    expect(rows.map((r) => [r.depth, r.line.title])).toEqual([[0, "Cel"], [1, "Krok"]]);
    expect(parsePaste("")).toEqual([]);
    expect(parsePaste("\n  \n")).toEqual([]);
  });
});

describe("setKindUnder", () => {
  const md = ["## Otwarte pytania", "- Co kupuje sponsor", "- Próg puli? ~ 500 zł", "### Notatki", "- coś", "## Kroki", "- Spec"].join("\n");

  it("sets the kind of every row in the heading's section, leaving sub-headings and later sections", () => {
    const rows = parsePaste(md);
    const next = setKindUnder(rows, 0, "question");
    expect(next.map((r) => r.line.kind)).toEqual(["step", "question", "question", "step", "question", "step", "step"]);
    expect(rows[1].line.kind).toBe("step"); // not mutated
  });

  it("keeps title, guess and answer so another tap is reversible", () => {
    const rows = parsePaste(md);
    const back = setKindUnder(setKindUnder(rows, 0, "note"), 0, "question");
    expect(back[2].line).toEqual({ kind: "question", title: "Próg puli?", guess: "500 zł" });
    expect(setKindUnder(rows, 3, "note").map((r) => r.line.kind)).toEqual(["step", "step", "question", "step", "note", "step", "step"]);
  });

  it("returns the rows unchanged for an index out of range", () => {
    const rows = parsePaste(md);
    expect(setKindUnder(rows, 99, "step")).toBe(rows);
  });
});

describe("planTree", () => {
  it("turns the Zawody paste into 13 nodes and puts the '>' line in the root's notes", () => {
    let i = 0;
    const plan = planTree(parsePaste(ZAWODY), null, 1, () => `n${++i}`);
    expect(plan.rows).toHaveLength(13);
    const [root, ...kids] = plan.rows;
    expect(root).toMatchObject({ parent_id: null, sort_order: 1, title: "Zawody RybiaPaka", notes: "Każde zgłoszenie to zweryfikowany połów, paliwo dla kalendarza brań" });
    expect(kids.every((k) => k.parent_id === root.id)).toBe(true);
    expect(kids.map((k) => k.sort_order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(kids[0]).toMatchObject({ ask: true, done: true, title: "Kto organizuje zawody?", outcome: "wyłącznie Rybia Paka" });
    expect(kids[5]).toMatchObject({ ask: true, done: false, guess: "60%", outcome: null });
    expect(kids[11]).toMatchObject({ ask: false, title: "Warsztat UI /design/zawody" });
    expect(plan.parentNotes).toEqual([]);
  });

  it("numbers the top level from firstOrder and sends notes for the existing parent back", () => {
    let i = 0;
    const plan = planTree(parsePaste(["Krok A", "> po co", "https://x.pl", "  Krok A1", "Krok B"].join("\n")), "p", 7, () => `n${++i}`);
    // The note and link directly under the paste parent go to that parent; A1 then hangs under the nearest row.
    expect(plan.rows.map((r) => [r.title, r.parent_id, r.sort_order])).toEqual([
      ["Krok A", "p", 7], ["Krok A1", "n1", 1], ["Krok B", "p", 8],
    ]);
    expect(plan.parentNotes).toEqual(["po co", "https://x.pl"]);
    expect(plan.parentUrl).toBe("https://x.pl");
  });

  it("fills a new parent's notes and empty url from note rows under it", () => {
    let i = 0;
    const plan = planTree(parsePaste(["Brief", "  www.rybiapaka.pl/brief", "  > dla sponsorów"].join("\n")), null, 1, () => `n${++i}`);
    expect(plan.rows).toEqual([
      expect.objectContaining({ title: "Brief", notes: "www.rybiapaka.pl/brief\ndla sponsorów", url: "https://www.rybiapaka.pl/brief" }),
    ]);
  });

  it("keeps a note with no parent at all as a plain step, so nothing pasted is lost", () => {
    let i = 0;
    const plan = planTree(parsePaste(["> luźna myśl", "https://x.pl"].join("\n")), null, 1, () => `n${++i}`);
    expect(plan.rows.map((r) => [r.title, r.ask, r.url])).toEqual([["luźna myśl", false, null], ["https://x.pl", false, "https://x.pl"]]);
  });

  it("hangs a note at a bullet's own depth on the row above them both, and says so the same way", () => {
    // "> cytat" sits at the same depth as "Drugi krok": its parent is the heading, not the row above it.
    const rows = parsePaste(["## Cel", "1. Pierwszy", "2. Drugi krok", "> cytat dla poprzedniego"].join("\n"));
    let i = 0;
    const plan = planTree(rows, null, 1, () => `n${++i}`);
    expect(plan.rows.map((r) => [r.title, r.notes])).toEqual([["Cel", "cytat dla poprzedniego"], ["Pierwszy", ""], ["Drugi krok", ""]]);
    // The preview reads the target from the same structure.
    const shape = pasteStructure(rows, false);
    expect(shape.parent[3]).toBe(0);
    expect(shape.node).toEqual([true, true, true, false]);
    // Under an existing parent, a top-level note goes to that parent; with none it becomes a step.
    expect(pasteStructure([{ depth: 0, heading: false, line: parseLine("> x") }], true)).toEqual({ parent: [null], node: [false] });
    expect(pasteStructure([{ depth: 0, heading: false, line: parseLine("> x") }], false)).toEqual({ parent: [null], node: [true] });
  });

  it("attaches a depth jump to the deepest row available", () => {
    let i = 0;
    const rows = [
      { depth: 0, heading: false, line: parseLine("A") },
      { depth: 3, heading: false, line: parseLine("deep") },
      { depth: 1, heading: false, line: parseLine("B") },
    ];
    const plan = planTree(rows, null, 1, () => `n${++i}`);
    expect(plan.rows.map((r) => [r.title, r.parent_id])).toEqual([["A", null], ["deep", "n1"], ["B", "n1"]]);
  });
});

describe("tree helpers", () => {
  const nodes = [
    node("r", null, "root"),
    node("b", "r", "second", { sort_order: 2 }),
    node("a", "r", "first", { sort_order: 1 }),
    node("c", "a", "child of first"),
    node("orphan", "gone", "parent on another board"),
  ];

  it("sorts children by sort_order, then created_at, then id", () => {
    const map = childrenMap(nodes);
    expect(map.get("r")!.map((n) => n.id)).toEqual(["a", "b"]);
    const tie = [node("y", null, "y", { sort_order: 5, created_at: T0 }), node("x", null, "x", { sort_order: 5, created_at: T0 })];
    expect(childrenMap(tie).get(null)!.map((n) => n.id)).toEqual(["x", "y"]);
    expect(compareSiblings({ id: "a", sort_order: 1, created_at: NOW }, { id: "b", sort_order: 1, created_at: T0 })).toBeGreaterThan(0);
  });

  it("lists a node whose parent is not loaded as a root", () => {
    expect(childrenMap(nodes).get(null)!.map((n) => n.id)).toEqual(["r", "orphan"].sort((p, q) =>
      nodes.find((n) => n.id === p)!.sort_order - nodes.find((n) => n.id === q)!.sort_order));
    expect(outline(nodes).map((n) => n.id)).toEqual(["r", "a", "c", "b", "orphan"]);
  });

  it("walks descendants in outline order", () => {
    expect(descendants("r", nodes)).toEqual(["a", "c", "b"]);
    expect(descendants("c", nodes)).toEqual([]);
  });

  it("refuses a move that makes a node its own ancestor", () => {
    expect(wouldCycle("r", "c", nodes)).toBe(true);
    expect(wouldCycle("a", "a", nodes)).toBe(true);
    expect(wouldCycle("c", "b", nodes)).toBe(false);
    expect(wouldCycle("r", null, nodes)).toBe(false);
    expect(wouldCycle("a", "b", nodes)).toBe(false);
  });

  it("survives a parent loop already in the data, and keeps it reachable", () => {
    const loop = [node("p", "q", "p"), node("q", "p", "q")];
    expect(descendants("p", loop)).toEqual(["q"]);
    expect(wouldCycle("p", "q", loop)).toBe(true);
    // One node of the loop (the first in sibling order) is shown as a root, so nothing vanishes.
    expect(outline(loop).map((n) => n.id)).toEqual(["p", "q"]);
    expect(isWaiting(loop[0], new Map(loop.map((n) => [n.id, n])))).toBe(false);
  });

  it("lifts a loop two devices left behind, with everything under it, and finds its records", () => {
    // R is a root; A under B and B under A (two moves that each passed wouldCycle); C under A.
    const nodes = [
      node("R", null, "Root"),
      node("A", "B", "A"),
      node("B", "A", "B"),
      node("C", "A", "C?", { ask: true, done: true, outcome: "tak" }),
    ];
    expect(outline(nodes).map((n) => n.id)).toEqual(["R", "A", "B", "C"]);
    expect(childrenMap(nodes).get(null)!.map((n) => n.id)).toEqual(["R", "A"]);
    expect(frontier(nodes).map((n) => n.id)).toEqual(["R", "B"]);
    // Moving the lifted node under something below it is still refused; to the top level is fine.
    expect(wouldCycle("A", "C", nodes)).toBe(true);
    expect(wouldCycle("A", null, nodes)).toBe(false);
    expect([...recordIds(nodes)].sort()).toEqual(["A", "C"]);
    for (const n of nodes) expect(recordIds(nodes).has(n.id)).toBe(hasRecord(n.id, nodes));
  });
});

describe("the frontier on the RybiaPaka example", () => {
  const start = treeOf(RYBIAPAKA);
  const id = (t: string) => idOf(start, t);
  const byId = (nodes: PlanNode[]) => new Map(nodes.map((n) => [n.id, n]));

  it("builds the ten rows of the worked example", () => {
    expect(start).toHaveLength(10);
    expect(start.filter((n) => n.ask).map((n) => n.title)).toEqual([
      "Which channel do we push next month?", "Will creators accept CPA?", "Which creator size converts best?",
      "Does the current reward motivate?",
    ]);
    expect(start.find((n) => n.id === id("Contact 10 creators"))!.parent_id).toBe(id("Will creators accept CPA?"));
  });

  it("holds the Steps inside the unchosen options until the channel question settles", () => {
    const m = byId(start);
    // A test under its own question waits only on what is above that question.
    expect(isWaiting(m.get(id("Contact 10 creators"))!, m)).toBe(true);
    expect(isWaiting(m.get(id("Run micro-creator campaign"))!, m)).toBe(true);
    expect(isWaiting(m.get(id("Test alternative reward"))!, m)).toBe(true);
    // The options themselves sit right under the question (their own parent) and questions never wait.
    expect(isWaiting(m.get(id("Creator partnerships"))!, m)).toBe(false);
    expect(isWaiting(m.get(id("Which creator size converts best?"))!, m)).toBe(false);

    expect(titles(start, frontier(start).map((n) => n.id))).toEqual(["Which creator size converts best?"]);
    expect(nextPerRoot(start).size).toBe(0);
    expect(counts(start)).toEqual({ next: 0, openQuestions: 4 });
  });

  it("opens the chosen option once the question is settled by tapping it", () => {
    const q = start.find((n) => n.id === id("Which channel do we push next month?"))!;
    const drops = settleDrops(q.id, id("Creator partnerships"), start);
    expect(titles(start, drops)).toEqual(["Referral system", "Does the current reward motivate?", "Test alternative reward"]);

    const patch = statePatch(q, "settled", { outcome: "Creator partnerships" }, NOW);
    let nodes = apply(start, [q.id], patch);
    nodes = apply(nodes, drops, { done: true, dropped: true, closed_at: patch.closed_at });
    expect(stateOf(nodes.find((n) => n.id === q.id)!)).toBe("settled");

    expect(titles(nodes, frontier(nodes).map((n) => n.id))).toEqual([
      "Contact 10 creators", "Which creator size converts best?", "Run micro-creator campaign",
    ]);
    expect(titles(nodes, nextPerRoot(nodes))).toEqual(["Contact 10 creators"]);
    expect(counts(nodes)).toEqual({ next: 1, openQuestions: 2 });

    // He grades the guess "creators": it held.
    const graded = statePatch(nodes.find((n) => n.id === q.id)!, "settled", { verdict: "right" }, "2026-10-16T09:00:00.000Z");
    expect(graded).toMatchObject({ verdict: "right", outcome: "Creator partnerships", closed_at: NOW });

    // Reopening the question brings back what tapping the option dropped.
    const settled = apply(nodes, [q.id], graded);
    expect(titles(settled, droppedWith(q.id, settled))).toEqual(["Referral system", "Does the current reward motivate?", "Test alternative reward"]);

    // ERROR: ticking the test puts its question on the frontier; the answer grades the guess wrong.
    let after = apply(settled, [id("Contact 10 creators")], statePatch(settled.find((n) => n.id === id("Contact 10 creators"))!, "done", {}, NOW));
    expect(titles(after, frontier(after).map((n) => n.id))).toEqual([
      "Will creators accept CPA?", "Which creator size converts best?", "Run micro-creator campaign",
    ]);
    expect(titles(after, nextPerRoot(after))).toEqual(["Run micro-creator campaign"]);
    const cpa = after.find((n) => n.id === id("Will creators accept CPA?"))!;
    const answered = statePatch(cpa, "settled", { outcome: "tylko ze stałą opłatą", verdict: "wrong" }, NOW);
    expect(answered).toEqual({ done: true, dropped: false, outcome: "tylko ze stałą opłatą", verdict: "wrong", closed_at: NOW });
    after = apply(after, [cpa.id], answered);

    // Records: the settled questions (and so the root); not the ticked test.
    expect(hasRecord(cpa.id, after)).toBe(true);
    expect(hasRecord(id("Reach 1,000 active users"), after)).toBe(true);
    expect(hasRecord(id("Contact 10 creators"), after)).toBe(false);
    expect(hasRecord(id("Which creator size converts best?"), after)).toBe(false);
  });
});

describe("the frontier on the Zawody paste", () => {
  it("shows the 4 open questions and 3 steps, with the spec tagged next", () => {
    const nodes = treeOf(ZAWODY);
    expect(nodes).toHaveLength(13);
    const front = frontier(nodes);
    expect(front.filter((n) => n.ask).map((n) => [n.title, n.guess])).toEqual([
      ["Jaki procent wpisowego na nagrody?", "60%"],
      ["Kto fizycznie wysyła nagrody?", "sponsor bezpośrednio do zwycięzcy"],
      ["Co dokładnie kupuje sponsor w pakiecie?", null],
      ["Jaki próg kwotowy między małą a dużą pulą?", null],
    ]);
    expect(front.filter((n) => !n.ask).map((n) => n.title)).toEqual([
      "Spec docs/spec/zawody.md", "Model danych w Prismie", "Warsztat UI /design/zawody",
    ]);
    expect(titles(nodes, nextPerRoot(nodes))).toEqual(["Spec docs/spec/zawody.md"]);
    expect(counts(nodes)).toEqual({ next: 1, openQuestions: 4 });
    // Five settled rules: a record each, so the root cannot be hard-deleted.
    expect(nodes.filter(isRecord)).toHaveLength(5);
    expect(hasRecord(nodes[0].id, nodes)).toBe(true);
  });
});

describe("frontier rules in isolation", () => {
  it("puts a parent whose children are all closed on the frontier", () => {
    const nodes = [node("g", null, "Goal"), node("s", "g", "Step", { done: true, closed_at: T0 })];
    expect(frontier(nodes).map((n) => n.id)).toEqual(["g"]);
    expect([...nextPerRoot(nodes)]).toEqual(["g"]);
  });

  it("tags one step per root, the root itself when it is a leaf step", () => {
    const nodes = [
      node("r1", null, "Kup wędkę"),
      node("r2", null, "Zawody"), node("a", "r2", "A"), node("b", "r2", "B"),
      node("r3", null, "Czy warto?", { ask: true }),
    ];
    expect([...nextPerRoot(nodes)]).toEqual(["r1", "a"]);
    expect(counts(nodes)).toEqual({ next: 2, openQuestions: 1 });
  });

  it("never marks a closed node or a question as waiting", () => {
    const nodes = [
      node("q", null, "Który kanał?", { ask: true }),
      node("o", "q", "Twórcy"),
      node("s", "o", "Kampania", { done: true }),
      node("q2", "o", "Jaki budżet?", { ask: true }),
    ];
    const m = new Map(nodes.map((n) => [n.id, n]));
    expect(isWaiting(m.get("s")!, m)).toBe(false);
    expect(isWaiting(m.get("q2")!, m)).toBe(false);
    expect(frontier(nodes).map((n) => n.id)).toEqual(["q2"]);
  });

  it("stops waiting when the question above is dropped", () => {
    const nodes = [
      node("q", null, "Który kanał?", { ask: true, done: true, dropped: true }),
      node("o", "q", "Twórcy"),
      node("s", "o", "Kampania"),
    ];
    const m = new Map(nodes.map((n) => [n.id, n]));
    expect(isWaiting(m.get("s")!, m)).toBe(false);
    expect(frontier(nodes).map((n) => n.id)).toEqual(["s"]);
  });
});

describe("hasRecord", () => {
  it("counts settled questions and verdicts, here or below; not ticked steps", () => {
    const nodes = [
      node("g", null, "Goal"),
      node("s", "g", "Ticked", { done: true }),
      node("d", "g", "Dropped question?", { ask: true, done: true, dropped: true }),
      node("v", null, "Dropped after grading?", { ask: true, guess: "x", outcome: "y", verdict: "unknown", done: true, dropped: true }),
      node("p", null, "Parent"),
      node("k", "p", "Answered?", { ask: true, done: true, outcome: "tak" }),
    ];
    expect(hasRecord("g", nodes)).toBe(false);
    expect(hasRecord("s", nodes)).toBe(false);
    expect(hasRecord("d", nodes)).toBe(false);
    expect(hasRecord("v", nodes)).toBe(true);
    expect(hasRecord("p", nodes)).toBe(true);
    expect(hasRecord("missing", nodes)).toBe(false);
  });
});

describe("recordIds", () => {
  it("agrees with hasRecord for every node in one pass", () => {
    const nodes = [
      node("g", null, "Goal"),
      node("s", "g", "Ticked", { done: true }),
      node("p", "g", "Parent"),
      node("k", "p", "Answered?", { ask: true, done: true, outcome: "tak" }),
      node("v", null, "Dropped after grading?", { ask: true, guess: "x", outcome: "y", verdict: "unknown", done: true, dropped: true }),
      node("o", null, "Open?", { ask: true }),
    ];
    const ids = recordIds(nodes);
    for (const n of nodes) expect(ids.has(n.id)).toBe(hasRecord(n.id, nodes));
    expect([...ids].sort()).toEqual(["g", "k", "p", "v"]);
  });
});

describe("statePatch", () => {
  const q = node("q", null, "Kto wysyła?", { ask: true, guess: "sponsor" });

  it("drops a stored grade when the answer changes, keeps it when it does not", () => {
    const graded = { ...q, done: true, outcome: "nie", verdict: "wrong" as const, closed_at: T0 };
    // Correcting the answer to "tak" must not leave "thought sponsor, was tak" graded as a miss.
    expect(statePatch(graded, "settled", { outcome: "tak" }, NOW)).toMatchObject({ outcome: "tak", verdict: null });
    expect(statePatch(graded, "settled", { outcome: " nie " }, NOW)).toMatchObject({ outcome: "nie", verdict: "wrong" });
    expect(statePatch(graded, "settled", { outcome: "tak", verdict: "right" }, NOW)).toMatchObject({ outcome: "tak", verdict: "right" });
    // Dropping a settled question as it stands keeps the answer and the grade (the record).
    expect(statePatch(graded, "dropped", {}, NOW)).toMatchObject({ dropped: true, outcome: "nie", verdict: "wrong" });
  });

  it("ticks a step and stamps closed_at", () => {
    expect(statePatch(node("s", null, "Krok"), "done", {}, NOW))
      .toEqual({ done: true, dropped: false, outcome: null, verdict: null, closed_at: NOW });
  });

  it("writes a verdict only with a guess and an outcome", () => {
    expect(statePatch(q, "settled", { outcome: "sponsor", verdict: "right" }, NOW).verdict).toBe("right");
    expect(statePatch(q, "settled", { verdict: "right" }, NOW).verdict).toBeNull();
    expect(statePatch({ ...q, guess: null }, "settled", { outcome: "a", verdict: "wrong" }, NOW).verdict).toBeNull();
    expect(statePatch(q, "settled", { outcome: "  ", verdict: "right" }, NOW)).toMatchObject({ outcome: null, verdict: null });
  });

  it("keeps closed_at while the node stays closed, and restamps on a new kind of close", () => {
    const settled = { ...q, done: true, outcome: "sponsor", closed_at: "2026-10-14T08:00:00+00:00" };
    expect(statePatch(settled, "settled", { verdict: "right" }, NOW)).toEqual({
      done: true, dropped: false, outcome: "sponsor", verdict: "right", closed_at: "2026-10-14T08:00:00+00:00",
    });
    expect(statePatch(settled, "dropped", { outcome: "nieaktualne" }, NOW)).toEqual({
      done: true, dropped: true, outcome: "nieaktualne", verdict: null, closed_at: NOW,
    });
  });

  it("drops with an optional why", () => {
    expect(statePatch(node("s", null, "Polecenia"), "dropped", { outcome: "nie sprawdzi się" }, NOW))
      .toEqual({ done: true, dropped: true, outcome: "nie sprawdzi się", verdict: null, closed_at: NOW });
  });

  it("reopens: clears everything, keeps a question's answer only when asked", () => {
    const settled = { ...q, done: true, outcome: "sponsor", verdict: "right" as const, closed_at: NOW };
    expect(statePatch(settled, "open", {}, NOW)).toEqual({ done: false, dropped: false, outcome: null, verdict: null, closed_at: null });
    expect(statePatch(settled, "open", { keepOutcome: true }, NOW).outcome).toBe("sponsor");
    expect(statePatch(settled, "open", { outcome: "inna wersja" }, NOW).outcome).toBe("inna wersja");
    const toHome = node("s", null, "Krok", { done: true, outcome: "→ Home: Fitness", closed_at: NOW });
    expect(statePatch(toHome, "open", { keepOutcome: true }, NOW).outcome).toBeNull();
  });
});

describe("closing and reopening together", () => {
  const nodes = [
    node("q", null, "Który kanał?", { ask: true }),
    node("a", "q", "Twórcy"),
    node("a1", "a", "Lista 30 twórców"),
    node("b", "q", "Polecenia"),
    node("b1", "b", "Nowa nagroda"),
    node("b2", "b", "Stara nagroda", { done: true, closed_at: T0 }),
    node("c", "q", "Reklamy", { done: true, dropped: true, closed_at: T0 }),
  ];

  it("lists the open nodes below", () => {
    expect(openDescendants("q", nodes)).toEqual(["a", "a1", "b", "b1"]);
  });

  it("drops the other open options and their open subtrees, never the pick or closed rows", () => {
    expect(settleDrops("q", "a", nodes)).toEqual(["b", "b1"]);
    expect(settleDrops("q", "zzz", nodes)).toEqual(["a", "a1", "b", "b1"]);
  });

  it("brings back on reopen only what was dropped in the same write", () => {
    const closedAt = "2026-10-15T12:00:00.000Z";
    let after = apply(nodes, ["q"], { done: true, outcome: "Twórcy", closed_at: closedAt });
    // The database returns the instant in its own format.
    after = apply(after, ["b", "b1"], { done: true, dropped: true, closed_at: "2026-10-15T12:00:00+00:00" });
    expect(droppedWith("q", after)).toEqual(["b", "b1"]);
    expect(droppedWith("a", after)).toEqual([]);
    expect(droppedWith("q", nodes)).toEqual([]);
  });
});

describe("editPatch", () => {
  const step = node("s", null, "Kto wysyła nagrody");
  const q = node("q", null, "Kto wysyła?", { ask: true, guess: "sponsor" });

  it("re-parses a title: a '?' and a guess make a step a question", () => {
    expect(editPatch(step, { title: "Kto wysyła nagrody? ~ sponsor" }, NOW))
      .toEqual({ title: "Kto wysyła nagrody?", ask: true, guess: "sponsor" });
    expect(editPatch(step, { title: "Kto wysyła nagrody?" }, NOW)).toEqual({ title: "Kto wysyła nagrody?", ask: true });
  });

  it("never demotes a question on a plain title, and keeps its guess", () => {
    expect(editPatch(q, { title: "Kto wysyła" }, NOW)).toEqual({ title: "Kto wysyła" });
    expect(editPatch(q, { title: "Kto fizycznie wysyła?" }, NOW)).toEqual({ title: "Kto fizycznie wysyła?" });
  });

  it("settles with '= answer' and makes a rule from '= text'", () => {
    expect(editPatch(q, { title: "Kto wysyła? = sponsor bezpośrednio" }, NOW)).toEqual({
      title: "Kto wysyła?", done: true, dropped: false, outcome: "sponsor bezpośrednio", closed_at: NOW, verdict: null,
    });
    expect(editPatch(step, { title: "= ZAKAZ LOSOWANIA" }, NOW)).toEqual({
      title: "ZAKAZ LOSOWANIA", ask: true, done: true, dropped: false, outcome: "ZAKAZ LOSOWANIA", closed_at: NOW, verdict: null,
    });
  });

  it("keeps a graded answer's verdict and closed_at when the answer is unchanged", () => {
    const graded = { ...q, done: true, outcome: "sponsor", verdict: "right" as const, closed_at: T0 };
    expect(editPatch(graded, { title: "Kto wysyła? = sponsor" }, NOW)).toEqual({ title: "Kto wysyła?", done: true, dropped: false, outcome: "sponsor" });
    expect(editPatch(graded, { title: "Kto wysyła? = my" }, NOW)).toMatchObject({ outcome: "my", verdict: null });
  });

  it("keeps a note-shaped title as text", () => {
    expect(editPatch(step, { title: "> nie notatka" }, NOW)).toEqual({ title: "> nie notatka" });
    expect(editPatch(step, { title: " https://x.pl " }, NOW)).toEqual({ title: "https://x.pl" });
  });

  it("clears the guess when an open question becomes a step, or the guess is emptied", () => {
    expect(editPatch(q, { ask: false }, NOW)).toEqual({ ask: false, guess: null });
    expect(editPatch(q, { guess: "  " }, NOW)).toEqual({ guess: null });
    expect(editPatch(step, { guess: "60%" }, NOW)).toEqual({ ask: true, guess: "60%" });
    expect(editPatch(step, { ask: false, guess: "60%" }, NOW)).toEqual({});
    // A dropped question that was never graded is no record: it may become a step.
    const dropped = { ...q, done: true, dropped: true, outcome: "nieaktualne" };
    expect(editPatch(dropped, { ask: false }, NOW)).toEqual({ ask: false, guess: null });
  });

  it("never turns a record into a step, and never rewrites a closed question's guess", () => {
    const graded = { ...q, done: true, outcome: "nie", verdict: "wrong" as const, closed_at: T0 };
    // "Make it a step", Ctrl+/ and the Details toggle all end here: nothing is written.
    expect(editPatch(graded, { ask: false }, NOW)).toEqual({});
    expect(editPatch({ ...graded, verdict: null }, { ask: false }, NOW)).toEqual({});
    expect(editPatch({ ...graded, dropped: true }, { ask: false, guess: null }, NOW)).toEqual({});
    // The prior was written before the answer: a new one afterwards is ignored.
    expect(editPatch(graded, { guess: "może" }, NOW)).toEqual({});
    expect(editPatch(graded, { guess: "  " }, NOW)).toEqual({});
    expect(editPatch(graded, { title: "Kto wysyła? ~ może" }, NOW)).toEqual({ title: "Kto wysyła?" });
  });

  it("keeps a step whose title already ends in '?' a step, from any view", () => {
    const maybe = node("m", null, "Czy zadzwonić do Kasi?");
    expect(editPatch(maybe, { title: "Czy zadzwonić do Kasi jutro?" }, NOW)).toEqual({ title: "Czy zadzwonić do Kasi jutro?" });
    // Only an added guess or answer makes it a question.
    expect(editPatch(maybe, { title: "Czy zadzwonić do Kasi? ~ tak" }, NOW)).toEqual({ title: "Czy zadzwonić do Kasi?", ask: true, guess: "tak" });
    expect(editPatch(maybe, { title: "Czy zadzwonić do Kasi? = nie" }, NOW)).toMatchObject({ ask: true, done: true, outcome: "nie" });
    // Ticked, and then a typo fixed: still a ticked step, so still deletable.
    const ticked = { ...maybe, done: true, closed_at: T0 };
    expect(editPatch(ticked, { title: "Czy zadzwonić do Kasi jutro?" }, NOW)).toEqual({ title: "Czy zadzwonić do Kasi jutro?" });
  });

  it("moves a rule's answer with its text", () => {
    const rule = node("r", null, "ZAKAZ LOSOWANIA", { ask: true, done: true, outcome: "ZAKAZ LOSOWANIA", closed_at: T0 });
    expect(isRule(rule)).toBe(true);
    expect(editPatch(rule, { title: "ZAKAZ LOSOWANIA KART" }, NOW)).toEqual({ title: "ZAKAZ LOSOWANIA KART", outcome: "ZAKAZ LOSOWANIA KART" });
    expect(isRule({ ...rule, title: "ZAKAZ LOSOWANIA KART", outcome: "ZAKAZ LOSOWANIA KART" })).toBe(true);
    // An answered question is not a rule: its answer stays.
    const answered = node("a", null, "Losujemy?", { ask: true, done: true, outcome: "nie", closed_at: T0 });
    expect(isRule(answered)).toBe(false);
    expect(editPatch(answered, { title: "Losujemy karty" }, NOW)).toEqual({ title: "Losujemy karty" });
  });

  it("lets an explicit ask win over the parsed title", () => {
    expect(editPatch(step, { title: "Czy warto?", ask: false }, NOW)).toEqual({ title: "Czy warto?" });
  });
});

describe("titleSettle", () => {
  it("names the answer typed into an open node's title, and nothing else", () => {
    const q = node("q", null, "Który kanał?", { ask: true, guess: "creators" });
    expect(titleSettle(q, "Który kanał? = Referral")).toEqual({ title: "Który kanał?", outcome: "Referral" });
    expect(titleSettle(node("s", null, "Krok"), "Krok? = tak")).toEqual({ title: "Krok?", outcome: "tak" });
    expect(titleSettle(q, "Który kanał? ~ referral")).toBeNull();
    expect(titleSettle(q, "= ZAKAZ LOSOWANIA")).toBeNull();
    expect(titleSettle(q, "Który kanał?")).toBeNull();
    expect(titleSettle({ ...q, done: true, outcome: "Creators" }, "Który kanał? = Referral")).toBeNull();
  });
});

describe("small helpers", () => {
  it("renumbers to 1..n and lists only what changed", () => {
    expect(renumber(["a", "b", "c"], new Map([["a", 1], ["b", 3], ["c", 3]]))).toEqual([{ id: "b", sort_order: 2 }]);
    expect(renumber([], new Map())).toEqual([]);
  });

  it("appends notes one per line", () => {
    expect(appendNote("", "a")).toBe("a");
    expect(appendNote("a\n\n", "b")).toBe("a\nb");
    expect(appendNote(null, "b")).toBe("b");
  });

  it("recognises bare links", () => {
    expect(isBareUrl("https://rybiapaka.pl")).toBe(true);
    expect(isBareUrl("rybiapaka.pl")).toBe(false);
    expect(linkOf("www.x.pl")).toBe("https://www.x.pl");
    expect(linkOf("http://x.pl")).toBe("http://x.pl");
  });

  it("picks the placeholder by the parent's kind", () => {
    expect(placeholderFor(null)).toBe(PLACEHOLDERS.root);
    expect(placeholderFor(node("s", null, "Krok"))).toBe("Next step… (end with ? to ask)");
    expect(placeholderFor(node("q", null, "Czy?", { ask: true }))).toBe("An option, or a way to find out…");
    expect(PLACEHOLDERS.root).toBe("What are you aiming at?");
  });

  it("names each state", () => {
    expect(stateOf(node("a", null, "a"))).toBe("open");
    expect(stateOf(node("a", null, "a", { done: true }))).toBe("done");
    expect(stateOf(node("a", null, "a?", { ask: true, done: true }))).toBe("settled");
    expect(stateOf(node("a", null, "a?", { ask: true, done: true, dropped: true }))).toBe("dropped");
  });
});

describe("placing and moving", () => {
  const nodes = [
    node("r1", null, "Zawody", { sort_order: 1 }),
    node("a", "r1", "A", { sort_order: 1 }),
    node("b", "r1", "B", { sort_order: 2 }),
    node("c", "r1", "C", { sort_order: 3 }),
    node("c1", "c", "C1", { sort_order: 1 }),
    node("r2", null, "Marketing", { sort_order: 2 }),
    node("x", "r2", "X", { sort_order: 1 }),
    node("other", null, "Inny board", { board_id: "b2", sort_order: 1 }),
  ];

  it("lists a board's roots, not another board's", () => {
    expect(siblingsAt(nodes, null, "b1").map((n) => n.id)).toEqual(["r1", "r2"]);
    expect(siblingsAt(nodes, "r1", "b1", "b").map((n) => n.id)).toEqual(["a", "c"]);
  });

  it("appends a new node after the highest sort_order", () => {
    expect(placeNew(nodes, "r1", "b1")).toEqual({ sort_order: 4, orders: [] });
    expect(placeNew(nodes, null, "b1")).toEqual({ sort_order: 3, orders: [] });
    expect(placeNew(nodes, "x", "b1")).toEqual({ sort_order: 1, orders: [] });
    expect(placeNew(nodes, "r1", "b1", "missing")).toEqual({ sort_order: 4, orders: [] });
  });

  it("inserts right after a sibling and moves only the ones below it", () => {
    expect(placeNew(nodes, "r1", "b1", "a")).toEqual({ sort_order: 2, orders: [{ id: "b", sort_order: 3 }, { id: "c", sort_order: 4 }] });
    expect(placeNew(nodes, "r1", "b1", "c")).toEqual({ sort_order: 4, orders: [] });
    // A pasted list's three top-level rows after "a" take 2, 3, 4.
    expect(placeNew(nodes, "r1", "b1", "a", 3)).toEqual({ sort_order: 2, orders: [{ id: "b", sort_order: 5 }, { id: "c", sort_order: 6 }] });
  });

  it("reorders within the same parent (Alt+Up / Alt+Down)", () => {
    expect(planMove(nodes, "c", "r1", 0)).toEqual({
      parent_id: "r1", sort_order: 1, board_id: "b1", boardChanged: false, subtree: ["c1"],
      orders: [{ id: "a", sort_order: 2 }, { id: "b", sort_order: 3 }],
    });
  });

  it("indents under the previous sibling (Tab) and renumbers both places", () => {
    expect(planMove(nodes, "c", "b", Infinity)).toEqual({
      parent_id: "b", sort_order: 1, board_id: "b1", boardChanged: false, subtree: ["c1"], orders: [],
    });
    expect(planMove(nodes, "b", "a", 99)).toMatchObject({ parent_id: "a", sort_order: 1, orders: [{ id: "c", sort_order: 2 }] });
  });

  it("outdents to a root at a chosen index (Shift+Tab)", () => {
    expect(planMove(nodes, "a", null, 1)).toEqual({
      parent_id: null, sort_order: 2, board_id: "b1", boardChanged: false, subtree: [],
      orders: [{ id: "r2", sort_order: 3 }, { id: "b", sort_order: 1 }, { id: "c", sort_order: 2 }],
    });
  });

  it("refuses a cycle or a missing node, and follows a parent on another board", () => {
    expect(planMove(nodes, "r1", "c1", 0)).toBeNull();
    expect(planMove(nodes, "c", "c", 0)).toBeNull();
    expect(planMove(nodes, "zzz", null, 0)).toBeNull();
    expect(planMove(nodes, "a", "zzz", 0)).toBeNull();
    expect(planMove(nodes, "x", "other", 0)).toMatchObject({ board_id: "b2", boardChanged: true, sort_order: 1 });
  });
});
