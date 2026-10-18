import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "../api/client";
import { entryDays, groupByDay, isOpen, weekStart } from "./dashboard";

// Runs with TZ=Asia/Seoul (see the npm test script).

const entry = (over: Partial<CalendarEntry>): CalendarEntry => ({
  itemId: "i",
  kind: "block",
  title: "x",
  done: false,
  session: false,
  overdue: false,
  ...over,
});

describe("entryDays", () => {
  it("uses the local day of timed entries", () => {
    // 23:30 on the 18th in Seoul is still the 18th, although it's the 18th 14:30 UTC.
    expect(entryDays(entry({ kind: "block", start: "2026-10-18T23:30:00+09:00", end: "2026-10-19T00:30:00+09:00" }))).toEqual([
      "2026-10-18",
    ]);
  });

  it("covers every day of an all-day span", () => {
    expect(entryDays(entry({ kind: "allDayBlock", startDate: "2026-10-20", endDate: "2026-10-22" }))).toEqual([
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
    ]);
  });
});

describe("groupByDay", () => {
  it("splits blocks from deadlines and orders each day", () => {
    const days = groupByDay(
      [
        entry({ itemId: "late", kind: "block", start: "2026-10-19T14:00:00+09:00", end: "2026-10-19T16:00:00+09:00" }),
        entry({ itemId: "early", kind: "block", start: "2026-10-19T09:30:00+09:00", end: "2026-10-19T10:45:00+09:00" }),
        entry({ itemId: "allday", kind: "allDayBlock", startDate: "2026-10-19", endDate: "2026-10-19" }),
        entry({ itemId: "due", kind: "deadline", due: "2026-10-19T23:59:00+09:00" }),
        entry({ itemId: "outside", kind: "allDayDeadline", date: "2026-10-30" }),
      ],
      "2026-10-18",
      3,
    );
    expect(days.map((d) => d.date)).toEqual(["2026-10-18", "2026-10-19", "2026-10-20"]);
    expect(days[1]!.schedule.map((e) => e.itemId)).toEqual(["allday", "early", "late"]);
    expect(days[1]!.deadlines.map((e) => e.itemId)).toEqual(["due"]);
    expect(days.flatMap((d) => [...d.schedule, ...d.deadlines]).some((e) => e.itemId === "outside")).toBe(false);
  });
});

describe("weekStart", () => {
  it("returns the Sunday of the week", () => {
    expect(weekStart("2026-10-18")).toBe("2026-10-18"); // a Sunday
    expect(weekStart("2026-10-24")).toBe("2026-10-18"); // Saturday
    expect(weekStart("2026-10-25")).toBe("2026-10-25");
  });
});

describe("isOpen", () => {
  const now = new Date("2026-10-18T12:00:00+09:00");
  it("treats finished blocks and done entries as handled", () => {
    expect(isOpen(entry({ kind: "block", start: "2026-10-18T09:00:00+09:00", end: "2026-10-18T10:00:00+09:00" }), now)).toBe(false);
    expect(isOpen(entry({ kind: "block", start: "2026-10-18T13:00:00+09:00", end: "2026-10-18T14:00:00+09:00" }), now)).toBe(true);
    expect(isOpen(entry({ kind: "deadline", due: "2026-10-18T23:00:00+09:00", done: true }), now)).toBe(false);
  });
});
