import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { obsidianUri, sourceLabel, typeInfo, type KnowledgeNote } from "@/lib/kos-vault";
import { inlineText, parseInline } from "./markdown";
import MathTex from "./MathTex";

const TYPE_PL: Record<string, string> = {
  concept: "Pojęcie",
  claim: "Teza",
  principle: "Zasada",
  definition: "Definicja",
  model: "Model",
  example: "Przykład",
  observation: "Obserwacja",
  question: "Pytanie",
  decision: "Decyzja",
  contradiction: "Sprzeczność",
  assumption: "Założenie",
};

const TEXT = {
  pl: { also: "Też", course: "Kurs", said: "Powiedziane", open: "Otwórz w Obsidianie", show: "Pokaż pojęcie" },
  en: { also: "Also", course: "Course", said: "Said", open: "Open in Obsidian", show: "Show the concept" },
};

/** Plain text with its $math$ typeset (a note's statement and quote are plain words otherwise). */
function WithMath({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((x, i) => (x.t === "math" ? <MathTex key={i} tex={x.v} display={false} /> : inlineText([x])))}
    </>
  );
}

/**
 * A [[link]] to a knowledge note: the link opens a small card with what the
 * note says (statement, quote, the term in the other language) without
 * leaving the text being read.
 */
export default function KnowledgePopover({
  note,
  lang,
  children,
  className,
}: {
  note: KnowledgeNote;
  lang: "pl" | "en";
  children: ReactNode;
  className?: string;
}) {
  const t = TEXT[lang];
  const type = typeInfo(note.type);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            className ??
            "text-primary underline decoration-primary/40 decoration-dotted underline-offset-2 hover:decoration-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-sm"
          }
          aria-haspopup="dialog"
          title={t.show}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(22rem,calc(100vw-2rem))] space-y-2 text-sm"
        collisionPadding={12}
        aria-label={note.title}
      >
        <p className="text-[11px] text-muted-foreground">
          {type.icon} {lang === "pl" ? TYPE_PL[note.type] ?? type.label : type.label}
          {note.course && <span> · {note.course}</span>}
        </p>
        <p className="font-semibold text-foreground leading-snug">{note.title}</p>
        {note.aliases.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t.also}: <span className="text-foreground/85">{note.aliases.join(", ")}</span>
          </p>
        )}
        {note.summary && <p className="text-[13px] leading-5 text-foreground/90"><WithMath text={note.summary} /></p>}
        {note.quote && (
          <blockquote className="border-l-2 border-primary/50 pl-2 text-[13px] italic leading-5 text-foreground/75">“<WithMath text={note.quote} />”</blockquote>
        )}
        {note.sources[0] && (
          <p className="text-[11px] text-muted-foreground">
            {t.said}: {sourceLabel(note.sources[0], lang === "pl" ? "pl-PL" : "en-GB")}
            {note.sources.length > 1 && ` (+${note.sources.length - 1})`}
          </p>
        )}
        <a href={obsidianUri(note.vault, note.path)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          {t.open}
        </a>
      </PopoverContent>
    </Popover>
  );
}
