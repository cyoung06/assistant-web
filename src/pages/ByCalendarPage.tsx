import { useState } from "react";
import { TASK_VIEW_HIDDEN, useCalendars, useTasks } from "../api/queries";
import { TagDot } from "../components/TagPicker";
import { TaskRow } from "../components/TaskRow";
import { sortTasks } from "../lib/items";
import styles from "./ByCalendarPage.module.css";

/** A column per calendar (course or area) with its open tasks, soonest deadline first. */
export function ByCalendarPage() {
  const [showDone, setShowDone] = useState(false);
  const calendars = (useCalendars().data ?? []).filter((c) => !TASK_VIEW_HIDDEN.includes(c.name.toLowerCase()));
  const tasks = useTasks({ status: showDone ? "all" : "open", hide: TASK_VIEW_HIDDEN });
  const all = sortTasks((tasks.data ?? []).filter((t) => !t.parentId), "due", true);
  const columns = calendars
    .map((c) => ({ ...c, tasks: all.filter((t) => t.calendarId === c.id) }))
    // Empty calendars go last so the columns with work come first.
    .sort((a, b) => Number(b.tasks.length > 0) - Number(a.tasks.length > 0));

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <label className={styles.check}>
          <input id="by-calendar-done" className="checkbox" type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Show done
        </label>
        {tasks.isPending && <span className={styles.note}>Loading…</span>}
        {tasks.error && <span className={styles.note}>{tasks.error.message}</span>}
      </div>
      <div className={styles.columns}>
        {columns.map((c) => (
          <section key={c.id} className={styles.column}>
            <h2>
              <TagDot color={c.color} />
              {c.name}
              <span className={styles.count}>{c.tasks.length}</span>
            </h2>
            <div className={styles.list}>
              {c.tasks.length === 0 && <p className={styles.note}>Nothing here.</p>}
              {c.tasks.map((t) => (
                <TaskRow key={t.id} task={t} compact showCalendar={false} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
