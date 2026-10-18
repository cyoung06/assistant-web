// Translation between API calendar entries and FullCalendar events, and from calendar gestures
// (drag, resize, drop) back to item changes.

import type { At, CalendarEntry, ItemPatch } from "../api/client";
import { addDays, toDateString, toTimeString } from "./dates";

/** How long a deadline marker is drawn in the time grid. It's a point in time, so this is only visual. */
const DEADLINE_DRAW_MINUTES = 30;

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
      // Drawn as the half hour leading up to the deadline, so a 23:59 deadline stays inside its day.
      const start = new Date(new Date(entry.due!).getTime() - DEADLINE_DRAW_MINUTES * 60_000).toISOString();
      return { ...base, start, end: entry.due!, allDay: false, durationEditable: false };
    }
    case "allDayDeadline":
      return { ...base, start: entry.date!, allDay: true, durationEditable: false };
  }
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
    if (p.allDay) return { by: { date: toDateString(p.start) } };
    // A timed deadline marker ends at the due time.
    const due = p.end ?? new Date(p.start.getTime() + DEADLINE_DRAW_MINUTES * 60_000);
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
