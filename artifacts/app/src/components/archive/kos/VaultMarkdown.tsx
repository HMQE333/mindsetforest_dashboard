import { Fragment, type ReactNode } from "react";
import { sourceLabel, sourceRef, type SourceRef, type WikiLink, wikiLinks } from "@/lib/kos-vault";

const INLINE = /(!?\[\[[^\]]+\]\])|\*\*([^*]+)\*\*|`([^`]+)`|(?<![*\w])\*([^*\s][^*]*?)\*(?![*\w])/g;

interface Props {
  text: string;
  /** Is there a knowledge note by this name? Unknown links render as plain text. */
  hasNote: (name: string) => boolean;
  onNote: (name: string) => void;
  onSource: (s: SourceRef) => void;
}

/**
 * A knowledge note's body: paragraphs, "> quotes", lists and small headings,
 * with [[links]] as buttons (a recording link opens the cited moment).
 * Deliberately small: the notes follow the routine's rules, not all of Markdown.
 */
export default function VaultMarkdown({ text, hasNote, onNote, onSource }: Props) {
  const inline = (s: string, key: string): ReactNode[] => {
    const out: ReactNode[] = [];
    let last = 0;
    let i = 0;
    for (const m of s.matchAll(INLINE)) {
      if (m.index! > last) out.push(s.slice(last, m.index));
      const k = `${key}-${i++}`;
      if (m[1]) out.push(<LinkChip key={k} link={wikiLinks(m[1])[0]} hasNote={hasNote} onNote={onNote} onSource={onSource} />);
      else if (m[2]) out.push(<strong key={k} className="font-semibold text-foreground">{m[2]}</strong>);
      else if (m[3]) out.push(<code key={k} className="px-1 rounded bg-muted/60 text-[0.9em]">{m[3]}</code>);
      else if (m[4]) out.push(<em key={k}>{m[4]}</em>);
      last = m.index! + m[0].length;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  };

  const blocks: ReactNode[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const key = `b${i}`;
    if (/^\s*>/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(
        <blockquote key={key} className="border-l-2 border-primary/50 pl-3 italic text-foreground/80">
          {inline(q.join(" "), key)}
        </blockquote>,
      );
    } else if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, ""));
      blocks.push(
        <ul key={key} className="list-disc pl-5 space-y-0.5">
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${key}-${j}`)}</li>
          ))}
        </ul>,
      );
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(
        <p key={key} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-1">
          {line.replace(/^#+\s*/, "")}
        </p>,
      );
      i++;
    } else {
      const p: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(>|[-*+]\s|\d+\.\s|#{1,6}\s)/.test(lines[i])) p.push(lines[i++]);
      blocks.push(<p key={key}>{inline(p.join(" "), key)}</p>);
    }
  }
  return <div className="space-y-2 text-sm leading-6 text-foreground/90">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}

function LinkChip({ link, hasNote, onNote, onSource }: { link: WikiLink } & Omit<Props, "text">) {
  const src = sourceRef(link);
  if (src) {
    return (
      <button
        type="button"
        onClick={() => onSource(src)}
        className="not-italic inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 text-[12px] text-primary hover:bg-primary/20 align-baseline"
        title="Show what was said there"
      >
        🎙 {sourceLabel(src)}
      </button>
    );
  }
  const label = link.alias || link.name;
  if (!hasNote(link.name)) return <span className="text-foreground/70">{label}</span>;
  return (
    <button type="button" onClick={() => onNote(link.name)} className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">
      {label}
    </button>
  );
}
