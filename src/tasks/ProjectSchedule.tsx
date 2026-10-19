import type { components } from "../api/schema";
import { useProjectSchedule } from "../calendar/api";
import { plainText } from "../refs/kinds";
import styles from "./TasksApp.module.css";

type Recurring = components["schemas"]["RecurringSummary"];

const DAY = { MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun" } as const;

/** "Tue · Thu 12:30–13:45", "Every 2 weeks · Fri", "Daily 09:00–10:00". */
export function scheduleLine(r: Recurring): string {
  const time = r.start && r.end ? ` ${r.start.slice(0, 5)}–${r.end.slice(0, 5)}` : "";
  const days = r.weekdays.map((d) => DAY[d]).join(" · ");
  if (r.freq === "weekly") return `${r.interval > 1 ? `Every ${r.interval} weeks · ` : ""}${days}${time}`;
  if (r.freq === "daily") return `${r.interval > 1 ? `Every ${r.interval} days` : "Daily"}${time}`;
  return `${r.interval > 1 ? `Every ${r.interval} months` : "Monthly"}${time}`;
}

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * A project's calendar without the clutter: its repeating events (lectures) as one line each, and
 * below, only what's coming up once: exams, meetings, and lectures that won't happen.
 */
export function ProjectSchedule({ projectId, projectName }: { projectId: string; projectName: string }) {
  const schedule = useProjectSchedule(projectId).data;
  if (!schedule) return null;
  const items = [
    ...schedule.upcoming.map((o) => ({
      key: `${o.id}:${o.start ?? o.startDate}`,
      eventId: o.id,
      date: o.startDate ?? new Date(o.start!).toLocaleDateString("sv-SE"),
      time: o.start ? timeLabel(o.start) : "",
      title: plainText(o.title),
      skipped: false,
    })),
    ...schedule.skipped.map((s) => ({ key: `${s.eventId}:${s.date}`, eventId: s.eventId, date: s.date, time: "", title: `${plainText(s.title)} · skipped`, skipped: true })),
  ].sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
  if (schedule.recurring.length === 0 && items.length === 0) return null;

  return (
    <div className={styles.schedule}>
      {schedule.recurring.map((r) => (
        <a key={r.eventId} className={styles.scheduleLine} href={`#event/${r.eventId}`} title="Open the event">
          {plainText(r.title) !== projectName && <span>{plainText(r.title)} · </span>}
          {scheduleLine(r)}
        </a>
      ))}
      {items.length > 0 && (
        <ul className={styles.upcoming} aria-label="Upcoming">
          {items.map((i) => (
            <li key={i.key}>
              <a href={`#event/${i.eventId}`} className={i.skipped ? styles.skippedItem : undefined}>
                <span className={styles.upDate}>{dayLabel(i.date)}</span>
                <span className={styles.upTime}>{i.time}</span>
                <span className={styles.upTitle}>{i.title}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
