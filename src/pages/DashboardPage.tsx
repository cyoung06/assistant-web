import { useMemo } from "react";
import { TASK_VIEW_HIDDEN, useAgenda, useTasks } from "../api/queries";
import { EntryRow } from "../components/EntryRow";
import { TaskRow } from "../components/TaskRow";
import { addDays, formatDay, parseDate } from "../lib/dates";
import { entryTime, groupByDay, isOpen, overdueBefore, today, weekStart, type Day } from "../lib/dashboard";
import styles from "./DashboardPage.module.css";

const UPCOMING_DAYS = 6;
const longDate = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" });

/** The start page: what's late, what's on today, what's coming, and what still needs a date. */
export function DashboardPage() {
  const day = today();
  const from = weekStart(day);
  const last = addDays(day, UPCOMING_DAYS);
  const count = (parseDate(last).getTime() - parseDate(from).getTime()) / 86_400_000 + 1;
  const calendar = useAgenda(from, last);
  // Coming up and the week strip leave out time-slot things like classes and holidays; Today shows everything.
  const taskCalendar = useAgenda(from, last, TASK_VIEW_HIDDEN);
  const open = useTasks({ status: "open", hide: TASK_VIEW_HIDDEN });

  const days = useMemo(() => groupByDay(calendar.data ?? [], from, count), [calendar.data, from, count]);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const todayInfo = byDate.get(day) ?? { date: day, schedule: [], deadlines: [] };
  const taskDays = useMemo(() => groupByDay(taskCalendar.data ?? [], from, count), [taskCalendar.data, from, count]);
  const upcoming = taskDays.filter((d) => d.date > day);
  const week = taskDays.filter((d) => d.date < addDays(from, 7));
  const now = new Date();

  const overdueItems = overdueBefore(open.data ?? [], day);
  const waitingItems = (open.data ?? []).filter((t) => !t.due && !t.parentId);
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
        <WeekStrip week={week} today={day} />
      </header>

      <div className={styles.grid}>
        <div className={styles.main}>
          {overdueItems.length > 0 && (
            <section className={`${styles.card} ${styles.overdue}`}>
              <h2>
                Overdue <span className={styles.count}>{overdueItems.length}</span>
              </h2>
              {overdueItems.map((item) => (
                <TaskRow key={item.id} task={item} compact />
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
              <EntryRow key={`${e.id}:${e.kind}:${e.start ?? e.date ?? e.due}`} entry={e} past={!isOpen(e, now) && !e.done} />
            ))}
            {todayInfo.deadlines.length > 0 && <h3>Due today</h3>}
            {todayInfo.deadlines.map((e) => (
              <EntryRow key={`${e.id}:${e.kind}:${e.start ?? e.date ?? e.due}`} entry={e} />
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
                    <EntryRow key={`${e.id}:${e.kind}:${e.start ?? e.date ?? e.due}`} entry={e} />
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
            {open.isSuccess && waitingItems.length === 0 && <p className={styles.empty}>Everything has a date.</p>}
            {waitingItems.map((item) => (
              <TaskRow key={item.id} task={item} compact />
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

function WeekStrip({ week, today }: { week: Day[]; today: string }) {
  return (
    <div className={styles.week} aria-label="This week">
      {week.map((d) => {
        const blocks = d.schedule.length;
        const due = d.deadlines.filter((e) => !e.done).length;
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
    </div>
  );
}
