import { supabase } from "@/integrations/supabase/client";
import type { BookFile } from "@/lib/library-data";

/**
 * Book PDFs: upload, text extraction, signed links. Files live in the private
 * `library-files` bucket as <user>/<book>/<stamp>.pdf with the extracted text
 * beside it as <stamp>.txt (pages separated by "\f"). A new upload gets a new
 * stamp, so a replaced PDF is never served from a stale cache; the caller
 * removes the old pair once the book points at the new one.
 */

export const LIBRARY_BUCKET = "library-files";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
export type PdfDocument = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;

let pdfjsPromise: Promise<PdfJs> | null = null;

/** pdf.js, loaded on first use so the Library page does not carry it. */
export function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
    pdfjsPromise.catch(() => { pdfjsPromise = null; });
  }
  return pdfjsPromise;
}

/** Font, character-map and decoder data pdf.js fetches for PDFs that need it. */
function assetUrls(pdfjs: PdfJs) {
  const base = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}`;
  return {
    cMapUrl: `${base}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}/standard_fonts/`,
    wasmUrl: `${base}/wasm/`,
  };
}

export async function openPdf(source: { url: string } | { data: Uint8Array }): Promise<PdfDocument> {
  const pdfjs = await loadPdfJs();
  return pdfjs.getDocument({ ...source, ...assetUrls(pdfjs) }).promise;
}

/** Frees the document and its worker-side state. */
export function closePdf(doc: PdfDocument): void {
  void doc.loadingTask.destroy();
}

export type UploadStage =
  | { stage: "reading" }
  | { stage: "uploading" }
  | { stage: "text"; done: number; total: number };

export function uploadLabel(s: UploadStage): string {
  if (s.stage === "text") return `Reading text ${s.done}/${s.total}`;
  return s.stage === "uploading" ? "Uploading PDF…" : "Opening PDF…";
}

export type BookFileErrorCode = "not-pdf" | "not-set-up" | "too-large" | "failed";

export class BookFileError extends Error {
  constructor(public code: BookFileErrorCode, message?: string) {
    super(message || code);
  }
}

export function bookFileErrorMessage(e: unknown): string {
  const code = e instanceof BookFileError ? e.code : "failed";
  switch (code) {
    case "not-pdf": return "That file is not a PDF";
    case "not-set-up": return "Book files are not set up yet (run the library_files migration)";
    case "too-large": return "The PDF is larger than the storage upload limit";
    default: return "Could not attach the PDF";
  }
}

function storageError(error: { message?: string; statusCode?: string | number }): BookFileError {
  const msg = (error.message || "").toLowerCase();
  const status = String(error.statusCode ?? "");
  if (msg.includes("bucket not found")) return new BookFileError("not-set-up", error.message);
  if (status === "413" || msg.includes("maximum allowed size") || msg.includes("too large")) {
    return new BookFileError("too-large", error.message);
  }
  return new BookFileError("failed", error.message);
}

/** "%PDF-" in the first kilobyte (some writers put junk before the header). */
export async function looksLikePdf(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  let s = "";
  for (const b of head) s += String.fromCharCode(b);
  return s.includes("%PDF-");
}

function pageText(items: unknown[]): string {
  let out = "";
  for (const it of items as { str?: string; hasEOL?: boolean }[]) {
    if (typeof it.str !== "string") continue;
    out += it.str;
    if (it.hasEOL) out += "\n";
  }
  return out.trim();
}

/**
 * Uploads a PDF for a book and pulls its text out. Resolves with the file
 * record to store on the book; the book row itself is not touched here.
 */
export async function uploadBookFile(
  userId: string,
  bookId: string,
  file: File,
  onStage?: (s: UploadStage) => void,
): Promise<BookFile> {
  if (!(await looksLikePdf(file))) throw new BookFileError("not-pdf");

  onStage?.({ stage: "reading" });
  let doc: PdfDocument;
  try {
    doc = await openPdf({ data: new Uint8Array(await file.arrayBuffer()) });
  } catch (e) {
    throw new BookFileError("not-pdf", e instanceof Error ? e.message : undefined);
  }

  try {
    const pages = doc.numPages;
    const stamp = Date.now().toString(36);
    const path = `${userId}/${bookId}/${stamp}.pdf`;

    onStage?.({ stage: "uploading" });
    const up = await supabase.storage.from(LIBRARY_BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
    if (up.error) throw storageError(up.error);

    let text = "";
    try {
      const parts: string[] = [];
      for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i);
        parts.push(pageText((await page.getTextContent()).items));
        page.cleanup();
        if (i % 5 === 0 || i === pages) onStage?.({ stage: "text", done: i, total: pages });
      }
      text = parts.join("\f");
    } catch {
      // A page pdf.js cannot parse costs the text, not the attachment.
    }
    const textChars = text.replace(/\s+/g, "").length;

    // The PDF is what matters; if the text fails to save it can be pulled again later.
    let textPath: string | null = null;
    if (textChars > 0) {
      const tp = `${userId}/${bookId}/${stamp}.txt`;
      const t = await supabase.storage.from(LIBRARY_BUCKET).upload(tp, new Blob([text], { type: "text/plain" }), { contentType: "text/plain", upsert: false });
      if (!t.error) textPath = tp;
    }

    return { path, name: file.name, size: file.size, pages, textPath, textChars, lastPage: 1, uploadedAt: new Date().toISOString() };
  } finally {
    closePdf(doc);
  }
}

/** Deletes a book's PDF and its text. Failures are ignored: an orphan file is harmless. */
export async function removeBookFiles(file: Pick<BookFile, "path" | "textPath"> | null | undefined): Promise<void> {
  if (!file) return;
  const paths = [file.path, file.textPath].filter((p): p is string => !!p);
  if (paths.length > 0) await supabase.storage.from(LIBRARY_BUCKET).remove(paths);
}

/** A time-limited link to a stored file (the bucket is private). */
export async function signedFileUrl(path: string, seconds = 60 * 60 * 6): Promise<string | null> {
  const { data, error } = await supabase.storage.from(LIBRARY_BUCKET).createSignedUrl(path, seconds);
  return error || !data ? null : data.signedUrl;
}
