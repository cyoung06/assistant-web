import type { Task } from "../api/client";
import { useTaskMutations } from "../api/queries";
import { formatDay, shortTime } from "../lib/dates";
import { usePanel } from "./panel";
import { TagDot } from "./TagPicker";
import styles from "./TaskRow.module.css";

export function dueLabel(t: Task): string | null {
  return t.due ? `due ${formatDay(t.due.date)}${t.due.time ? ` ${shortTime(t.due.time)}` : ""}` : null;
}

/** One task in a list: done checkbox, calendar color, title, due date, calendar and categories. */
export function TaskRow({ task, compact, showCalendar = true }: { task: Task; compact?: boolean; showCalendar?: boolean }) {
  const { openTask } = usePanel();
  const { patch } = useTaskMutations();

  return (
    <div className={`${styles.row} ${compact ? styles.compact : ""} ${task.done ? styles.done : ""}`}>
      <input
        className="checkbox"
        type="checkbox"
        checked={task.done}
        aria-label={task.done ? "Mark not done" : "Mark done"}
        onChange={(e) => patch.mutate({ id: task.id, patch: { done: e.target.checked } })}
      />
      <button className={styles.main} onClick={() => openTask(task.id)}>
        <TagDot color={task.color} />
        <span className={styles.title}>{task.title || "Untitled"}</span>
        <span className={styles.meta}>
          {dueLabel(task) && <span>{dueLabel(task)}</span>}
          {task.overdue && <span className={styles.overdue}>Overdue</span>}
          {showCalendar && <span>{task.calendarName}</span>}
          {task.categories.map((c) => (
            <span key={c} className={styles.category}>
              {c}
            </span>
          ))}
          {task.subtasks > 0 && (
            <span>
              {task.subtasksDone}/{task.subtasks}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
