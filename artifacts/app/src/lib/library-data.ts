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
  /** Set when the status turns to finished. */
  finished_at?: string | null;
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
  /** Words on each page (index 0 = page 1), for reading speed in words per minute. */
  pageWords?: number[];
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

export const TAG_SUGGESTIONS = [
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
