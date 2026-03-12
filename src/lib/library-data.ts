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
  created_at: string;
  updated_at: string;
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
