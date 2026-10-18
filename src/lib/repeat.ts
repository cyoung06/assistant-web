import type { components } from "../api/schema";
import { formatDay } from "./dates";

export type RepeatRule = components["schemas"]["RepeatRule"];
export type Weekday = NonNullable<RepeatRule["weekdays"]>[number];

/** Sunday first, as in the app's calendar. */
export const WEEKDAYS: { value: Weekday; short: string }[] = [
  { value: "SUNDAY", short: "Sun" },
  { value: "MONDAY", short: "Mon" },
  { value: "TUESDAY", short: "Tue" },
  { value: "WEDNESDAY", short: "Wed" },
  { value: "THURSDAY", short: "Thu" },
  { value: "FRIDAY", short: "Fri" },
  { value: "SATURDAY", short: "Sat" },
];

const JS_DAY: Weekday[] = WEEKDAYS.map((d) => d.value);

/** The weekday of a local YYYY-MM-DD date. */
export function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split("-").map(Number);
  return JS_DAY[new Date(y!, m! - 1, d!).getDay()]!;
}

/** "Weekly on Tue, Thu until Fri, Dec 18", "Every 2 days, 10 times", "Monthly on day 31". */
export function describeRepeat(rule: RepeatRule, startDate: string): string {
  const every = rule.interval ?? 1;
  let text: string;
  switch (rule.freq) {
    case "daily":
      text = every === 1 ? "Daily" : `Every ${every} days`;
      break;
    case "weekly": {
      const days = rule.weekdays?.length ? rule.weekdays : [weekdayOf(startDate)];
      const names = WEEKDAYS.filter((d) => days.includes(d.value)).map((d) => d.short).join(", ");
      text = `${every === 1 ? "Weekly" : `Every ${every} weeks`} on ${names}`;
      break;
    }
    case "monthly":
      text = `${every === 1 ? "Monthly" : `Every ${every} months`} on day ${Number(startDate.slice(8, 10))}`;
      break;
  }
  if (rule.until) text += ` until ${formatDay(rule.until)}`;
  else if (rule.count) text += `, ${rule.count} times`;
  return text;
}

/** Item fields whose change can apply to other occurrences; anything else stays with the one item. */
export const SERIES_FIELDS = ["title", "at", "tagIds", "mainTagId"] as const;

export function touchesSeries(patch: object): boolean {
  return SERIES_FIELDS.some((f) => f in patch);
}
