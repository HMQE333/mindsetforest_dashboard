/**
 * The bell inbox: what is waiting for the user. Reminders they wrote to
 * themselves (public.reminders), plus what the app already knows: reviews not
 * done yet, this month's focus, friend requests. Which items were seen is
 * kept per device.
 */
import type { ReviewKind } from "@/lib/review-data";
import type { Reminder } from "@/lib/reminders";

export type InboxKind = "reminder" | "review" | "focus" | "friends";

export interface InboxItem {
  /** Stable while the thing it is about is the same; a new id counts as new (badge, sound). */
  id: string;
  kind: InboxKind;
  title: string;
  body?: string;
  /** Numbered lines (the month's goals). */
  lines?: string[];
  review?: { kind: ReviewKind; period: string };
  reminder?: Reminder;
}

export interface InboxSettings {
  reviews: boolean;
  focus: boolean;
  friends: boolean;
  sound: boolean;
}

export const DEFAULT_INBOX_SETTINGS: InboxSettings = { reviews: true, focus: true, friends: true, sound: true };

export function resolveInboxSettings(saved?: Partial<InboxSettings> | null): InboxSettings {
  return { ...DEFAULT_INBOX_SETTINGS, ...(saved || {}) };
}

/** "2026-10-w2": the focus reminder comes back once a week. */
export function focusWeek(today: string): string {
  return `${today.slice(0, 7)}-w${Math.ceil(Number(today.slice(8, 10)) / 7)}`;
}

export interface InboxInput {
  today: string;
  /** Reviews waiting, in the order they are offered. */
  due: { kind: ReviewKind; period: string }[];
  /** The month's goals, most important first (the first three are shown). */
  focus: string[];
  focusEnabled: boolean;
  monthName: string;
  friendRequests: number;
  settings: InboxSettings;
  /** The user's own reminders whose time has come (always shown: they asked for them). */
  reminders?: Reminder[];
}

export function buildInbox(input: InboxInput): InboxItem[] {
  const { today, due, focus, focusEnabled, monthName, friendRequests, settings, reminders = [] } = input;
  const items: InboxItem[] = reminders.map((r) => ({
    id: `reminder-${r.id}`,
    kind: "reminder" as const,
    title: `A message from ${new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
    body: r.message,
    reminder: r,
  }));
  if (settings.reviews) {
    for (const r of due) {
      items.push(
        r.kind === "monthly"
          ? {
              id: `review-monthly-${r.period}`,
              kind: "review",
              title: "Month in review",
              body: `Look back at last month${focusEnabled ? ` and set your focus for ${monthName}` : ""}.`,
              review: r,
            }
          : { id: `review-daily-${r.period}`, kind: "review", title: "Yesterday's review is waiting", body: "Two minutes: where did the time go?", review: r },
      );
    }
  }
  if (settings.focus && focusEnabled) {
    items.push(
      focus.length > 0
        ? { id: `focus-${focusWeek(today)}`, kind: "focus", title: `${monthName} focus`, lines: focus.slice(0, 3) }
        : { id: `focus-${focusWeek(today)}`, kind: "focus", title: `No focus set for ${monthName}`, body: "Name up to three goals for the month." },
    );
  }
  if (settings.friends && friendRequests > 0) {
    items.push({
      id: `friends-${friendRequests}`,
      kind: "friends",
      title: friendRequests === 1 ? "1 friend request" : `${friendRequests} friend requests`,
    });
  }
  return items;
}

/** Ids not in `seen`, i.e. what the badge counts. */
export function unseen(items: InboxItem[], seen: Iterable<string>): string[] {
  const s = new Set(seen);
  return items.map((i) => i.id).filter((id) => !s.has(id));
}
