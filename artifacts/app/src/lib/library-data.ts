export interface Book {
  id: string;
  user_id: string;
  title: string;
  author: string;
  total_pages: number;
  pages_read: number;
  rating: number | null;
  status: "to-read" | "reading" | "finished";
  notes: string;
  cover_color: string;
  tags: string[];
  pillars: string[];
  directions: string[];
  format: BookFormat;
  url: string;
  /** The book's own PDF, when one was dropped on it. */
  file?: BookFile | null;
  created_at: string;
  updated_at: string;
}

/**
 * A PDF attached to a book, stored in the private `library-files` bucket.
 * The extracted text sits next to it (pages separated by "\f") so later
 * features can work on the book without parsing the PDF again.
 */
export interface BookFile {
  path: string;
  name: string;
  size: number;
  pages: number;
  /** Storage path of the extracted text; null when there was none to store (a scan). */
  textPath: string | null;
  textChars: number;
  /** Last page open in the reader (1-based). */
  lastPage: number;
  uploadedAt: string;
}

export type BookStatus = Book["status"];
export type BookFormat = "owned" | "borrowed" | "ebook" | "audiobook";

export const STATUS_LABELS: Record<BookStatus, string> = {
  "to-read": "📖 To Read",
  reading: "📚 Reading",
  finished: "✅ Finished",
};

export const FORMAT_LABELS: Record<BookFormat, string> = {
  owned: "📕 Owned",
  borrowed: "🤝 Borrowed",
  ebook: "📱 E-book",
  audiobook: "🎧 Audiobook",
};

export const COVER_COLORS = [
  "#8B5CF6", "#3B82F6", "#EF4444", "#F97316", "#10B981",
  "#EC4899", "#6366F1", "#14B8A6", "#F59E0B", "#64748B",
];

export const DIRECTION_TAGS = [
  "Self-Development", "Psychology", "Philosophy", "Science", "History",
  "Business", "Finance", "Health", "Spirituality", "Fiction",
  "Biography", "Technology", "Creativity", "Leadership", "Productivity",
];

/** Under ~40 characters a page the PDF is a scan: pictures of pages, no text layer. */
export function isScan(file: Pick<BookFile, "pages" | "textChars">): boolean {
  return file.textChars < Math.max(1, file.pages) * 40;
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Pages read on the book's own scale for a page reached in its PDF. The PDF
 * and the printed edition rarely have the same page count, so the position is
 * carried over as a fraction; with no page count on the book, the PDF's is used.
 */
export function pagesReadFor(page: number, pdfPages: number, bookPages: number): number {
  if (pdfPages <= 0) return 0;
  const fraction = Math.min(1, Math.max(0, page / pdfPages));
  const total = bookPages > 0 ? bookPages : pdfPages;
  return Math.round(fraction * total);
}

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The title and, when it has a subtitle, the part before it ("Deep Work: Rules..." -> "Deep Work"). */
function titleForms(title: string): string[] {
  const forms = [normTitle(title)];
  const main = title.split(/[:(]| - | \u2013 | \u2014 /)[0];
  const m = normTitle(main);
  if (m && m !== forms[0] && m.length >= 4) forms.push(m);
  return forms.filter((f) => f.length >= 3);
}

/**
 * Pairs dropped files with books by title found in the file name
 * ("Kahneman - Thinking, Fast and Slow (2011).pdf" -> "Thinking, Fast and Slow").
 * The longest matching title wins, so "The Laws of Human Nature" beats
 * "Human Nature"; a file two books match equally well is left unmatched, and
 * each book takes at most one file.
 */
export function matchFilesToBooks<F extends { name: string }, B extends { id: string; title: string }>(
  files: F[],
  books: B[],
): { matched: { file: F; book: B }[]; unmatched: F[] } {
  const matched: { file: F; book: B }[] = [];
  const unmatched: F[] = [];
  const taken = new Set<string>();
  const forms = books.map((b) => ({ book: b, forms: titleForms(b.title) }));

  for (const file of files) {
    const name = ` ${normTitle(file.name.replace(/\.[a-z0-9]{2,4}$/i, ""))} `;
    let best: B | null = null;
    let bestLen = 0;
    let tie = false;
    for (const { book, forms: fs } of forms) {
      if (taken.has(book.id)) continue;
      const len = Math.max(0, ...fs.filter((f) => name.includes(` ${f} `)).map((f) => f.length));
      if (len === 0) continue;
      if (len > bestLen) { best = book; bestLen = len; tie = false; }
      else if (len === bestLen) tie = true;
    }
    if (best && !tie) {
      matched.push({ file, book: best });
      taken.add(best.id);
    } else {
      unmatched.push(file);
    }
  }
  return { matched, unmatched };
}
