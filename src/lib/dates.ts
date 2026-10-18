// Dates are shown and entered in the browser's zone, which for this app is Asia/Seoul.
// The API speaks ISO strings: dates as YYYY-MM-DD, instants with an offset.

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD of [d] in local time. */
export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's YYYY-MM-DD. */
export const today = () => toDateString(new Date());

/** HH:MM of [d] in local time. */
export function toTimeString(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses a local YYYY-MM-DD as midnight local time (Date's own parser would use UTC). */
export function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function addDays(date: string, days: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/** "HH:MM" from the API's "HH:MM:SS". */
export function shortTime(time: string): string {
  return time.slice(0, 5);
}

const dayFormat = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

export function formatDay(date: Date | string): string {
  return dayFormat.format(typeof date === "string" ? parseDate(date) : date);
}
