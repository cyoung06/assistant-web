// Sorting helpers for item lists and tables.

import type { Item } from "../api/client";

/** Comparable deadline: "YYYY-MM-DDTHH:MM", with date-only deadlines at the end of their day. */
export function dueKey(i: Item): string | null {
  return i.by ? `${i.by.date}T${i.by.time?.slice(0, 5) ?? "24:00"}` : null;
}

/** Comparable start of the scheduled time, in local time. */
export function atKey(i: Item): string | null {
  if (!i.at) return null;
  if (i.at.allDay) return `${i.at.startDate}T00:00`;
  const d = new Date(i.at.start!);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The earliest of an item's deadline and scheduled time; null when it has neither. */
export function nextKey(i: Item): string | null {
  const keys = [dueKey(i), atKey(i)].filter((k): k is string => k !== null);
  return keys.length ? keys.sort()[0]! : null;
}

export type SortField = "title" | "due" | "at" | "next" | "sub" | "time" | "created";

const keyOf: Record<SortField, (i: Item) => string | number | null> = {
  title: (i) => (i.derived.displayTitle || "").toLocaleLowerCase(),
  due: dueKey,
  at: atKey,
  next: nextKey,
  sub: (i) => (i.derived.subItems ? i.derived.subItemsDone / i.derived.subItems : null),
  time: (i) => i.derived.timeSpentMinutes + i.derived.timePlannedMinutes || null,
  created: (i) => i.createdAt,
};

/** Sorts by [field]; items without a value always go last, whatever the direction. */
export function sortItems(items: Item[], field: SortField, ascending: boolean): Item[] {
  const key = keyOf[field];
  return [...items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null && kb === null) return 0;
    if (ka === null) return 1;
    if (kb === null) return -1;
    const cmp = ka < kb ? -1 : ka > kb ? 1 : 0;
    return ascending ? cmp : -cmp;
  });
}
