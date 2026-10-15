import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { compile, exprErrorText, ExprError } from "../components/archive/lectures/expr";
import { autoRange, parsePlot, parsePlot3D, sampleRuns, tickLabel, ticks } from "../components/archive/lectures/plot-spec";
import { buildScene, clampEl, dragView, projector, DEFAULT_VIEW } from "../components/archive/lectures/scene3d";
import { inlineText, parseBlocks, parseInline, splitRow, type Block } from "../components/archive/lectures/markdown";
import LectureMarkdown, { useLectureLayout, type LinkHandlers } from "../components/archive/lectures/LectureMarkdown";
import PlotBlock from "../components/archive/lectures/PlotBlock";
import Plot3DBlock from "../components/archive/lectures/Plot3DBlock";
import { indexVault, parseLectureSummary, resolveLink } from "../lib/kos-vault";
import { FIXTURE_FILES, LECTURE_EN, LECTURE_PL } from "./lecture-fixtures";

const ev = (src: string, x = 0, y = 0) => compile(src)({ x, y });

describe("the plot expression parser", () => {
  it("follows maths precedence: unary minus below powers, powers right-associative, implicit products", () => {
    expect(ev("1 + 2 * 3")).toBe(7);
    expect(ev("-x^2", 3)).toBe(-9);
    expect(ev("2^3^2")).toBe(512);
    expect(ev("2^-1")).toBe(0.5);
    expect(ev("(1 + 2) * 3")).toBe(9);
    expect(ev("2x + 3(x - 1)", 2)).toBe(7);
    expect(ev("2pi")).toBeCloseTo(2 * Math.PI);
    expect(ev("(x + 1)(x - 1)", 3)).toBe(8);
    expect(ev("x^2 - y^2", 2, 1)).toBe(3);
    expect(ev("6 / 3 / 2")).toBe(1);
  });

  it("knows the allowed functions and constants", () => {
    expect(ev("sin(pi / 2)")).toBeCloseTo(1);
    expect(ev("ln(e)")).toBeCloseTo(1);
    expect(ev("log(1000)")).toBeCloseTo(3);
    expect(ev("sqrt(abs(-16)) + floor(2.7) + ceil(2.1)")).toBe(9);
    expect(ev("exp(-x^2/2)/sqrt(2*pi)", 0)).toBeCloseTo(0.39894, 4);
    expect(ev("atan(1) * 4")).toBeCloseTo(Math.PI);
    expect(ev("1.5e2 + .5")).toBe(150.5);
    expect(ev("2 × 3 − 1")).toBe(5);
  });

  it("rejects anything else with a code, never running it", () => {
    const code = (src: string, vars?: ("x" | "y")[]) => {
      try {
        compile(src, vars);
        return "ok";
      } catch (e) {
        return e instanceof ExprError ? e.code : "other";
      }
    };
    expect(code("alert(1)")).toBe("unknown");
    expect(code("constructor")).toBe("unknown");
    expect(code("constructor(1)")).toBe("unknown");
    expect(code("__proto__")).toBe("unexpected");
    expect(code("valueOf")).toBe("unknown");
    expect(code("toString(x)")).toBe("unknown");
    expect(code("x.constructor")).toBe("unexpected");
    expect(code("window['x']")).toBe("unexpected");
    expect(code("window")).toBe("unknown");
    expect(code("sin x")).toBe("call");
    expect(code("(x + 1")).toBe("paren");
    expect(code("x +")).toBe("end");
    expect(code("")).toBe("empty");
    expect(code("y", ["x"])).toBe("variable");
    expect(code("x ; 1")).toBe("unexpected");
  });

  it("explains an error in the note's language", () => {
    let err: unknown;
    try {
      compile("foo(x)");
    } catch (e) {
      err = e;
    }
    expect(exprErrorText(err, "foo(x)", "pl")).toMatch(/^Nieznana nazwa „foo” w „foo\(x\)”/);
    expect(exprErrorText(err, "foo(x)", "en")).toMatch(/^Unknown name "foo" in "foo\(x\)"/);
  });
});

describe("plot blocks", () => {
  it("parses the contract's plot example", () => {
    const p = parsePlot(
      `{"title": "sin i cos", "x": [-6.28, 6.28], "y": [-1.5, 1.5],
 "functions": [{"expr": "sin(x)", "label": "sin x"}, {"expr": "cos(x)"}],
 "points": [{"x": 0, "y": 0, "label": "0"}]}`,
      "pl",
    );
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.spec.title).toBe("sin i cos");
    expect(p.spec.functions.map((f) => [f.expr, f.label])).toEqual([["sin(x)", "sin x"], ["cos(x)", null]]);
    expect(p.spec.functions[1].fn({ x: 0 })).toBe(1);
    expect(p.spec.points).toEqual([{ x: 0, y: 0, label: "0" }]);
  });

  it("turns a bad block into a readable error", () => {
    const err = (src: string, lang: "pl" | "en" = "pl") => {
      const p = parsePlot(src, lang);
      return p.ok ? "" : p.error;
    };
    expect(err('{"x": [-1, 1], "functions": [{"expr": "x^2",}]}')).toMatch(/^Niepoprawny JSON/);
    expect(err('{"x": [1, -1], "functions": [{"expr": "x"}]}')).toMatch(/„x” musi być parą liczb/);
    expect(err('{"x": [-1, 1], "functions": []}', "en")).toMatch(/"functions" must be a non-empty list/);
    expect(err('{"x": [-1, 1], "functions": [{"expr": "2x²"}]}')).toMatch(/Nieoczekiwany znak „²”/);
    expect(err('[1, 2]', "en")).toBe("The block must be a JSON object in { }.");
  });

  it("parses plot3d one object per line, as one array, and names the bad line", () => {
    const lines = `{"title": "Siodło", "kind": "surface", "expr": "x^2 - y^2", "x": [-2, 2], "y": [-2, 2]}
{"kind": "points", "points": [{"x": 1, "y": 2, "z": 3, "label": "A"}]}
{"kind": "vectors", "vectors": [{"from": [0,0,0], "to": [1,2,3], "label": "v"}, {"to": [0, 1, 0]}]}`;
    const p = parsePlot3D(lines, "pl");
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect([p.spec.title, p.spec.surfaces.length, p.spec.points.length, p.spec.vectors.length]).toEqual(["Siodło", 1, 1, 2]);
    expect(p.spec.surfaces[0].fn({ x: 2, y: 1 })).toBe(3);
    expect(p.spec.vectors[1].from).toEqual([0, 0, 0]);
    const arr = parsePlot3D(`[{"kind": "points", "points": [{"x": 1, "y": 1, "z": 1}]}]`, "en");
    expect(arr.ok && arr.spec.points.length).toBe(1);
    const bad = parsePlot3D(`{"kind": "surface", "expr": "x", "x": [0, 1], "y": [0, 1]}\n{"kind": "points", points: []}`, "pl");
    expect(bad.ok ? "" : bad.error).toMatch(/^Niepoprawny JSON w wierszu 2/);
    const kind = parsePlot3D(`{"kind": "cone"}`, "en");
    expect(kind.ok ? "" : kind.error).toBe('Unknown kind "cone". Allowed: surface, points, vectors.');
    const vec = parsePlot3D(`{"kind": "vectors", "vectors": [{"to": [1, 2]}]}`, "en");
    expect(vec.ok).toBe(false);
  });

  it("picks nice ticks, short labels and breaks a curve at an asymptote", () => {
    expect(ticks(-3, 3, 6)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    expect(ticks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect([tickLabel(0.30000000000000004), tickLabel(1500), tickLabel(0.000012)]).toEqual(["0.3", "1500", "1.2e-5"]);
    const tan = compile("tan(x)", ["x"]);
    const runs = sampleRuns(tan, [-3, 3], [-5, 5], 600);
    expect(runs.length).toBeGreaterThanOrEqual(3);
    const y = autoRange(runs.flat().map(([, v]) => v));
    expect(y[1] - y[0]).toBeLessThan(400);
    expect(sampleRuns(compile("sqrt(x)", ["x"]), [-1, 1], null, 20)).toHaveLength(1);
  });
});

describe("the 3D view", () => {
  it("keeps one unit on every axis for vectors, and fills a box for a surface", () => {
    const vec = parsePlot3D(`{"kind": "vectors", "vectors": [{"to": [4, 0, 0]}, {"to": [0, 1, 0]}]}`, "en");
    if (!vec.ok) throw new Error(vec.error);
    const s = buildScene(vec.spec);
    const a = s.vectors[0].to.map((v, i) => v - s.vectors[0].from[i]);
    const b = s.vectors[1].to.map((v, i) => v - s.vectors[1].from[i]);
    expect(Math.hypot(...a) / Math.hypot(...b)).toBeCloseTo(4);
    expect(s.originAxes).toBe(true);
    const surf = parsePlot3D(`{"kind": "surface", "expr": "x^2 - y^2", "x": [-2, 2], "y": [-1, 1]}`, "en");
    if (!surf.ok) throw new Error(surf.error);
    const sc = buildScene(surf.spec, 10);
    expect(sc.surfaces[0].verts).toHaveLength(121);
    const xs = sc.surfaces[0].verts.map((v) => v![0]);
    expect(Math.min(...xs)).toBeCloseTo(-1);
    expect(Math.max(...xs)).toBeCloseTo(1);
  });

  it("projects with x to the right and z up, and a drag turns the view within limits", () => {
    const side = projector({ az: 0, el: 0, zoom: 1 }, 400, 300);
    const o = side([0, 0, 0]);
    expect(side([1, 0, 0]).x).toBeGreaterThan(o.x);
    expect(side([0, 0, 1]).y).toBeLessThan(o.y);
    expect(side([0, -1, 0]).depth).toBeGreaterThan(side([0, 1, 0]).depth);
    const top = projector({ az: 0, el: Math.PI / 2, zoom: 1 }, 400, 300);
    expect(top([0, 0, 1]).depth).toBeGreaterThan(top([0, 0, -1]).depth);
    const v = dragView(DEFAULT_VIEW, 100, 1000);
    expect(v.az).toBeCloseTo(DEFAULT_VIEW.az - 1);
    expect(v.el).toBe(clampEl(10));
    expect(v.el).toBeLessThan(Math.PI / 2);
  });
});

describe("the Markdown of a summary", () => {
  const blocks = parseBlocks(LECTURE_PL.replace(/^---[\s\S]*?\n---\n/, ""));
  const all = (bs: Block[]): Block[] => bs.flatMap((b) => [b, ...(b.t === "callout" || b.t === "quote" ? all(b.c) : b.t === "list" ? b.items.flatMap((i) => all(i.c)) : [])]);

  it("finds headings, callouts with their fold state, code blocks inside callouts, tables, math and nested lists", () => {
    const flat = all(blocks);
    expect(blocks.filter((b) => b.t === "heading").length).toBe(8);
    const callouts = flat.filter((b): b is Extract<Block, { t: "callout" }> => b.t === "callout");
    expect(callouts.map((c) => `${c.kind}${c.fold === "closed" ? "-" : c.fold === "open" ? "+" : ""}`)).toEqual([
      "example-", "tip-", "abstract-", "abstract-", "abstract+", "tip-", "note-",
    ]);
    expect(callouts[1].title && inlineText(callouts[1].title)).toBe("Dla zrozumienia (AI)");
    const code = flat.filter((b): b is Extract<Block, { t: "code" }> => b.t === "code");
    expect(code.map((c) => c.lang)).toEqual(["mermaid", "plot", "plot3d"]);
    expect(code[0].v).toContain('N["ℕ: liczby naturalne"] --> Z');
    expect(code[2].v.split("\n")).toHaveLength(3);
    const table = flat.find((b): b is Extract<Block, { t: "table" }> => b.t === "table")!;
    expect(table.head).toHaveLength(6);
    expect(table.align).toEqual([null, null, "center", "center", "center", "center"]);
    expect(table.rows).toHaveLength(4);
    expect(flat.find((b) => b.t === "math")).toEqual({ t: "math", v: "(p \\Rightarrow q) \\iff (\\neg p \\lor q)" });
    const list = flat.find((b): b is Extract<Block, { t: "list" }> => b.t === "list")!;
    expect(list.items).toHaveLength(3);
    expect(list.items[1].c.some((b) => b.t === "list")).toBe(true);
  });

  it("keeps Obsidian's line breaks, a heading's moment link and the block's math", () => {
    const p = blocks.find((b) => b.t === "para" && inlineText(b.c).startsWith("Zdanie logiczne to"))!;
    expect(p.t === "para" && p.c.some((x) => x.t === "br")).toBe(true);
    const h = blocks.find((b) => b.t === "heading" && b.raw.startsWith("1."));
    expect(h?.t === "heading" && h.c.find((x) => x.t === "wiki")).toMatchObject({ link: { anchor: "^t0754", alias: "12:34" } });
  });

  it("reads inline math by Obsidian's rules and leaves prices alone", () => {
    expect(parseInline("koszt $5 i $10, ale $x^2$ to wzór")).toEqual([
      { t: "text", v: "koszt $5 i $10, ale " },
      { t: "math", v: "x^2", display: false },
      { t: "text", v: " to wzór" },
    ]);
    expect(parseInline("$ x $ nie, \\$x\\$ też nie")).toEqual([{ t: "text", v: "$ x $ nie, $x$ też nie" }]);
    expect(parseInline("$$a+b$$")).toEqual([{ t: "math", v: "a+b", display: true }]);
  });

  it("parses emphasis, code, links and keeps unsafe links and HTML as text", () => {
    expect(parseInline("**gruby** i *kursywa* i `kod *nie*` i ==ważne== i snake_case_name")).toEqual([
      { t: "strong", c: [{ t: "text", v: "gruby" }] },
      { t: "text", v: " i " },
      { t: "em", c: [{ t: "text", v: "kursywa" }] },
      { t: "text", v: " i " },
      { t: "code", v: "kod *nie*" },
      { t: "text", v: " i " },
      { t: "mark", c: [{ t: "text", v: "ważne" }] },
      { t: "text", v: " i snake_case_name" },
    ]);
    expect(parseInline("[x](javascript:alert(1))").some((n) => n.t === "link")).toBe(false);
    expect(parseInline("[docs](https://example.com/a)")).toEqual([{ t: "link", href: "https://example.com/a", c: [{ t: "text", v: "docs" }] }]);
    expect(parseInline("<img src=x onerror=alert(1)>")).toEqual([{ t: "text", v: "<img src=x onerror=alert(1)>" }]);
  });

  it("splits table rows without breaking a link alias, inline code or math", () => {
    expect(splitRow("| [[Recordings/a#^t1|0:01]] | `a|b` | $x|y$ | \\| |")).toEqual(["[[Recordings/a#^t1|0:01]]", "`a|b`", "$x|y$", "|"]);
  });

  it("reads task lists, numbered lists and hides Obsidian comments", () => {
    const bs = parseBlocks("3. trzy\n4. cztery\n\n- [x] zrobione\n- [ ] nie\n\n%% ukryte %%\nwidoczne");
    expect(bs.map((b) => b.t)).toEqual(["list", "list", "para"]);
    expect(bs[0].t === "list" && [bs[0].ordered, bs[0].start]).toEqual([true, 3]);
    expect(bs[1].t === "list" && bs[1].items.map((i) => i.task)).toEqual([true, false]);
    expect(bs[2].t === "para" && inlineText(bs[2].c)).toBe("widoczne");
  });
});

describe("the reader's rendering", () => {
  const index = indexVault(FIXTURE_FILES);
  const links: LinkHandlers = { resolve: (l) => resolveLink(index, l), onMoment: () => {}, onLecture: () => {} };

  function Note({ body, lang }: { body: string; lang: "pl" | "en" }) {
    const layout = useLectureLayout(body);
    return createElement(LectureMarkdown, { layout, lang, links });
  }
  const html = (md: string, lang: "pl" | "en" = "pl") => renderToStaticMarkup(createElement(Note, { body: parseLectureSummary({ path: "Lectures/x.md", vault: "V", modified_at: "", content: md }).body, lang }));

  it("renders folded callouts as closed buttons, open ones with content, and marks AI additions", () => {
    const out = html(LECTURE_PL);
    expect(out.match(/data-callout-toggle="closed"/g)?.length).toBe(6);
    expect(out.match(/data-callout-toggle="open"/g)?.length).toBe(1);
    // A folded callout's content is not rendered at all until it is opened.
    expect(out).not.toContain("Warszawa jest stolicą Polski");
    expect(out).toContain(">AI</span>");
    expect(out).toContain("Dla zrozumienia");
    // The open 3D callout loads its plot lazily.
    expect(out).toContain("Ładuję wykres…");
  });

  it("renders moments as buttons, knowledge links as popover triggers, missing ones as text", () => {
    const out = html(LECTURE_PL);
    expect(out).toContain('data-moment="12:34"');
    expect(out).toContain('data-moment="1:05:20"');
    expect(out).toMatch(/aria-haspopup="dialog"[^>]*>Implikacja</);
    expect(html("Zob. [[Nie ma takiej]].")).toContain("Tej notatki nie ma w kopii skarbca");
    expect(html(LECTURE_EN, "en")).toContain('data-moment="¶3"');
  });

  it("gives sections ids, boxes the stressed points and keeps tables scrollable", () => {
    const out = html(LECTURE_PL);
    expect(out).toContain('id="l-1-zdanie-logiczne"');
    expect(out).toContain('data-kind="stressed"');
    expect(out).toContain('id="l-na-co-prowadzacy-kladl-nacisk"');
    expect(out).toContain('class="my-3 overflow-x-auto');
  });

  it("draws a plot, and shows a bad block as an error box with its source instead of breaking the note", () => {
    const ok = renderToStaticMarkup(createElement(PlotBlock, { source: '{"title": "t", "x": [-1, 1], "functions": [{"expr": "x^2"}]}', lang: "pl" }));
    expect(ok).toContain('role="img"');
    expect(ok).toContain("<path");
    const bad = renderToStaticMarkup(createElement(PlotBlock, { source: '{"x": [-1, 1], "functions": [{"expr": "foo(x)"}]}', lang: "pl" }));
    expect(bad).toContain("Nie udało się narysować wykresu");
    expect(bad).toContain("Nieznana nazwa „foo”");
    expect(bad).toContain("&quot;expr&quot;: &quot;foo(x)&quot;");
    const bad3 = renderToStaticMarkup(createElement(Plot3DBlock, { source: '{"kind": "surface", "expr": "x", "x": [0, 1]}', lang: "en" }));
    expect(bad3).toContain("Could not draw the 3D plot");
    expect(bad3).toContain("&quot;y&quot; must be a pair of numbers");
    const ok3 = renderToStaticMarkup(createElement(Plot3DBlock, { source: '{"kind": "surface", "expr": "x*y", "x": [0, 1], "y": [0, 1]}', lang: "en" }));
    expect(ok3).toContain('aria-roledescription="interactive 3D plot"');
    expect(ok3).toContain('aria-label="Rotate left"');
  });
});

describe("markdown hardening", () => {
  it("keeps %% inside a fenced block (mermaid comments) and hides it in prose", () => {
    const blocks = parseBlocks("Tekst %%ukryte%% dalej\n\n```mermaid\nflowchart LR\n%% start\nA --> B\n%% end\n```");
    const code = blocks.find((b) => b.t === "code") as Extract<Block, { t: "code" }>;
    expect(code.v).toContain("A --> B");
    expect(code.v).toContain("%% start");
    expect(JSON.stringify(blocks[0])).not.toContain("ukryte");
  });

  it("allows obsidian:// only to open or search", () => {
    const live = (md: string) => parseInline(md).some((n) => n.t === "link");
    expect(live("[otwórz](obsidian://open?vault=V&file=Lectures%2Fa)")).toBe(true);
    expect(live("[kliknij](obsidian://new?vault=V&file=_SYSTEM/routine-prompt&content=x&overwrite=true)")).toBe(false);
  });

  it("stays fast on malformed emphasis and unclosed links", () => {
    const start = performance.now();
    parseInline("*a ".repeat(20000));
    parseInline("[[".repeat(20000));
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
