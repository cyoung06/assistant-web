import type { AgendaEntry } from "../api/client";
import { useTaskMutations } from "../api/queries";
import { formatTime } from "../lib/dates";
import { usePanel } from "./panel";
import styles from "./EntryRow.module.css";

/** When an agenda entry happens, as a short label for lists under a day heading. */
function timeLabel(e: AgendaEntry): string {
  switch (e.kind) {
    case "block":
      return `${formatTime(e.start!)}–${formatTime(e.end!)}`;
    case "deadline":
      return formatTime(e.due!);
    case "allDayBlock":
      return "All day";
    case "allDayDeadline":
      return "";
  }
}

/**
 * One agenda entry: a deadline (with a done checkbox; opens its task) or an event. Events are edited
 * in calendar apps; a work session opens the task it belongs to.
 */
export function EntryRow({ entry, past }: { entry: AgendaEntry; past?: boolean }) {
  const { openTask } = usePanel();
  const { patch } = useTaskMutations();
  const deadline = entry.kind === "deadline" || entry.kind === "allDayDeadline";
  const taskId = deadline ? entry.id : entry.taskId;

  return (
    <div className={`${styles.row} ${entry.done ? styles.done : ""} ${past ? styles.past : ""}`}>
      {deadline ? (
        <input
          className="checkbox"
          type="checkbox"
          checked={entry.done}
          aria-label={entry.done ? "Mark not done" : "Mark done"}
          onChange={(e) => patch.mutate({ id: entry.id, patch: { done: e.target.checked } })}
        />
      ) : (
        <span className={styles.spacer} aria-hidden />
      )}
      <button className={styles.main} onClick={() => taskId && openTask(taskId)} disabled={!taskId}>
        <span className={styles.bar} style={{ background: entry.color ?? "var(--text-3)" }} aria-hidden />
        <span className={styles.time}>{timeLabel(entry)}</span>
        <span className={styles.title}>{entry.title || "Untitled"}</span>
        {deadline && <span className={`${styles.badge} ${entry.overdue ? styles.badgeLate : ""}`}>Due</span>}
        {entry.taskId && <span className={styles.session}>work</span>}
        {entry.repeats && !entry.taskId && (
          <span className={styles.session} title="Repeats">
            ↻
          </span>
        )}
      </button>
    </div>
  );
}
