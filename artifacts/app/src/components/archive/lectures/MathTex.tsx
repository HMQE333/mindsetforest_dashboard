import { useEffect, useState } from "react";

type Katex = typeof import("katex").default;

let katexLoad: Promise<Katex> | null = null;
let katexReady: Katex | null = null;

/** KaTeX and its stylesheet, fetched the first time a note shows math. */
function loadKatex(): Promise<Katex> {
  katexLoad ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([m]) => {
    katexReady = m.default;
    return m.default;
  });
  return katexLoad;
}

const cache = new Map<string, string>();

/** KaTeX's HTML for `tex` (cached). With trust off, the TeX cannot add links, styles or HTML. */
function render(katex: Katex, tex: string, display: boolean): string {
  const key = `${display ? "D" : "I"}${tex}`;
  let html = cache.get(key);
  if (html === undefined) {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore", trust: false, output: "htmlAndMathml" });
    if (cache.size > 2000) cache.clear();
    cache.set(key, html);
  }
  return html;
}

/** Inline or display math; the TeX source stands in until KaTeX has loaded. */
export default function MathTex({ tex, display = false }: { tex: string; display?: boolean }) {
  const [katex, setKatex] = useState<Katex | null>(katexReady);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (katex) return;
    let live = true;
    loadKatex().then(
      (k) => live && setKatex(() => k),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [katex]);

  if (!katex) {
    const cls = `font-mono text-[0.9em] text-foreground/80 ${failed ? "" : "opacity-70"}`;
    return display ? <div className={`${cls} my-2 overflow-x-auto`}>{tex}</div> : <code className={cls}>{tex}</code>;
  }
  const html = render(katex, tex, display);
  return display ? (
    <div className="kos-math-display my-3 overflow-x-auto overflow-y-hidden py-1" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span className="kos-math" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
