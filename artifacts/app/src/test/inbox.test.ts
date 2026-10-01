import { describe, it, expect } from "vitest";
import { buildInbox, DEFAULT_INBOX_SETTINGS, focusWeek, resolveInboxSettings, unseen } from "../lib/inbox";

const base = {
  today: "2026-10-09",
  due: [],
  focus: [],
  focusEnabled: true,
  monthName: "October",
  friendRequests: 0,
  settings: DEFAULT_INBOX_SETTINGS,
};

describe("buildInbox", () => {
  it("lists due reviews, the month's focus and friend requests", () => {
    const items = buildInbox({
      ...base,
      due: [{ kind: "daily", period: "2026-10-08" }, { kind: "monthly", period: "2026-09" }],
      focus: ["Ship the offer", "Train 4x a week", "Read 2 books", "Fourth"],
      friendRequests: 2,
    });
    expect(items.map((i) => i.id)).toEqual(["review-daily-2026-10-08", "review-monthly-2026-09", "focus-2026-10-w2", "friends-2"]);
    expect(items[1].body).toMatch(/set your focus for October/);
    expect(items[2].lines).toEqual(["Ship the offer", "Train 4x a week", "Read 2 books"]);
    expect(items[3].title).toBe("2 friend requests");
  });

  it("asks for a focus when none is set, and respects the switches", () => {
    expect(buildInbox(base).map((i) => i.title)).toEqual(["No focus set for October"]);
    expect(buildInbox({ ...base, focusEnabled: false })).toEqual([]);
    const off = resolveInboxSettings({ reviews: false, focus: false });
    expect(buildInbox({ ...base, settings: off, due: [{ kind: "daily", period: "2026-10-08" }], friendRequests: 1 }).map((i) => i.kind)).toEqual(["friends"]);
  });

  it("brings the focus reminder back once a week and counts unseen ids", () => {
    expect(focusWeek("2026-10-01")).toBe("2026-10-w1");
    expect(focusWeek("2026-10-07")).toBe("2026-10-w1");
    expect(focusWeek("2026-10-08")).toBe("2026-10-w2");
    expect(focusWeek("2026-10-31")).toBe("2026-10-w5");
    const items = buildInbox({ ...base, friendRequests: 1 });
    expect(unseen(items, ["focus-2026-10-w2"])).toEqual(["friends-1"]);
    expect(resolveInboxSettings(null)).toEqual(DEFAULT_INBOX_SETTINGS);
  });
});

describe("reminders in the inbox", () => {
  it("puts arrived reminders first, as a message from the day they were written", () => {
    const items = buildInbox({
      ...base,
      focusEnabled: false,
      due: [{ kind: "daily", period: "2026-10-08" }],
      reminders: [{ id: "r1", message: "Did you ship it?", deliverAt: "2026-10-09T07:00:00Z", createdAt: "2021-10-09T07:00:00Z" }],
    });
    expect(items.map((i) => i.id)).toEqual(["reminder-r1", "review-daily-2026-10-08"]);
    expect(items[0].title).toBe("A message from 9 October 2021");
    expect(items[0].body).toBe("Did you ship it?");
  });
});
