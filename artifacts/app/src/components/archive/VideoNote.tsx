import type { ReactNode } from "react";
import { splitStamps, videoAt } from "@/lib/youtube";

// ── Inline rendering: **bold**, arrows, and [mm:ss] links to that moment ──

export function Inline({ text, videoId }: { text: string; videoId: string }) {
  const out: ReactNode[] = [];
  splitStamps(text).forEach((part, i) => {
    if ("stamp" in part) {
      out.push(
        <a key={i} href={videoAt(videoId, part.seconds)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline tabular-nums">
          {part.stamp}
        </a>,
      );
      return;
    }
    part.text.replace(/ ?-> ?/g, " → ").split(/(\*\*[^*]+\*\*)/g).forEach((chunk, j) => {
      if (!chunk) return;
      out.push(chunk.startsWith("**") && chunk.endsWith("**")
        ? <strong key={`${i}-${j}`} className="font-semibold text-foreground">{chunk.slice(2, -2)}</strong>
        : <span key={`${i}-${j}`}>{chunk}</span>);
    });
  });
  return <>{out}</>;
}

/** The markdown the passes write: headings, bullets, numbered lines, paragraphs. */
export function Note({ text, videoId }: { text: string; videoId: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}><Inline text={it} videoId={videoId} /></li>);
    blocks.push(list.ordered
      ? <ol key={blocks.length} className="list-decimal pl-5 space-y-1">{items}</ol>
      : <ul key={blocks.length} className="list-disc pl-5 space-y-1">{items}</ul>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[*-]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !bullet;
      if (list && list.ordered !== ordered) flush();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet || numbered)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push(heading[1].length === 1
        ? <h3 key={blocks.length} className="text-base font-bold text-foreground"><Inline text={heading[2]} videoId={videoId} /></h3>
        : <h4 key={blocks.length} className="text-sm font-semibold text-foreground pt-2"><Inline text={heading[2]} videoId={videoId} /></h4>);
    } else {
      blocks.push(<p key={blocks.length}><Inline text={line} videoId={videoId} /></p>);
    }
  }
  flush();
  return <div className="space-y-2 text-sm leading-relaxed text-foreground/85">{blocks}</div>;
}
