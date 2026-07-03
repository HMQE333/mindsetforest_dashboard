export interface Course {
  id: string;
  user_id: string;
  title: string;
  platform: string;
  instructor: string;
  url: string;
  progress_pct: number;
  status: CourseStatus;
  rating: number | null;
  tags: string[];
  pillars: string[];
  directions: string[];
  cover_color: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type CourseStatus = "to-start" | "in-progress" | "completed";

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  "to-start": "📋 To Start",
  "in-progress": "🎓 In Progress",
  completed: "✅ Completed",
};

export const PLATFORM_SUGGESTIONS = [
  "Udemy", "Coursera", "Skillshare", "YouTube", "edX",
  "Pluralsight", "LinkedIn Learning", "Domestika", "MasterClass", "Other",
];
