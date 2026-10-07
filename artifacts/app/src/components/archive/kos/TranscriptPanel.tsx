import { useEffect, useRef } from "react";
import { useRecordingSegments } from "@/hooks/useKnowledgeOS";
import { clock, segmentAt } from "@/lib/kos-vault";

interface Props {
  recordingId: string | null;
  /** Seconds to highlight (and scroll to). */
  at?: number | null;
  /** Show only a few segments around `at` instead of the whole transcript. */
  context?: boolean;
  /** Words to mark in the text. */
  mark?: string;
}

/** A recording's raw transcript, loaded when shown; one line per Whisper segment. */
export default function TranscriptPanel({ recordingId, at = null, context = false, mark }: Props) {
  const { segments, loading, error } = useRecordingSegments(recordingId);
  const box = useRef<HTMLDivElement>(null);
  const hit = segments && segments.length && at !== null ? segmentAt(segments, at) : -1;

  useEffect(() => {
    if (context || hit < 0 || !box.current) return;
    const el = box.current.querySelector<HTMLElement>(`[data-i="${hit}"]`);
    if (el) box.current.scrollTop = el.offsetTop - box.current.clientHeight / 3;
  }, [hit, context, segments]);

  if (!recordingId) return <p className="text-xs text-muted-foreground">This recording is not in the dashboard.</p>;
  if (loading) return <p className="text-xs text-muted-foreground">Loading transcript…</p>;
  if (error || !segments) return <p className="text-xs text-destructive">Could not load the transcript.</p>;
  if (!segments.length) return <p className="text-xs text-muted-foreground">Nothing was transcribed.</p>;

  const from = context && hit >= 0 ? Math.max(0, hit - 2) : 0;
  const to = context && hit >= 0 ? Math.min(segments.length, hit + 4) : segments.length;
  return (
    <div
      ref={box}
      className={`relative rounded-lg bg-muted/30 border border-border/40 px-3 py-2 text-[13px] leading-6 ${context ? "" : "max-h-80 overflow-y-auto"}`}
    >
      {from > 0 && <p className="text-[11px] text-muted-foreground">…</p>}
      {segments.slice(from, to).map((s, j) => {
        const i = from + j;
        return (
          <p key={i} data-i={i} className={`flex gap-2 rounded px-1 ${i === hit ? "bg-primary/15 text-foreground" : "text-foreground/75"}`}>
            <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground pt-[3px]">{clock(s.start)}</span>
            <span>{highlight(s.text, mark)}</span>
          </p>
        );
      })}
      {to < segments.length && context && <p className="text-[11px] text-muted-foreground">…</p>}
    </div>
  );
}

export function highlight(text: string, mark?: string) {
  const m = mark?.trim();
  if (!m) return text;
  const at = text.toLowerCase().indexOf(m.toLowerCase());
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-amber-400/30 text-foreground rounded px-0.5">{text.slice(at, at + m.length)}</mark>
      {text.slice(at + m.length)}
    </>
  );
}
