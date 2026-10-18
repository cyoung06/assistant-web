// Translation between what the calendar shows (event occurrences, task deadlines) and FullCalendar
// events, and from calendar gestures (drag, resize) back to changes: a task's due date, or an
// event's time.

import type { Due, EventOccurrence, Task } from "../api/client";
import { addDays, toDateString, toTimeString } from "../lib/dates";
import { plainText } from "../refs/kinds";

export type CalItem = { kind: "event"; event: EventOccurrence } | { kind: "deadline"; task: Task; color?: string };

/** How long a deadline marker is drawn in the time grid. It's a point in time, so this is only visual. */
const DEADLINE_DRAW_MINUTES = 30;
const LAST_DRAW_START_MINUTES = 24 * 60 - DEADLINE_DRAW_MINUTES;

/**
 * Where a deadline marker starts: at the due time, so its top edge marks the deadline. Deadlines in
 * the last half hour of a day (e.g. 23:59) start at 23:30 instead, so the marker stays in its day.
 */
export function deadlineDrawStart(due: Date): Date {
  const minutes = due.getHours() * 60 + due.getMinutes();
  if (minutes <= LAST_DRAW_START_MINUTES) return due;
  const start = new Date(due);
  start.setHours(0, LAST_DRAW_START_MINUTES, 0, 0);
  return start;
}

/** The task's due as a local Date (date-only deadlines: that midnight). */
export function dueInstant(due: Due): Date {
  const [y, m, d] = due.date.split("-").map(Number);
  const [h, min] = (due.time ?? "00:00").split(":").map(Number);
  return new Date(y!, m! - 1, d!, h, min);
}

/** A timed deadline at exactly 00:00. */
export const isMidnight = (due: Due) => !!due.time && due.time.startsWith("00:00");

export interface EventShape {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  color?: string;
  classNames: string[];
  editable: boolean;
  durationEditable: boolean;
  extendedProps: { item: CalItem };
}

export function toEvent(item: CalItem): EventShape {
  if (item.kind === "event") {
    const e = item.event;
    const classNames = ["kind-event"];
    if (e.fixed) classNames.push("is-fixed");
    if (e.repeats) classNames.push("is-repeat");
    const base = {
      id: `e:${e.id}:${e.start ?? e.startDate}`,
      title: plainText(e.title) || "Untitled",
      color: e.color ?? undefined,
      classNames,
      // Repeating events change through their rule, in the dialog.
      editable: !e.fixed && !e.repeats,
      extendedProps: { item },
    };
    return e.startDate
      ? // FullCalendar's all-day end is exclusive; the API's is inclusive.
        { ...base, start: e.startDate, end: addDays(e.endDate!, 1), allDay: true, durationEditable: true }
      : { ...base, start: e.start!, end: e.end!, allDay: false, durationEditable: true };
  }

  const t = item.task;
  const due = t.due!;
  const classNames = ["kind-deadline"];
  if (t.status === "done" || t.status === "canceled") classNames.push("is-done");
  if (t.overdue) classNames.push("is-overdue");
  if (t.source) classNames.push("is-fixed");
  const base = {
    id: `d:${t.id}`,
    title: plainText(t.title),
    color: item.color,
    classNames,
    editable: !t.source,
    durationEditable: false,
    extendedProps: { item },
  };
  // Date-only and midnight deadlines go in the all-day row (midnight ones would sit at the very
  // top of the time grid, scrolled out of view; the label still says 00:00).
  if (!due.time || isMidnight(due)) return { ...base, start: due.date, allDay: true };
  const start = deadlineDrawStart(dueInstant(due));
  const end = new Date(start.getTime() + DEADLINE_DRAW_MINUTES * 60_000);
  return { ...base, start: start.toISOString(), end: end.toISOString(), allDay: false };
}

/** Where an item ended up after a drag or resize. [end] is exclusive for all-day ones, as FullCalendar gives it. */
export interface Placement {
  start: Date;
  end: Date | null;
  allDay: boolean;
}

/** A timed event's or an all-day event's new place; all-day end inclusive, as the API takes it. */
export type EventMove = { start: string; end: string } | { startDate: string; endDate: string };

export type Change = { kind: "due"; id: string; due: Due } | { kind: "event"; id: string; move: EventMove };

export function changeForPlacement(item: CalItem, p: Placement): Change {
  if (item.kind === "deadline") {
    const due = item.task.due!;
    // Along the all-day row the time stays (00:00, or none).
    if (p.allDay) return { kind: "due", id: item.task.id, due: { date: toDateString(p.start), time: due.time ?? null } };
    // Keep the deadline's offset from its marker's start, so a 23:59 deadline moved to another day stays 23:59.
    const offset = due.time && !isMidnight(due) ? dueInstant(due).getTime() - deadlineDrawStart(dueInstant(due)).getTime() : 0;
    const at = new Date(p.start.getTime() + offset);
    return { kind: "due", id: item.task.id, due: { date: toDateString(at), time: toTimeString(at) } };
  }
  const allDayBefore = !!item.event.startDate;
  if (p.allDay) {
    const start = toDateString(p.start);
    // A timed event dragged into the all-day row becomes a one-day event.
    const endExclusive = p.end && allDayBefore ? toDateString(p.end) : addDays(start, 1);
    return { kind: "event", id: item.event.id, move: { startDate: start, endDate: addDays(endExclusive, -1) } };
  }
  // An all-day event dragged into the time grid gets one hour.
  const end = p.end && !allDayBefore ? p.end : new Date(p.start.getTime() + 60 * 60_000);
  return { kind: "event", id: item.event.id, move: { start: p.start.toISOString(), end: end.toISOString() } };
}
