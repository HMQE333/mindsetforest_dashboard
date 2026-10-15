/** A block that could not be drawn: what went wrong, then its source as written, so the note stays readable. */
export default function BlockError({ title, message, source }: { title: string; message: string; source: string }) {
  return (
    <div role="note" className="my-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-2">
      <p className="font-semibold text-amber-200">⚠️ {title}</p>
      <p className="text-foreground/85 whitespace-pre-wrap break-words">{message}</p>
      <pre className="max-h-60 overflow-auto rounded bg-muted/40 p-2 text-[12px] leading-5 whitespace-pre-wrap break-all text-foreground/75">{source}</pre>
    </div>
  );
}
