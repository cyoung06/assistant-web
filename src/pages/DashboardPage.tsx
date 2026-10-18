import { useMemo } from "react";
import { useCalendar, useItems } from "../api/queries";
import { EntryRow } from "../components/EntryRow";
import { ItemRow } from "../components/ItemRow";
import { addDays, formatDay, parseDate } from "../lib/dates";
import { entryTime, groupByDay, isOpen, overdueBefore, today, weekStart, type Day } from "../lib/dashboard";
import styles from "./DashboardPage.module.css";

const UPCOMING_DAYS = 6;
const longDate = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" });

/** The start page: what's late, what's on today, what's coming, and what still needs a date. */
export function DashboardPage({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  const day = today();
  const from = weekStart(day);
  const to = addDays(day, UPCOMING_DAYS + 1);
  const calendar = useCalendar(from, to, [], true);
  const overdue = useItems({ overdue: true });
  const waiting = useItems({ done: false, scheduled: false, topLevel: true });

  const days = useMemo(
    () => groupByDay(calendar.data ?? [], from, (parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000),
    [calendar.data, from, to],
  );
  const byDate = new Map(days.map((d) => [d.date, d]));
  const todayInfo = byDate.get(day) ?? { date: day, schedule: [], deadlines: [] };
  // Repeating events (classes) are routine: they show in Today, but not in Coming up or the week strip.
  const oneOff = (d: Day): Day => ({ ...d, schedule: d.schedule.filter((e) => !e.seriesId), deadlines: d.deadlines.filter((e) => !e.seriesId) });
  const upcoming = days.filter((d) => d.date > day).map(oneOff);
  const week = days.filter((d) => d.date < addDays(from, 7)).map(oneOff);
  const now = new Date();

  const overdueItems = overdueBefore(overdue.data?.items ?? [], day);
  const waitingItems = waiting.data?.items ?? [];
  const todayOpen = [...todayInfo.schedule, ...todayInfo.deadlines].filter((e) => isOpen(e, now)).length;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>{longDate.format(parseDate(day))}</h1>
          <p className={styles.summary}>
            {calendar.isSuccess ? summary(overdueItems.length, todayOpen, waitingItems.length) : "\u00a0"}
          </p>
        </div>
        <WeekStrip week={week} today={day} onOpen={onOpenCalendar} />
      </header>

      <div className={styles.grid}>
        <div className={styles.main}>
          {overdueItems.length > 0 && (
            <section className={`${styles.card} ${styles.overdue}`}>
              <h2>
                Overdue <span className={styles.count}>{overdueItems.length}</span>
              </h2>
              {overdueItems.map((item) => (
                <ItemRow key={item.id} item={item} compact />
              ))}
            </section>
          )}

          <section className={styles.card}>
            <h2>Today</h2>
            {calendar.isPending && <p className={styles.empty}>Loading…</p>}
            {calendar.error && <p className={styles.empty}>{calendar.error.message}</p>}
            {calendar.isSuccess && todayInfo.schedule.length === 0 && todayInfo.deadlines.length === 0 && (
              <p className={styles.empty}>Nothing scheduled or due today.</p>
            )}
            {todayInfo.schedule.map((e) => (
              <EntryRow key={`${e.itemId}:${e.kind}`} entry={e} past={!isOpen(e, now) && !e.done} />
            ))}
            {todayInfo.deadlines.length > 0 && <h3>Due today</h3>}
            {todayInfo.deadlines.map((e) => (
              <EntryRow key={`${e.itemId}:${e.kind}`} entry={e} />
            ))}
          </section>

          <section className={styles.card}>
            <h2>Coming up</h2>
            {calendar.isSuccess && upcoming.every((d) => d.schedule.length + d.deadlines.length === 0) && (
              <p className={styles.empty}>Nothing in the next {UPCOMING_DAYS} days.</p>
            )}
            {upcoming.map((d) =>
              d.schedule.length + d.deadlines.length === 0 ? null : (
                <div key={d.date} className={styles.day}>
                  <h3>{d.date === addDays(day, 1) ? `Tomorrow · ${formatDay(d.date)}` : formatDay(d.date)}</h3>
                  {[...d.deadlines, ...d.schedule].sort((a, b) => entryTime(a) - entryTime(b)).map((e) => (
                    <EntryRow key={`${e.itemId}:${e.kind}`} entry={e} />
                  ))}
                </div>
              ),
            )}
          </section>
        </div>

        <aside className={styles.side}>
          <section className={styles.card}>
            <h2>
              Needs a date <span className={styles.count}>{waitingItems.length}</span>
            </h2>
            {waiting.isSuccess && waitingItems.length === 0 && <p className={styles.empty}>Everything has a date.</p>}
            {waitingItems.map((item) => (
              <ItemRow key={item.id} item={item} compact />
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}

function summary(overdue: number, today: number, waiting: number): string {
  const parts = [
    overdue > 0 ? `${overdue} overdue from earlier` : null,
    `${today} open today`,
    waiting > 0 ? `${waiting} without a date` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function WeekStrip({ week, today, onOpen }: { week: Day[]; today: string; onOpen: () => void }) {
  return (
    <button className={styles.week} onClick={onOpen} aria-label="Open this week in the calendar">
      {week.map((d) => {
        const blocks = d.schedule.length;
        const due = d.deadlines.length;
        return (
          <span key={d.date} className={`${styles.weekDay} ${d.date === today ? styles.weekToday : ""} ${d.date < today ? styles.weekPast : ""}`}>
            <span className={styles.weekName}>{weekday.format(parseDate(d.date))}</span>
            <span className={styles.weekNum}>{parseDate(d.date).getDate()}</span>
            <span className={styles.weekCounts}>
              {blocks > 0 && <span title={`${blocks} scheduled`}>{blocks}</span>}
              {due > 0 && (
                <span className={styles.weekDue} title={`${due} due`}>
                  {due}
                </span>
              )}
            </span>
          </span>
        );
      })}
    </button>
  );
}
