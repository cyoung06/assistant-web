// Grouping of calendar entries for the dashboard: today's schedule and deadlines, the next days,
// and per-day counts for the week strip. Days are local dates (YYYY-MM-DD).

import type { CalendarEntry, Item } from "../api/client";
import { addDays, parseDate, toDateString } from "./dates";

export const isDeadline = (e: CalendarEntry) => e.kind === "deadline" || e.kind === "allDayDeadline";

/** Every local day an entry touches. All-day blocks can span several days. */
export function entryDays(e: CalendarEntry): string[] {
  switch (e.kind) {
    case "block":
      return [toDateString(new Date(e.start!))];
    case "deadline":
      return [toDateString(new Date(e.due!))];
    case "allDayDeadline":
      return [e.date!];
    case "allDayBlock": {
      const days: string[] = [];
      for (let d = e.startDate!; d <= e.endDate!; d = addDays(d, 1)) days.push(d);
      return days;
    }
  }
}

/** Sort key within a day: all-day entries first, then by time. */
export function entryTime(e: CalendarEntry): number {
  if (e.kind === "block") return new Date(e.start!).getTime();
  if (e.kind === "deadline") return new Date(e.due!).getTime();
  return Number.NEGATIVE_INFINITY;
}

export interface Day {
  date: string;
  schedule: CalendarEntry[];
  deadlines: CalendarEntry[];
}

/** [days] consecutive days starting at [from], each with its blocks and deadlines in time order. */
export function groupByDay(entries: CalendarEntry[], from: string, days: number): Day[] {
  const result: Day[] = [];
  for (let i = 0; i < days; i++) result.push({ date: addDays(from, i), schedule: [], deadlines: [] });
  const byDate = new Map(result.map((d) => [d.date, d]));
  for (const e of entries) {
    for (const date of entryDays(e)) {
      const day = byDate.get(date);
      if (day) (isDeadline(e) ? day.deadlines : day.schedule).push(e);
    }
  }
  for (const d of result) {
    d.schedule.sort((a, b) => entryTime(a) - entryTime(b));
    d.deadlines.sort((a, b) => entryTime(a) - entryTime(b));
  }
  return result;
}

/** The Sunday that starts the week containing [date]. */
export function weekStart(date: string): string {
  return addDays(date, -parseDate(date).getDay());
}

/** Entries that still need attention: not done. A timed block that has already ended doesn't either. */
export function isOpen(e: CalendarEntry, now: Date): boolean {
  if (e.done) return false;
  if (e.kind === "block") return new Date(e.end!) > now;
  return true;
}

/**
 * Items overdue from before [today], oldest deadline first. Deadlines that passed earlier today
 * stay in today's list (marked late) rather than showing twice.
 */
export function overdueBefore(items: Item[], today: string): Item[] {
  const key = (i: Item) => `${i.by?.date ?? "9999"}T${i.by?.time ?? "99"}`;
  return items.filter((i) => i.by && i.by.date < today).sort((a, b) => key(a).localeCompare(key(b)));
}

export const today = () => toDateString(new Date());
