import { memo, useEffect, useMemo, useState, useTransition } from "react";
import { guessLanguage } from "@/lib/kos-vault";
import { whenIdle } from "@/lib/lazy-module";
import { safeUrl } from "@/lib/safe-url";
import LectureMarkdown, { useLectureLayout, type Lang, type LinkHandlers } from "./lectures/LectureMarkdown";
import { READER_FIRST_CHARS, READER_PIECE_CHARS, compactCount, firstPieceCount, pieceChars, readerPieces } from "./reader-model";

/**
 * A note's text as the reader renders it (the Wykłady Markdown renderer),
 * shared by the full reader, the peek and the tag queue. A long note opens
 * with its first `firstChars` characters and "Show all" renders the rest a
 * part at a time.
 */

/** A note's [[wiki links]] point at nothing in the Archive: they read as plain text. */
export const NOTE_LINKS: LinkHandlers = { resolve: () => ({ kind: "missing" }), onMoment: () => {}, onLecture: () => {} };

/** The reader's cards: the Wykłady look, without the backdrop blur (blurring a very long note's box costs frames). */
export const CARD = "glass-card [backdrop-filter:none]";

export interface NoteTextModel {
  content: string;
  pieces: ReturnType<typeof readerPieces>;
  lang: Lang;
  /** The whole text when it is one part (no images, not long): rendered in one go, with a table of contents. */
  whole: string | null;
  layout: ReturnType<typeof useLectureLayout>;
  /** How many parts open at first. */
  first: number;
}

export function useNoteText(content: string, firstChars = READER_FIRST_CHARS): NoteTextModel {
  const long = content.length > firstChars;
  // Images split the text; a long note is also cut into parts, rendered one at a time.
  const pieces = useMemo(() => readerPieces(content, long ? Math.min(READER_PIECE_CHARS, firstChars) : Infinity), [content, long, firstChars]);
  const lang: Lang = useMemo(() => guessLanguage(content.slice(0, 3000)), [content]);
  const whole = pieces.length === 1 && pieces[0].kind === "text" ? pieces[0].text : null;
  const layout = useLectureLayout(whole ?? "");
  const first = useMemo(() => firstPieceCount(pieces, firstChars), [pieces, firstChars]);
  return { content, pieces, lang, whole, layout, first };
}

/** The text's box and, for a long note, the "Show all" line under it. */
export function NoteText({ model, className = "p-4 sm:p-6" }: { model: NoteTextModel; className?: string }) {
  const { content, pieces, lang, whole, layout, first } = model;
  const [shown, setShown] = useState(first);
  const [all, setAll] = useState(false);
  const [, startTransition] = useTransition();
  // "Show all": one more part each time the page is idle, so scrolling and the keys stay live.
  useEffect(() => {
    if (!all || shown >= pieces.length) return;
    return whenIdle(() => startTransition(() => setShown((n) => n + 1)), 300);
  }, [all, shown, pieces.length]);
  const shownChars = useMemo(() => pieces.slice(0, shown).reduce((n, p) => n + pieceChars(p), 0), [pieces, shown]);

  return (
    <>
      <div className={`${CARD} ${className}`}>
        {whole !== null ? (
          <LectureMarkdown layout={layout} lang={lang} links={NOTE_LINKS} />
        ) : pieces.length === 0 ? (
          <p className="text-sm text-muted-foreground" lang="en">
            This note has no text.
          </p>
        ) : (
          pieces.slice(0, shown).map((p, i) =>
            p.kind === "text" ? <TextPiece key={i} text={p.text} lang={lang} offscreen={i >= first} /> : <ImagePiece key={i} url={p.url} />,
          )
        )}
      </div>

      {shown < pieces.length && (
        <div className={`${CARD} flex flex-wrap items-center gap-3 p-4 text-sm`} lang="en">
          <p className="min-w-0 flex-1 text-muted-foreground">
            {all
              ? `Rendering the rest: ${compactCount(shownChars)} of ${compactCount(content.length)} characters…`
              : `Showing the first ${compactCount(shownChars)} of ${compactCount(content.length)} characters.`}
          </p>
          {!all && (
            <button
              type="button"
              onClick={() => setAll(true)}
              className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-primary/20 active:scale-[0.98]"
            >
              Show all
            </button>
          )}
        </div>
      )}
      {/* Said twice to a screen reader, not once per part: when "Show all" starts, and when it is done. */}
      <p className="sr-only" aria-live="polite" lang="en">
        {all ? (shown < pieces.length ? "Rendering the rest of the note." : "The whole note is shown.") : ""}
      </p>
    </>
  );
}

/** One part of a long note. Parts past the first screenful skip layout and paint until they near the screen. */
const TextPiece = memo(function TextPiece({ text, lang, offscreen }: { text: string; lang: Lang; offscreen: boolean }) {
  const layout = useLectureLayout(text);
  return (
    <div className={offscreen ? "[contain-intrinsic-size:auto_3000px] [content-visibility:auto]" : undefined}>
      <LectureMarkdown layout={layout} lang={lang} links={NOTE_LINKS} />
    </div>
  );
});

/** An "[image] url" line of the note, shown as the image; a press opens it in a new tab. */
function ImagePiece({ url }: { url: string }) {
  const href = safeUrl(url);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="my-3 block w-fit max-w-full" title="Open the image">
      <img
        src={href}
        alt="Image in the note"
        loading="lazy"
        decoding="async"
        className="max-h-[70vh] max-w-full rounded-xl border border-white/10"
        onError={(e) => (e.currentTarget.style.display = "none")}
      />
    </a>
  );
}
