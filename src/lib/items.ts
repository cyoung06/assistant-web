// Sorting helpers for task lists and tables.

import type { Task } from "../api/client";

/** Comparable deadline: "YYYY-MM-DDTHH:MM", with date-only deadlines at the end of their day. */
export function dueKey(t: Task): string | null {
  return t.due ? `${t.due.date}T${t.due.time?.slice(0, 5) ?? "24:00"}` : null;
}

export type SortField = "title" | "due" | "calendar" | "sub" | "time";

const keyOf: Record<SortField, (t: Task) => string | number | null> = {
  title: (t) => t.title.toLocaleLowerCase(),
  due: dueKey,
  calendar: (t) => t.calendarName.toLocaleLowerCase(),
  sub: (t) => (t.subtasks ? t.subtasksDone / t.subtasks : null),
  time: (t) => t.minutesSpent + t.minutesPlanned || null,
};

/** Sorts by [field]; tasks without a value always go last, whatever the direction. */
export function sortTasks(tasks: Task[], field: SortField, ascending: boolean): Task[] {
  const key = keyOf[field];
  return [...tasks].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null && kb === null) return 0;
    if (ka === null) return 1;
    if (kb === null) return -1;
    const cmp = ka < kb ? -1 : ka > kb ? 1 : 0;
    return ascending ? cmp : -cmp;
  });
}
