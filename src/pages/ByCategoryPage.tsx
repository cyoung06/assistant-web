import { useState } from "react";
import { TASK_VIEW_HIDDEN, useTasks } from "../api/queries";
import { TaskRow } from "../components/TaskRow";
import { sortTasks } from "../lib/items";
import styles from "./ByCategoryPage.module.css";

/** A column per category (courses, "assignment", …) with its tasks; tasks without one in the last column. */
export function ByCategoryPage() {
  const [showDone, setShowDone] = useState(false);
  const tasks = useTasks({ status: showDone ? "all" : "open", hide: TASK_VIEW_HIDDEN });
  const all = sortTasks((tasks.data ?? []).filter((t) => !t.parentId), "due", true);
  const names = [...new Set(all.flatMap((t) => t.categories))].sort((a, b) => a.localeCompare(b));
  const columns = [
    ...names.map((name) => ({ name, tasks: all.filter((t) => t.categories.includes(name)) })),
    { name: "No category", tasks: all.filter((t) => t.categories.length === 0) },
  ].filter((c) => c.tasks.length > 0);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <label className={styles.check}>
          <input id="by-category-done" className="checkbox" type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Show done
        </label>
        {tasks.isPending && <span className={styles.note}>Loading…</span>}
        {tasks.error && <span className={styles.note}>{tasks.error.message}</span>}
        {tasks.isSuccess && columns.length === 0 && <span className={styles.note}>No open tasks.</span>}
      </div>
      <div className={styles.columns}>
        {columns.map((c) => (
          <section key={c.name} className={styles.column}>
            <h2>
              {c.name}
              <span className={styles.count}>{c.tasks.length}</span>
            </h2>
            <div className={styles.list}>
              {c.tasks.map((t) => (
                <TaskRow key={t.id} task={t} compact />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
