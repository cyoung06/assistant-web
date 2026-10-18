import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "../api/client";
import { atForSelection, patchForPlacement, toEvent } from "./calendarMapping";

// Runs with TZ=Asia/Seoul (see the npm test script).

const entry = (over: Partial<CalendarEntry>): CalendarEntry => ({
  itemId: "i1",
  kind: "block",
  title: "DB Assignment 3",
  done: false,
  session: false,
  overdue: false,
  ...over,
});

describe("toEvent", () => {
  it("makes the all-day end exclusive", () => {
    const e = toEvent(entry({ kind: "allDayBlock", startDate: "2026-10-20", endDate: "2026-10-21" }));
    expect(e).toMatchObject({ start: "2026-10-20", end: "2026-10-22", allDay: true });
  });

  it("draws deadlines as short, non-resizable markers and flags overdue ones", () => {
    const e = toEvent(entry({ kind: "deadline", due: "2026-10-23T23:59:00+09:00", overdue: true }));
    expect(e.durationEditable).toBe(false);
    expect(e.classNames).toContain("is-overdue");
    expect(e.end).toBe("2026-10-23T23:59:00+09:00");
    expect(new Date(e.end!).getTime() - new Date(e.start).getTime()).toBe(30 * 60_000);
  });
});

describe("patchForPlacement", () => {
  it("moves a deadline's by, keeping a time only in the time grid", () => {
    const deadline = entry({ kind: "deadline", due: "2026-10-23T23:59:00+09:00" });
    const moved = { start: new Date(2026, 9, 24, 17, 30), end: new Date(2026, 9, 24, 18, 0), allDay: false };
    expect(patchForPlacement(deadline, moved)).toEqual({ by: { date: "2026-10-24", time: "18:00" } });
    // Dragged in from the all-day row, FullCalendar gives no end: the marker's start + 30 minutes.
    const fromAllDay = { start: new Date(2026, 9, 24, 9, 0), end: null, allDay: false };
    expect(patchForPlacement(deadline, fromAllDay)).toEqual({ by: { date: "2026-10-24", time: "09:30" } });
    expect(patchForPlacement(deadline, { start: new Date(2026, 9, 24), end: null, allDay: true })).toEqual({
      by: { date: "2026-10-24" },
    });
  });

  it("turns an exclusive all-day end into an inclusive endDate", () => {
    const allDay = entry({ kind: "allDayBlock", startDate: "2026-10-20", endDate: "2026-10-21" });
    expect(
      patchForPlacement(allDay, { start: new Date(2026, 9, 21), end: new Date(2026, 9, 24), allDay: true }),
    ).toEqual({ at: { allDay: true, startDate: "2026-10-21", endDate: "2026-10-23" } });
  });

  it("gives an all-day item dropped into the time grid one hour", () => {
    const allDay = entry({ kind: "allDayBlock", startDate: "2026-10-20", endDate: "2026-10-20" });
    const patch = patchForPlacement(allDay, { start: new Date(2026, 9, 20, 9, 0), end: null, allDay: false });
    expect(patch.at).toEqual({ allDay: false, start: "2026-10-20T00:00:00.000Z", end: "2026-10-20T01:00:00.000Z" });
  });
});

describe("atForSelection", () => {
  it("converts a selected day range to inclusive dates", () => {
    expect(atForSelection(new Date(2026, 9, 20), new Date(2026, 9, 22), true)).toEqual({
      allDay: true,
      startDate: "2026-10-20",
      endDate: "2026-10-21",
    });
  });
});
