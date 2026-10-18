import { describe, expect, it } from "vitest";
import type { EventOccurrence, Task } from "../api/client";
import { changeForPlacement, toEvent, type CalItem } from "./mapping";

// Runs with TZ=Asia/Seoul (see the npm test script).

const occurrence = (over: Partial<EventOccurrence>): CalItem => ({
  kind: "event",
  event: { id: "e1", title: "Meeting", calendarId: "assistant", calendarName: "Assistant", categories: [], repeats: false, fixed: false, ...over },
});

const deadline = (over: Partial<Task>): CalItem => ({
  kind: "deadline",
  task: {
    id: "t1", number: 1, title: "HW6", description: "", status: "todo", priority: "none", labelIds: [], relations: [], blocked: false,
    overdue: false, attachments: [], subtasks: 0, subtasksDone: 0, createdAt: "", updatedAt: "", version: 1, due: { date: "2026-10-20", time: "19:00:00" },
    ...over,
  },
});

describe("toEvent", () => {
  it("makes the all-day end exclusive", () => {
    const e = toEvent(occurrence({ startDate: "2026-10-20", endDate: "2026-10-21" }));
    expect(e).toMatchObject({ start: "2026-10-20", end: "2026-10-22", allDay: true, editable: true });
  });

  it("keeps repeating and source events fixed", () => {
    expect(toEvent(occurrence({ start: "2026-10-20T12:30:00+09:00", end: "2026-10-20T13:45:00+09:00", repeats: true })).editable).toBe(false);
    expect(toEvent(occurrence({ startDate: "2026-10-09", endDate: "2026-10-09", fixed: true })).classNames).toContain("is-fixed");
  });

  it("draws deadlines as short markers starting at the due time", () => {
    const e = toEvent(deadline({ overdue: true }));
    expect(e.durationEditable).toBe(false);
    expect(e.classNames).toContain("is-overdue");
    expect(new Date(e.start).getTime()).toBe(new Date("2026-10-20T19:00:00+09:00").getTime());
  });

  it("puts late, midnight and date-only deadlines where they're visible", () => {
    expect(new Date(toEvent(deadline({ due: { date: "2026-10-20", time: "23:59:00" } })).start).getHours()).toBe(23);
    expect(toEvent(deadline({ due: { date: "2026-10-21", time: "00:00:00" } }))).toMatchObject({ allDay: true, start: "2026-10-21" });
    expect(toEvent(deadline({ due: { date: "2026-10-21" }, source: "plms" }))).toMatchObject({ allDay: true, editable: false });
  });
});

describe("changeForPlacement", () => {
  it("moves a 23:59 deadline to another day at 23:59", () => {
    const c = changeForPlacement(deadline({ due: { date: "2026-10-20", time: "23:59:00" } }), { start: new Date(2026, 9, 22, 23, 30), end: null, allDay: false });
    expect(c).toEqual({ kind: "due", id: "t1", due: { date: "2026-10-22", time: "23:59" } });
  });

  it("keeps a date-only deadline date-only along the all-day row", () => {
    const c = changeForPlacement(deadline({ due: { date: "2026-10-20" } }), { start: new Date(2026, 9, 23), end: null, allDay: true });
    expect(c).toEqual({ kind: "due", id: "t1", due: { date: "2026-10-23", time: null } });
  });

  it("turns events into all-day ones and back", () => {
    const timed = occurrence({ start: "2026-10-20T10:00:00+09:00", end: "2026-10-20T11:00:00+09:00" });
    expect(changeForPlacement(timed, { start: new Date(2026, 9, 21), end: null, allDay: true })).toEqual({
      kind: "event", id: "e1", move: { startDate: "2026-10-21", endDate: "2026-10-21" },
    });
    const allDay = occurrence({ startDate: "2026-10-20", endDate: "2026-10-20" });
    const c = changeForPlacement(allDay, { start: new Date(2026, 9, 21, 14), end: null, allDay: false });
    expect(c).toMatchObject({ kind: "event", move: { start: new Date(2026, 9, 21, 14).toISOString(), end: new Date(2026, 9, 21, 15).toISOString() } });
  });
});
