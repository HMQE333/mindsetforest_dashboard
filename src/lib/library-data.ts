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
  created_at: string;
  updated_at: string;
}

export type BookStatus = Book["status"];

export const STATUS_LABELS: Record<BookStatus, string> = {
  "to-read": "📖 To Read",
  reading: "📚 Reading",
  finished: "✅ Finished",
};

export const COVER_COLORS = [
  "#8B5CF6", "#3B82F6", "#EF4444", "#F97316", "#10B981",
  "#EC4899", "#6366F1", "#14B8A6", "#F59E0B", "#64748B",
];
