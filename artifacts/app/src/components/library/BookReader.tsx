import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Moon, Sun, X, ZoomIn, ZoomOut } from "lucide-react";
import type { Book, BookFile } from "@/lib/library-data";
import { closePdf, loadPageWords, openPdf, signedFileUrl, type PdfDocument } from "@/lib/book-files";
import { PageClock, formatSpan, speedOf, totalsOf } from "@/lib/reading-speed";
import { newSessionId, type ReadingSessionDraft } from "@/lib/reading-sessions";
import { toast } from "sonner";

interface BookReaderProps {
  book: Book | null;
  /** reachedEnd: the last page was in view during this sitting. */
  onClose: (info: { reachedEnd: boolean }) => void;
  /** Called (debounced) with the page in view, and once more on close. */
  onPosition: (bookId: string, page: number, filePath: string) => void;
  /** The sitting's page times so far; called as it grows and on close (same id each time). */
  onSession: (draft: ReadingSessionDraft) => void;
  /** Stores facts learned about the file (words per page for an older upload). */
  onFileMeta: (bookId: string, patch: Partial<BookFile>) => void;
}

const MAX_BASE_WIDTH = 900;
const MAX_CANVAS_PIXELS = 16_000_000;
const ZOOMS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5];
const DIM_KEY = "library-reader-dim";

type RenderTask = { cancel: () => void; promise: Promise<unknown> };

/**
 * Reads a book's PDF inside the app. Pages render with pdf.js only when near
 * the viewport (and are dropped again when far away), so a 600-page book opens
 * as fast as a short one. The page in view is reported back so the book
 * remembers where you stopped and its progress moves with you.
 */
export default function BookReader({ book, onClose, onPosition, onSession, onFileMeta }: BookReaderProps) {
  const file = book?.file ?? null;
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ratios, setRatios] = useState<number[]>([]);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [dim, setDim] = useState(() => {
    try { return localStorage.getItem(DIM_KEY) === "1"; } catch { return false; }
  });

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);
  const rendered = useRef(new Map<number, { width: number; task: RenderTask | null; page: { cleanup: () => unknown } | null }>());
  const near = useRef(new Set<number>());
  const anchor = useRef<{ page: number; frac: number } | null>(null);
  const resumed = useRef(false);
  const currentRef = useRef(1);
  currentRef.current = current;

  // Reading speed: one clock per sitting, flushed as it grows.
  const clock = useRef<PageClock | null>(null);
  const words = useRef<number[] | null>(null);
  const session = useRef({ id: "", startedAt: "", flushed: 0 });
  const maxPage = useRef(0);

  const pageWidth = Math.max(200, Math.floor(Math.min(containerWidth - 24, MAX_BASE_WIDTH) * zoom));
  const numPages = doc?.numPages ?? 0;

  // Open the document.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let opened: PdfDocument | null = null;
    setDoc(null); setError(null); setRatios([]); setZoom(1);
    resumed.current = false;
    rendered.current.clear();
    near.current.clear();
    pageEls.current = [];
    const start = Math.min(Math.max(1, file.lastPage || 1), file.pages || 1);
    setCurrent(start); setPageInput(String(start));
    (async () => {
      const signed = await signedFileUrl(file.path);
      if (!signed) throw new Error("no-url");
      if (cancelled) return;
      setUrl(signed);
      opened = await openPdf({ url: signed });
      if (cancelled) { closePdf(opened); return; }
      const first = await opened.getPage(1);
      const vp = first.getViewport({ scale: 1 });
      setRatios(new Array(opened.numPages).fill(vp.height / vp.width));
      setDoc(opened);
      words.current = file.pageWords ?? null;
      clock.current = new PageClock((p) => words.current?.[p - 1]);
      session.current = { id: newSessionId(), startedAt: new Date().toISOString(), flushed: 0 };
      maxPage.current = 0;
      firstPage.current = null;
      turned.current = false;
      if (!file.pageWords && file.textPath && book) {
        const bookId = book.id;
        void loadPageWords(file).then((w) => {
          if (!w || cancelled) return;
          words.current = w;
          onFileMeta(bookId, { pageWords: w });
        });
      }
    })().catch(() => { if (!cancelled) setError("Could not open this PDF."); });
    return () => {
      cancelled = true;
      for (const r of rendered.current.values()) r.task?.cancel();
      rendered.current.clear();
      if (opened) closePdf(opened);
    };
  }, [file?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Remembers the spot in view so a relayout (zoom, rotation) can return to it. */
  const captureAnchor = useCallback(() => {
    const el = pageEls.current[currentRef.current - 1];
    const root = scrollerRef.current;
    if (!el || !root) return;
    const frac = (root.scrollTop + 12 - el.offsetTop) / Math.max(1, el.offsetHeight);
    anchor.current = { page: currentRef.current, frac: Math.min(1, Math.max(0, frac)) };
  }, []);

  // Track the reading column's width.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let last = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w === last) return;
      last = w;
      // Rotating a phone reflows every page; stay on the same spot of the same page.
      captureAnchor();
      setContainerWidth(w);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [doc, captureAnchor]);

  const renderPage = useCallback(async (n: number) => {
    const holder = pageEls.current[n - 1];
    if (!doc || !holder) return;
    const prev = rendered.current.get(n);
    if (prev && prev.width === pageWidth) return;
    prev?.task?.cancel();
    const entry = { width: pageWidth, task: null as RenderTask | null, page: null as { cleanup: () => unknown } | null };
    rendered.current.set(n, entry);
    try {
      const page = await doc.getPage(n);
      entry.page = page;
      if (rendered.current.get(n) !== entry) return;
      const base = page.getViewport({ scale: 1 });
      const ratio = base.height / base.width;
      setRatios(r => (Math.abs((r[n - 1] ?? 0) - ratio) > 0.001 ? r.map((x, i) => (i === n - 1 ? ratio : x)) : r));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let scale = (pageWidth / base.width) * dpr;
      // Safari refuses canvases over ~16.7M pixels (the page would stay blank at high zoom on iPad).
      const area = base.width * base.height * scale * scale;
      if (area > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / area);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.className = "absolute inset-0 w-full h-full";
      const task = page.render({ canvas, viewport }) as unknown as RenderTask;
      entry.task = task;
      await task.promise;
      if (rendered.current.get(n) !== entry) return;
      entry.task = null;
      // Swap in the new bitmap only when it is ready, so zooming never flashes blank.
      holder.querySelector("canvas")?.remove();
      holder.appendChild(canvas);
    } catch {
      if (rendered.current.get(n) === entry) rendered.current.delete(n);
    }
  }, [doc, pageWidth]);

  const dropPage = useCallback((n: number) => {
    const r = rendered.current.get(n);
    r?.task?.cancel();
    // Without this pdf.js keeps every page's decoded images for the life of the document.
    r?.page?.cleanup();
    rendered.current.delete(n);
    const c = pageEls.current[n - 1]?.querySelector("canvas");
    if (c) { c.width = 0; c.height = 0; c.remove(); }
  }, []);

  // Render what is near the viewport; free what has scrolled far away.
  useEffect(() => {
    const root = scrollerRef.current;
    if (!doc || !root || pageWidth <= 0) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const n = Number((e.target as HTMLElement).dataset.page);
        if (e.isIntersecting) { near.current.add(n); void renderPage(n); }
        else { near.current.delete(n); dropPage(n); }
      }
    }, { root, rootMargin: "150% 0px" });
    pageEls.current.forEach((el) => el && io.observe(el));
    // A zoom or resize re-renders the pages already on screen at the new size.
    near.current.forEach((n) => void renderPage(n));
    return () => io.disconnect();
  }, [doc, pageWidth, renderPage, dropPage]);

  const scrollToPage = useCallback((n: number, frac = 0) => {
    const el = pageEls.current[n - 1];
    const root = scrollerRef.current;
    if (!el || !root) return;
    root.scrollTop = el.offsetTop - 12 + frac * el.offsetHeight;
  }, []);

  // Open where the reader stopped last time.
  useLayoutEffect(() => {
    if (!doc || resumed.current || containerWidth <= 0) return;
    resumed.current = true;
    scrollToPage(currentRef.current);
  }, [doc, containerWidth, scrollToPage]);

  // Keep the same spot in view across zoom changes.
  useLayoutEffect(() => {
    const a = anchor.current;
    if (!a) return;
    anchor.current = null;
    scrollToPage(a.page, a.frac);
  }, [pageWidth, scrollToPage]);

  const onScroll = useCallback(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const mark = root.scrollTop + root.clientHeight * 0.35;
    const els = pageEls.current;
    let lo = 0, hi = els.length - 1, found = 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const top = els[mid]?.offsetTop ?? 0;
      if (top <= mark) { found = mid + 1; lo = mid + 1; } else hi = mid - 1;
    }
    // A last page shorter than the screen can never scroll up to the mark: the bottom is the last page.
    if (els.length > 0 && root.scrollTop + root.clientHeight >= root.scrollHeight - 2) found = els.length;
    if (found !== currentRef.current) { setCurrent(found); setPageInput(String(found)); }
  }, []);

  // Saving reads these through refs: a saved position replaces the book
  // object, and the periodic save must not restart every time it does.
  const bookRef = useRef(book);
  bookRef.current = book;
  const onSessionRef = useRef(onSession);
  onSessionRef.current = onSession;
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;

  const flush = useCallback(() => {
    const c = clock.current;
    const b = bookRef.current;
    if (!b || !c || c.samples.length === session.current.flushed) return;
    session.current.flushed = c.samples.length;
    onSessionRef.current({
      id: session.current.id,
      bookId: b.id,
      startedAt: session.current.startedAt,
      endedAt: new Date().toISOString(),
      totals: totalsOf(c.samples),
      samples: [...c.samples],
    });
  }, []);

  // Time each page as it comes into view. `turned` is whether the reader has
  // moved at all this sitting: reopening on the last page is not finishing it.
  const firstPage = useRef<number | null>(null);
  const turned = useRef(false);
  useEffect(() => {
    if (!doc || !clock.current) return;
    if (firstPage.current === null) firstPage.current = current;
    else if (current !== firstPage.current) turned.current = true;
    clock.current.turn(current, Date.now());
    maxPage.current = Math.max(maxPage.current, current);
  }, [doc, current]);

  // Leaving without the close button (another module, signing out) still saves the sitting.
  useEffect(() => () => {
    const b = bookRef.current;
    flush();
    if (b?.file && firstPage.current !== null) onPositionRef.current(b.id, currentRef.current, b.file.path);
  }, [flush]);

  // Hidden tab: the clock stops and what was read so far is saved.
  useEffect(() => {
    if (!doc) return;
    const onVisibility = () => {
      if (document.hidden) { clock.current?.hide(Date.now()); flush(); }
      else clock.current?.show(Date.now());
    };
    const onHide = () => flush();
    const every = setInterval(flush, 60_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(every);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, [doc, flush]);

  // Save the position a moment after the page settles.
  useEffect(() => {
    if (!book || !doc) return;
    const path = book.file?.path;
    if (!path) return;
    const t = setTimeout(() => onPositionRef.current(book.id, current, path), 1200);
    return () => clearTimeout(t);
  }, [book?.id, book?.file?.path, doc, current]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => {
    const reachedEnd = !!doc && turned.current && maxPage.current >= doc.numPages;
    if (book && doc && book.file) {
      onPosition(book.id, currentRef.current, book.file.path);
      flush();
      const samples = clock.current?.samples ?? [];
      // The finish screen has its own summary; otherwise a one-line recap of the sitting.
      if (!reachedEnd && samples.length >= 2) {
        const t = totalsOf(samples);
        const sp = speedOf(t);
        toast.success(`Read ${t.pages} pages in ${formatSpan(t.seconds)}`, {
          description: [
            sp.pagesPerHour ? `${Math.round(sp.pagesPerHour)} pages/h` : null,
            sp.wordsPerMinute ? `${Math.round(sp.wordsPerMinute)} words/min` : null,
          ].filter(Boolean).join(" · ") || undefined,
        });
      }
    }
    onClose({ reachedEnd });
  }, [book, doc, onPosition, onClose, flush]);

  const changeZoom = useCallback((dir: 1 | -1) => {
    captureAnchor();
    setZoom(z => {
      const i = ZOOMS.findIndex(x => Math.abs(x - z) < 0.001);
      return ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 3 : i) + dir))];
    });
  }, [captureAnchor]);

  const go = useCallback((n: number) => {
    if (!numPages) return;
    const p = Math.min(numPages, Math.max(1, Math.round(n)));
    scrollToPage(p);
  }, [numPages, scrollToPage]);

  useEffect(() => {
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(currentRef.current + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(currentRef.current - 1); }
      else if (e.key === "+" || e.key === "=") { e.preventDefault(); changeZoom(1); }
      else if (e.key === "-") { e.preventDefault(); changeZoom(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc, go, changeZoom]);

  const toggleDim = () => setDim(d => {
    try { localStorage.setItem(DIM_KEY, d ? "0" : "1"); } catch { /* per-device nicety only */ }
    return !d;
  });

  if (!book || !file) return null;
  const pct = numPages ? Math.round((current / numPages) * 100) : 0;
  const btn = "p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30";
  // Thumb-sized buttons for the phone's bottom bar.
  const touchBtn = "p-2.5 rounded-xl text-muted-foreground active:bg-muted/60 transition-colors disabled:opacity-30";

  const pageControls = (b: string) => (
    <>
      <button className={b} onClick={() => go(current - 1)} disabled={current <= 1} title="Previous page (←)" aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></button>
      <input
        value={pageInput}
        onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => { if (e.key === "Enter") { go(Number(pageInput) || current); (e.target as HTMLInputElement).blur(); } }}
        onBlur={() => setPageInput(String(current))}
        onFocus={(e) => e.target.select()}
        inputMode="numeric"
        enterKeyHint="go"
        aria-label="Page"
        className="w-11 text-center text-sm sm:text-xs py-1 rounded-md bg-muted/40 border border-border text-foreground tabular-nums focus:outline-none focus:border-primary/50"
      />
      <span className="text-xs text-muted-foreground tabular-nums px-1 whitespace-nowrap">/ {numPages}</span>
      <button className={b} onClick={() => go(current + 1)} disabled={current >= numPages} title="Next page (→)" aria-label="Next page"><ChevronRight className="w-4 h-4" /></button>
    </>
  );
  const zoomControls = (b: string) => (
    <>
      <button className={b} onClick={() => changeZoom(-1)} disabled={zoom <= ZOOMS[0]} title="Zoom out (−)" aria-label="Zoom out"><ZoomOut className="w-4 h-4" /></button>
      <span className="text-[11px] text-muted-foreground tabular-nums w-9 text-center">{Math.round(zoom * 100)}%</span>
      <button className={b} onClick={() => changeZoom(1)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} title="Zoom in (+)" aria-label="Zoom in"><ZoomIn className="w-4 h-4" /></button>
    </>
  );

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => { if (!v) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-0 z-50 flex flex-col bg-background outline-none"
        >
          <header className="relative shrink-0 flex items-center gap-1 sm:gap-2 px-2 sm:px-3 h-12 border-b border-border bg-background">
            <div className="w-2 h-7 rounded-full shrink-0" style={{ backgroundColor: book.cover_color }} />
            <div className="min-w-0 flex-1 pl-1">
              <DialogPrimitive.Title className="text-sm font-semibold text-foreground truncate">{book.title}</DialogPrimitive.Title>
              {book.author && <p className="text-[11px] text-muted-foreground truncate leading-tight">{book.author}</p>}
            </div>

            {numPages > 0 && <div className="hidden sm:flex items-center gap-0.5 shrink-0">{pageControls(btn)}</div>}
            <div className="hidden sm:flex items-center gap-0.5 shrink-0">{zoomControls(btn)}</div>
            <button className={btn} onClick={toggleDim} title={dim ? "Normal pages" : "Dim pages for night reading"}>
              {dim ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {url && (
              <a className={`${btn} hidden sm:inline-flex`} href={`${url}#page=${current}`} target="_blank" rel="noopener noreferrer" title="Open in the browser's PDF viewer (search, select text)">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button className={btn} onClick={close} title="Close (Esc)"><X className="w-5 h-5" /></button>

            <div className="absolute left-0 bottom-0 h-0.5 bg-muted/40 w-full">
              <div className="h-full transition-[width] duration-300" style={{ width: `${pct}%`, backgroundColor: book.cover_color }} />
            </div>
          </header>

          <div ref={scrollerRef} onScroll={onScroll} className="relative flex-1 overflow-y-auto overscroll-contain bg-muted/30">
            {error ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <p>{error}</p>
                {url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Open it in a new tab instead</a>}
              </div>
            ) : !doc ? (
              <div className="h-full flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Opening…
              </div>
            ) : (
              <div className="min-w-full w-max flex flex-col items-center gap-3 p-3">
                {ratios.map((ratio, i) => (
                  <div
                    key={i}
                    data-page={i + 1}
                    ref={(el) => { pageEls.current[i] = el; }}
                    className="relative bg-white shadow-md shrink-0"
                    style={{
                      width: pageWidth,
                      height: Math.round(pageWidth * ratio),
                      filter: dim ? "invert(0.88) hue-rotate(180deg)" : undefined,
                    }}
                  >
                    <span className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400 select-none">{i + 1}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {numPages > 0 && (
            <footer className="sm:hidden shrink-0 flex items-center justify-between gap-2 px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] border-t border-border bg-background">
              <div className="flex items-center">{pageControls(touchBtn)}</div>
              <div className="flex items-center">{zoomControls(touchBtn)}</div>
            </footer>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
