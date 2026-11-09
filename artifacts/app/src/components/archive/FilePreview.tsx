import { useEffect, useState } from "react";
import { Download, ExternalLink, FileArchive, File as FileIcon, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fileKind } from "@/lib/file-kind";

/**
 * A file's own view: pictures, audio and video play in place, a PDF in the
 * browser's viewer, text and Markdown as text, an HTML page rendered without
 * its scripts (or as source), a zip as its list of files. Anything else
 * offers the download.
 */
const TEXT_LIMIT = 1_000_000;
const ZIP_LIMIT = 50 * 1024 * 1024;

export interface PreviewFile {
  name: string;
  url: string;
  downloadUrl?: string;
  size?: number;
  mimetype?: string;
}

export default function FilePreview({ file, onClose }: { file: PreviewFile | null; onClose: () => void }) {
  const kind = file ? fileKind(file.name, file.mimetype) : "other";
  const [text, setText] = useState<string | null>(null);
  const [zip, setZip] = useState<{ name: string; size: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [htmlSource, setHtmlSource] = useState(false);

  useEffect(() => {
    setText(null);
    setZip(null);
    setError(null);
    setHtmlSource(false);
    if (!file) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        if (kind === "text" || kind === "markdown" || kind === "html") {
          const res = await fetch(file.url, { signal: ctrl.signal });
          const t = await res.text();
          setText(t.length > TEXT_LIMIT ? `${t.slice(0, TEXT_LIMIT)}\n\n… (cut: the file is longer)` : t);
        } else if (kind === "zip") {
          if ((file.size ?? 0) > ZIP_LIMIT) throw new Error("Too large to list here; download it.");
          const [{ unzipSync }, buf] = await Promise.all([import("fflate"), fetch(file.url, { signal: ctrl.signal }).then((r) => r.arrayBuffer())]);
          const entries: { name: string; size: number }[] = [];
          // List only: returning false skips decompressing each entry.
          unzipSync(new Uint8Array(buf), { filter: (f) => { entries.push({ name: f.name, size: f.originalSize }); return false; } });
          setZip(entries);
        }
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Could not open the file");
      }
    })();
    return () => ctrl.abort();
  }, [file, kind]);

  if (!file) return null;
  const loading = (kind === "text" || kind === "markdown" || kind === "html" ? text === null : kind === "zip" ? zip === null : false) && !error;

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-card w-[calc(100vw-1rem)] max-w-4xl max-h-[90vh] overflow-hidden border-white/10 flex flex-col" lang="en">
        <DialogHeader className="min-w-0 text-left">
          <DialogTitle className="flex items-center gap-2 min-w-0 pr-8">
            <span className="truncate">{file.name}</span>
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <a href={file.downloadUrl ?? file.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-md bg-primary/15 text-primary px-2 py-1 font-semibold hover:bg-primary/25">
              <Download className="h-3.5 w-3.5" /> Download
            </a>
            <a href={file.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1 hover:bg-muted/60">
              <ExternalLink className="h-3.5 w-3.5" /> Open in a tab
            </a>
            {kind === "html" && (
              <button onClick={() => setHtmlSource((v) => !v)} className="rounded-md bg-muted/40 px-2 py-1 hover:bg-muted/60">
                {htmlSource ? "Show page" : "Show source"}
              </button>
            )}
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-white/10 bg-black/20">
          {error ? (
            <p className="p-6 text-sm text-muted-foreground">{error}</p>
          ) : loading ? (
            <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : kind === "image" ? (
            <img src={file.url} alt={file.name} className="mx-auto max-h-[75vh] object-contain" />
          ) : kind === "audio" ? (
            <div className="p-6"><audio src={file.url} controls className="w-full" preload="metadata" /></div>
          ) : kind === "video" ? (
            <video src={file.url} controls className="mx-auto max-h-[75vh] w-full" preload="metadata" />
          ) : kind === "pdf" ? (
            <iframe src={file.url} title={file.name} className="w-full h-[75vh] bg-white" />
          ) : kind === "html" && !htmlSource ? (
            // No scripts, no same-origin access: the page's look, nothing it could do to the app.
            <iframe srcDoc={text ?? ""} sandbox="" title={file.name} className="w-full h-[75vh] bg-white" />
          ) : text !== null ? (
            <pre className="p-4 text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-foreground/90">{text}</pre>
          ) : zip ? (
            <ul className="p-3 text-xs space-y-1">
              <li className="flex items-center gap-2 text-muted-foreground pb-1"><FileArchive className="h-4 w-4" /> {zip.length} file{zip.length === 1 ? "" : "s"} inside</li>
              {zip.map((z) => (
                <li key={z.name} className="flex justify-between gap-3 rounded bg-white/[0.03] px-2 py-1">
                  <span className="truncate font-mono">{z.name}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{z.size < 1024 ? `${z.size} B` : `${(z.size / 1024).toFixed(1)} KB`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-10 flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <FileIcon className="h-8 w-8" /> No preview for this kind of file. Download it to open it.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
