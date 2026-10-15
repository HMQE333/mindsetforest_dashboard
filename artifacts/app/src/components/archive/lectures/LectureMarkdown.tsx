import { Fragment, Suspense, createContext, lazy, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Play } from "lucide-react";
import { lectureSectionKind, momentLabel, type LectureSectionKind, type LinkTarget, type SourceRef, type WikiLink } from "@/lib/kos-vault";
import { inlineText, parseBlocks, parseInline, slug, type Block, type Inline } from "./markdown";
import MathTex from "./MathTex";
import MermaidBlock from "./MermaidBlock";
import KnowledgePopover from "./KnowledgePopover";

const PlotBlock = lazy(() => import("./PlotBlock"));
const Plot3DBlock = lazy(() => import("./Plot3DBlock"));

export type Lang = "pl" | "en";

/** What the text around a summary does with its links. */
export interface LinkHandlers {
  resolve: (l: WikiLink) => LinkTarget;
  /** A moment in the transcript was asked for; `block` is the top-level block it sits in. */
  onMoment: (ref: SourceRef, block: string) => void;
  onLecture: (path: string) => void;
}

const Links = createContext<LinkHandlers | null>(null);
const BlockKey = createContext("");
const LangCtx = createContext<Lang>("pl");
/** Inside a card (itself a button): links stay text, so nothing interactive nests. */
const StaticCtx = createContext(false);
/** The kind of "## " section a block sits in: the lecture map draws its diagram large. */
const SectionCtx = createContext<LectureSectionKind | "preamble">("preamble");

const T = {
  pl: { moment: "Pokaż, co zostało powiedziane", missing: "Tej notatki nie ma w kopii skarbca", lecture: "Otwórz podsumowanie", loading: "Ładuję wykres…", ai: "Dodane przez AI dla zrozumienia, nie z wykładu" },
  en: { moment: "Show what was said", missing: "This note is not in the vault copy", lecture: "Open the summary", loading: "Loading the plot…", ai: "Added by AI to help understanding, not from the lecture" },
};

// -- callouts ------------------------------------------------------------------------------

interface CalloutStyle {
  icon: string;
  box: string;
  title: string;
  name: { pl: string; en: string };
}

const STYLE = {
  blue: "border-sky-500/35 bg-sky-500/[0.06]",
  teal: "border-teal-400/35 bg-teal-400/[0.06]",
  green: "border-emerald-500/35 bg-emerald-500/[0.06]",
  violet: "border-violet-400/40 bg-violet-400/[0.07]",
  amber: "border-amber-400/40 bg-amber-400/[0.07]",
  orange: "border-orange-500/40 bg-orange-500/[0.07]",
  rose: "border-rose-500/40 bg-rose-500/[0.07]",
  fuchsia: "border-fuchsia-400/40 bg-fuchsia-400/[0.07]",
  slate: "border-slate-400/30 bg-slate-400/[0.05]",
  cyan: "border-cyan-400/35 bg-cyan-400/[0.06]",
};
const TITLE = {
  blue: "text-sky-200",
  teal: "text-teal-200",
  green: "text-emerald-200",
  violet: "text-violet-200",
  amber: "text-amber-200",
  orange: "text-orange-200",
  rose: "text-rose-200",
  fuchsia: "text-fuchsia-200",
  slate: "text-slate-200",
  cyan: "text-cyan-200",
};

function style(kind: string): CalloutStyle {
  const s = (c: keyof typeof STYLE, icon: string, pl: string, en: string): CalloutStyle => ({ icon, box: STYLE[c], title: TITLE[c], name: { pl, en } });
  switch (kind) {
    case "abstract":
    case "summary":
    case "tldr":
      return s("cyan", "📊", "Streszczenie", "Abstract");
    case "info":
      return s("blue", "ℹ️", "Informacja", "Info");
    case "todo":
      return s("blue", "☑️", "Do zrobienia", "To do");
    case "tip":
    case "hint":
      return s("teal", "💡", "Wskazówka", "Tip");
    case "important":
      // "> [!important]- Do zapamiętania": what cannot be derived and has to be learned.
      return s("fuchsia", "📌", "Ważne", "Important");
    case "success":
    case "check":
    case "done":
      return s("green", "✅", "Gotowe", "Done");
    case "question":
    case "help":
    case "faq":
      return s("amber", "❓", "Pytanie", "Question");
    case "warning":
    case "caution":
    case "attention":
      return s("orange", "⚠️", "Uwaga", "Warning");
    case "failure":
    case "fail":
    case "missing":
      return s("rose", "❌", "Błąd", "Failure");
    case "danger":
    case "error":
      return s("rose", "⛔", "Niebezpieczeństwo", "Danger");
    case "bug":
      return s("rose", "🐞", "Błąd", "Bug");
    case "example":
      return s("violet", "🔎", "Przykład", "Example");
    case "quote":
    case "cite":
      return s("slate", "💬", "Cytat", "Quote");
    default:
      return s("blue", "📝", "Notatka", kind ? kind[0].toUpperCase() + kind.slice(1) : "Note");
  }
}

/** Takes "(AI)" off the end of a title: it becomes a badge, so an AI addition is never mistaken for the lecture. */
function splitAi(title: Inline[] | null): { title: Inline[] | null; ai: boolean } {
  if (!title?.length) return { title, ai: false };
  const last = title[title.length - 1];
  if (last.t !== "text" || !/\s*\(AI\)\s*$/.test(last.v)) return { title, ai: false };
  const v = last.v.replace(/\s*\(AI\)\s*$/, "");
  return { title: [...title.slice(0, -1), ...(v ? [{ ...last, v }] : [])], ai: true };
}

function Callout({ block }: { block: Extract<Block, { t: "callout" }> }) {
  const lang = useContext(LangCtx);
  const st = style(block.kind);
  const { title, ai } = splitAi(block.title);
  const [open, setOpen] = useState(block.fold !== "closed");
  const id = useId();
  const head = (
    <>
      <span aria-hidden="true">{st.icon}</span>
      <span className={`font-semibold ${st.title}`}>{title?.length ? <Inlines c={title} /> : st.name[lang]}</span>
      {ai && (
        <span className="rounded border border-teal-300/40 bg-teal-300/10 px-1.5 text-[10px] font-bold uppercase tracking-wide text-teal-200" title={T[lang].ai}>
          AI
        </span>
      )}
    </>
  );
  return (
    <div className={`my-3 rounded-lg border ${st.box}`} data-callout={block.kind}>
      {block.fold === null ? (
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1 text-sm">{head}</div>
      ) : (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          data-callout-toggle={open ? "open" : "closed"}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          {head}
          <ChevronRight className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
        </button>
      )}
      {open && block.c.length > 0 && (
        <div id={id} className={`px-3 pb-3 ${block.fold === null ? "" : "pt-0.5"}`}>
          <Blocks blocks={block.c} />
        </div>
      )}
    </div>
  );
}

// -- inline ------------------------------------------------------------------------------

function WikiLinkView({ link }: { link: WikiLink }) {
  const handlers = useContext(Links);
  const block = useContext(BlockKey);
  const lang = useContext(LangCtx);
  const label = link.alias || link.name;
  const target: LinkTarget = handlers ? handlers.resolve(link) : { kind: "missing" };
  if (target.kind === "moment") {
    const at = momentLabel(target.ref);
    return (
      <button
        type="button"
        onClick={() => handlers?.onMoment(target.ref, block)}
        className="not-italic inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-px align-baseline text-[12px] font-medium tabular-nums text-primary hover:bg-primary/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        title={T[lang].moment}
        data-moment={at ?? ""}
      >
        <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
        {link.alias && at && link.alias !== at ? link.alias : at ?? label}
      </button>
    );
  }
  if (target.kind === "note") return <KnowledgePopover note={target.note} lang={lang}>{label}</KnowledgePopover>;
  if (target.kind === "lecture") {
    return (
      <button
        type="button"
        onClick={() => handlers?.onLecture(target.lecture.path)}
        className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        title={T[lang].lecture}
      >
        🎓 {link.alias || target.lecture.topic}
      </button>
    );
  }
  return (
    <span className="text-foreground/70 underline decoration-dotted decoration-muted-foreground/50 underline-offset-2" title={T[lang].missing}>
      {label}
    </span>
  );
}

export function Inlines({ c }: { c: Inline[] }) {
  const flat = useContext(StaticCtx);
  return (
    <>
      {c.map((x, i) => {
        switch (x.t) {
          case "text":
            return <Fragment key={i}>{x.v}</Fragment>;
          case "br":
            return <br key={i} />;
          case "strong":
            return <strong key={i} className="font-semibold text-foreground"><Inlines c={x.c} /></strong>;
          case "em":
            return <em key={i}><Inlines c={x.c} /></em>;
          case "del":
            return <del key={i} className="opacity-70"><Inlines c={x.c} /></del>;
          case "mark":
            return <mark key={i} className="rounded bg-amber-400/25 px-0.5 text-foreground"><Inlines c={x.c} /></mark>;
          case "code":
            return <code key={i} className="rounded bg-muted/60 px-1 text-[0.9em]">{x.v}</code>;
          case "math":
            return <MathTex key={i} tex={x.v} display={x.display} />;
          case "wiki":
            return flat ? <Fragment key={i}>{x.link.alias || x.link.name}</Fragment> : <WikiLinkView key={i} link={x.link} />;
          case "link":
            if (flat) return <Inlines key={i} c={x.c} />;
            return (
              <a key={i} href={x.href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 break-words">
                <Inlines c={x.c} />
              </a>
            );
        }
      })}
    </>
  );
}

/** One line of inline Markdown for a card: math and emphasis rendered, links as plain text. */
export function InlineMarkdown({ text, lang = "pl" }: { text: string; lang?: Lang }) {
  const c = useMemo(() => parseInline(text), [text]);
  return (
    <LangCtx.Provider value={lang}>
      <StaticCtx.Provider value={true}>
        <Inlines c={c} />
      </StaticCtx.Provider>
    </LangCtx.Provider>
  );
}

// -- blocks ------------------------------------------------------------------------------

function CodeBlock({ lang: code, v }: { lang: string; v: string }) {
  const lang = useContext(LangCtx);
  const section = useContext(SectionCtx);
  if (code === "mermaid") return <MermaidBlock code={v} lang={lang} prominent={section === "map"} />;
  if (code === "plot" || code === "plot3d") {
    const Comp = code === "plot" ? PlotBlock : Plot3DBlock;
    return (
      <Suspense fallback={<p className="py-6 text-center text-xs text-muted-foreground">{T[lang].loading}</p>}>
        <Comp source={v} lang={lang} />
      </Suspense>
    );
  }
  return (
    <pre className="my-2 overflow-x-auto rounded-lg border border-border/40 bg-muted/40 p-3 text-[12.5px] leading-5">
      <code>{v}</code>
    </pre>
  );
}

function ListView({ block }: { block: Extract<Block, { t: "list" }> }) {
  const Tag = block.ordered ? "ol" : "ul";
  return (
    <Tag className={`${block.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5 marker:text-muted-foreground`} start={block.ordered && block.start !== 1 ? block.start : undefined}>
      {block.items.map((it, i) => {
        const tight = it.c.length === 1 && it.c[0].t === "para";
        return (
          <li key={i} className={it.task !== null ? "list-none -ml-5 flex gap-2" : ""}>
            {it.task !== null && <input type="checkbox" checked={it.task} readOnly disabled className="mt-1.5 accent-primary" />}
            <div className="min-w-0">{tight ? <Inlines c={(it.c[0] as Extract<Block, { t: "para" }>).c} /> : <Blocks blocks={it.c} />}</div>
          </li>
        );
      })}
    </Tag>
  );
}

function BlockView({ block, headingIds }: { block: Block; headingIds?: Map<Block, string> }) {
  switch (block.t) {
    case "heading": {
      const level = Math.min(6, block.level + 1);
      const Tag = `h${level}` as "h3";
      const size = level <= 3 ? "text-base sm:text-lg" : level === 4 ? "text-[15px]" : "text-sm";
      return (
        <Tag id={headingIds?.get(block)} className={`scroll-mt-24 font-semibold text-foreground ${size} mt-5 mb-2 leading-snug`}>
          <Inlines c={block.c} />
        </Tag>
      );
    }
    case "para":
      return <p className="my-2"><Inlines c={block.c} /></p>;
    case "list":
      return <div className="my-2"><ListView block={block} /></div>;
    case "quote":
      return (
        <blockquote className="my-3 border-l-2 border-primary/50 pl-3 text-foreground/80">
          <Blocks blocks={block.c} />
        </blockquote>
      );
    case "callout":
      return <Callout block={block} />;
    case "code":
      return <CodeBlock lang={block.lang} v={block.v} />;
    case "math":
      return <MathTex tex={block.v} display />;
    case "table":
      return (
        <div className="my-3 overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-muted/40">
              <tr>
                {block.head.map((h, i) => (
                  <th key={i} className="border-b border-border/50 px-3 py-1.5 font-semibold text-foreground" style={{ textAlign: block.align[i] ?? "left" }}>
                    <Inlines c={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i} className="border-b border-border/30 last:border-0">
                  {r.map((c, j) => (
                    <td key={j} className="px-3 py-1.5 align-top" style={{ textAlign: block.align[j] ?? "left" }}>
                      <Inlines c={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr className="my-4 border-border/50" />;
  }
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </>
  );
}

// -- the whole note ------------------------------------------------------------------------

/** "## Mapa wykładu" with a map pin, a size up from the other sections. */
function MapHeading({ block, id }: { block: Extract<Block, { t: "heading" }>; id?: string }) {
  return (
    <h3 id={id} className="scroll-mt-24 mt-5 mb-2 flex items-center gap-2 text-lg font-bold leading-snug text-foreground sm:text-xl">
      <span aria-hidden="true">🗺️</span>
      <span>
        <Inlines c={block.c} />
      </span>
    </h3>
  );
}

export interface TocEntry {
  id: string;
  title: string;
  kind: LectureSectionKind;
}

interface Section {
  heading: Extract<Block, { t: "heading" }> | null;
  kind: LectureSectionKind | "preamble";
  blocks: Block[];
}

const SECTION_BOX: Partial<Record<LectureSectionKind, string>> = {
  stressed: "rounded-xl border border-amber-400/30 bg-amber-400/[0.05] px-3 sm:px-4 py-1 my-5",
  clarify: "rounded-xl border border-dashed border-border px-3 sm:px-4 py-1 my-5",
  // "Najpierw mapa": no box, but room, so the diagram reads as the way in.
  map: "my-6",
};

/** The note split at its "## " headings, with ids for a table of contents. */
export function useLectureLayout(body: string) {
  return useMemo(() => {
    const blocks = parseBlocks(body);
    const sections: Section[] = [];
    let cur: Section = { heading: null, kind: "preamble", blocks: [] };
    for (const b of blocks) {
      if (b.t === "heading" && b.level <= 2) {
        if (cur.heading || cur.blocks.length) sections.push(cur);
        const words = inlineText(b.c.filter((x) => !(x.t === "wiki" && /^\^?[tp]\d+$/i.test(x.link.anchor ?? ""))));
        cur = { heading: b, kind: lectureSectionKind(words), blocks: [] };
      } else cur.blocks.push(b);
    }
    if (cur.heading || cur.blocks.length) sections.push(cur);
    const ids = new Map<Block, string>();
    const used = new Set<string>();
    const toc: TocEntry[] = [];
    for (const s of sections) {
      if (!s.heading) continue;
      const title = inlineText(s.heading.c.filter((x) => !(x.t === "wiki" && /^\^?[tp]\d+$/i.test(x.link.anchor ?? "")))).trim();
      let id = `l-${slug(title)}`;
      for (let k = 2; used.has(id); k++) id = `l-${slug(title)}-${k}`;
      used.add(id);
      ids.set(s.heading, id);
      toc.push({ id, title, kind: s.kind as LectureSectionKind });
    }
    return { sections, ids, toc };
  }, [body]);
}

/**
 * A lecture summary rendered for reading. `after(blockKey)` is placed after
 * each top-level block: the reader uses it to open the transcript right below
 * the paragraph whose moment was clicked.
 */
export default function LectureMarkdown({
  layout,
  lang,
  links,
  after,
}: {
  layout: ReturnType<typeof useLectureLayout>;
  lang: Lang;
  links: LinkHandlers;
  after?: (blockKey: string) => ReactNode;
}) {
  return (
    <LangCtx.Provider value={lang}>
      <Links.Provider value={links}>
        <div className="kos-lecture text-[15px] leading-7 text-foreground/90 break-words [&>section:first-child>:first-child]:mt-0" lang={lang}>
          {layout.sections.map((s, si) => {
            const keyOf = (bi: number) => `${si}.${bi}`;
            const content = (
              <>
                {s.heading && (
                  <BlockKey.Provider value={`${si}.h`}>
                    {s.kind === "map" ? <MapHeading block={s.heading} id={layout.ids.get(s.heading)} /> : <BlockView block={s.heading} headingIds={layout.ids} />}
                    {after?.(`${si}.h`)}
                  </BlockKey.Provider>
                )}
                {s.blocks.map((b, bi) => (
                  <BlockKey.Provider key={bi} value={keyOf(bi)}>
                    <BlockView block={b} />
                    {after?.(keyOf(bi))}
                  </BlockKey.Provider>
                ))}
              </>
            );
            const box = s.kind === "preamble" ? undefined : SECTION_BOX[s.kind];
            return (
              <SectionCtx.Provider key={si} value={s.kind}>
                <section aria-labelledby={s.heading ? layout.ids.get(s.heading) : undefined} className={box} data-kind={s.kind}>
                  {content}
                </section>
              </SectionCtx.Provider>
            );
          })}
        </div>
      </Links.Provider>
    </LangCtx.Provider>
  );
}
