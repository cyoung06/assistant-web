import { describe, expect, it } from "vitest";
import type { AgendaEntry } from "../api/client";
import { changeForPlacement, toEvent } from "./calendarMapping";

// Runs with TZ=Asia/Seoul (see the npm test script).

const entry = (over: Partial<AgendaEntry>): AgendaEntry => ({
  id: "i1",
  kind: "block",
  title: "DB Assignment 3",
  calendarName: "Assistant",
  categories: [],
  done: false,
  overdue: false,
  repeats: false,
  fixed: false,
  ...over,
});

describe("toEvent", () => {
  it("makes the all-day end exclusive", () => {
    const e = toEvent(entry({ kind: "allDayBlock", startDate: "2026-10-20", endDate: "2026-10-21" }));
    expect(e).toMatchObject({ start: "2026-10-20", end: "2026-10-22", allDay: true });
  });

  it("draws deadlines as short, non-resizable markers starting at the due time", () => {
    const e = toEvent(entry({ kind: "deadline", due: "2026-10-20T19:00:00+09:00", overdue: true }));
    expect(e.durationEditable).toBe(false);
    expect(e.classNames).toContain("is-overdue");
    expect(new Date(e.start).getTime()).toBe(new Date("2026-10-20T19:00:00+09:00").getTime());
  });

  it("shows midnight deadlines in the all-day row and keeps late ones inside their day", () => {
    expect(toEvent(entry({ kind: "deadline", due: "2026-10-21T00:00:00+09:00" }))).toMatchObject({ start: "2026-10-21", allDay: true });
    const late = toEvent(entry({ kind: "deadline", due: "2026-10-23T23:59:00+09:00" }));
    expect(new Date(late.start).getTime()).toBe(new Date("2026-10-23T23:30:00+09:00").getTime());
  });

  it("locks fixed entries", () => {
    expect(toEvent(entry({ fixed: true })).editable).toBe(false);
    expect(toEvent(entry({ fixed: true })).classNames).toContain("is-fixed");
    expect(toEvent(entry({})).editable).toBe(true);
  });
});

describe("changeForPlacement", () => {
  it("moves a deadline's due date, keeping 23:59 and 00:00", () => {
    const d = entry({ kind: "deadline", due: "2026-10-20T19:00:00+09:00" });
    expect(changeForPlacement(d, { start: new Date(2026, 9, 24, 18, 0), end: new Date(2026, 9, 24, 18, 30), allDay: false })).toEqual({
      kind: "due",
      id: "i1",
      due: { date: "2026-10-24", time: "18:00" },
    });
    const late = entry({ kind: "deadline", due: "2026-10-23T23:59:00+09:00" });
    expect(changeForPlacement(late, { start: new Date(2026, 9, 25, 23, 30), end: null, allDay: false })).toMatchObject({ due: { date: "2026-10-25", time: "23:59" } });
    const midnight = entry({ kind: "deadline", due: "2026-10-21T00:00:00+09:00" });
    expect(changeForPlacement(midnight, { start: new Date(2026, 9, 22), end: null, allDay: true })).toMatchObject({ due: { date: "2026-10-22", time: "00:00" } });
  });

  it("moves events, turning an exclusive all-day end into an inclusive one", () => {
    const allDay = entry({ kind: "allDayBlock", startDate: "2026-10-20", endDate: "2026-10-21" });
    expect(changeForPlacement(allDay, { start: new Date(2026, 9, 21), end: new Date(2026, 9, 24), allDay: true })).toEqual({
      kind: "event",
      id: "i1",
      move: { startDate: "2026-10-21", endDate: "2026-10-23" },
    });
    const timed = entry({ kind: "block", start: "2026-10-20T10:00:00+09:00", end: "2026-10-20T11:00:00+09:00" });
    expect(changeForPlacement(timed, { start: new Date(2026, 9, 20, 14), end: new Date(2026, 9, 20, 16), allDay: false })).toMatchObject({
      move: { start: "2026-10-20T05:00:00.000Z", end: "2026-10-20T07:00:00.000Z" },
    });
  });
});
