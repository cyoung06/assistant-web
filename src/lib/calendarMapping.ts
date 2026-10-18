// Translation between API calendar entries and FullCalendar events, and from calendar gestures
// (drag, resize, drop) back to item changes.

import type { At, CalendarEntry, ItemPatch } from "../api/client";
import { addDays, toDateString, toTimeString } from "./dates";

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

export interface EventShape {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  color?: string;
  classNames: string[];
  durationEditable: boolean;
  extendedProps: { entry: CalendarEntry };
}

export function toEvent(entry: CalendarEntry): EventShape {
  const classNames = [`kind-${entry.kind}`];
  if (entry.done) classNames.push("is-done");
  if (entry.overdue && (entry.kind === "deadline" || entry.kind === "allDayDeadline")) classNames.push("is-overdue");
  if (entry.session) classNames.push("is-session");

  const base = {
    id: `${entry.itemId}:${entry.kind}`,
    title: entry.title || "Untitled",
    color: entry.color ?? undefined,
    classNames,
    extendedProps: { entry },
  };

  switch (entry.kind) {
    case "block":
      return { ...base, start: entry.start!, end: entry.end!, allDay: false, durationEditable: true };
    case "allDayBlock":
      // FullCalendar's all-day end is exclusive; the API's is inclusive.
      return { ...base, start: entry.startDate!, end: addDays(entry.endDate!, 1), allDay: true, durationEditable: true };
    case "deadline": {
      // Midnight deadlines would sit at the very top of the time grid, scrolled out of view; show them
      // in their day's all-day row instead (the label still says 00:00).
      if (isMidnight(entry)) {
        return { ...base, classNames: [...classNames, "is-midnight"], start: toDateString(new Date(entry.due!)), allDay: true, durationEditable: false };
      }
      const start = deadlineDrawStart(new Date(entry.due!));
      const end = new Date(start.getTime() + DEADLINE_DRAW_MINUTES * 60_000);
      return { ...base, start: start.toISOString(), end: end.toISOString(), allDay: false, durationEditable: false };
    }
    case "allDayDeadline":
      return { ...base, start: entry.date!, allDay: true, durationEditable: false };
  }
}

/** A timed deadline at exactly 00:00 local time. */
export function isMidnight(entry: CalendarEntry): boolean {
  if (entry.kind !== "deadline") return false;
  const due = new Date(entry.due!);
  return due.getHours() === 0 && due.getMinutes() === 0;
}

/** Where an event ended up after a drag or resize. [end] is exclusive for all-day events, as FullCalendar gives it. */
export interface Placement {
  start: Date;
  end: Date | null;
  allDay: boolean;
}

/** The item change for moving or resizing one entry. Blocks change `at`; deadlines change `by`. */
export function patchForPlacement(entry: CalendarEntry, p: Placement): ItemPatch {
  if (entry.kind === "deadline" || entry.kind === "allDayDeadline") {
    // A midnight deadline moved along the all-day row stays at 00:00.
    if (p.allDay) return isMidnight(entry) ? { by: { date: toDateString(p.start), time: "00:00" } } : { by: { date: toDateString(p.start) } };
    // Keep the deadline's offset from its marker's start, so a 23:59 deadline moved to another day stays 23:59.
    const offset = entry.kind === "deadline" ? new Date(entry.due!).getTime() - deadlineDrawStart(new Date(entry.due!)).getTime() : 0;
    const due = new Date(p.start.getTime() + offset);
    return { by: { date: toDateString(due), time: toTimeString(due) } };
  }
  return { at: atForPlacement(p, entry) };
}

function atForPlacement(p: Placement, entry: CalendarEntry): At {
  if (p.allDay) {
    const start = toDateString(p.start);
    // A timed block dragged into the all-day row becomes a one-day item.
    const endExclusive = p.end && entry.kind === "allDayBlock" ? toDateString(p.end) : addDays(start, 1);
    return { allDay: true, startDate: start, endDate: addDays(endExclusive, -1) };
  }
  // An all-day item dragged into the time grid gets one hour.
  const end = p.end && entry.kind === "block" ? p.end : new Date(p.start.getTime() + 60 * 60_000);
  return { allDay: false, start: p.start.toISOString(), end: end.toISOString() };
}

/** The `at` for dropping an item from the list onto a slot: one hour, or one day in the all-day row. */
export function atForDrop(date: Date, allDay: boolean): At {
  return allDay
    ? { allDay: true, startDate: toDateString(date), endDate: toDateString(date) }
    : { allDay: false, start: date.toISOString(), end: new Date(date.getTime() + 60 * 60_000).toISOString() };
}

/** The `at` for selecting a range of empty slots. */
export function atForSelection(start: Date, end: Date, allDay: boolean): At {
  return allDay
    ? { allDay: true, startDate: toDateString(start), endDate: addDays(toDateString(end), -1) }
    : { allDay: false, start: start.toISOString(), end: end.toISOString() };
}
