import type { CalendarEntry } from "../api/client";
import { useItemMutations } from "../api/queries";
import { formatTime } from "../lib/dates";
import { usePanel } from "./panel";
import styles from "./EntryRow.module.css";

/** When a calendar entry happens, as a short label for lists. */
function timeLabel(e: CalendarEntry): string {
  switch (e.kind) {
    case "block":
      return `${formatTime(e.start!)}–${formatTime(e.end!)}`;
    case "deadline":
      return formatTime(e.due!);
    case "allDayBlock":
      // Lists group entries under a day heading, so the span itself isn't needed here.
      return "All day";
    case "allDayDeadline":
      return "Today";
  }
}

/** One calendar entry in a list: done checkbox, color, time, title. Click opens the item. */
export function EntryRow({ entry, past }: { entry: CalendarEntry; past?: boolean }) {
  const { openItem } = usePanel();
  const { patch } = useItemMutations();
  const deadline = entry.kind === "deadline" || entry.kind === "allDayDeadline";

  return (
    <div className={`${styles.row} ${entry.done ? styles.done : ""} ${past ? styles.past : ""}`}>
      <input
        className="checkbox"
        type="checkbox"
        checked={entry.done}
        aria-label={entry.done ? "Mark not done" : "Mark done"}
        onChange={(e) =>
          patch.mutate({ id: entry.itemId, patch: { doneAt: e.target.checked ? new Date().toISOString() : null } })
        }
      />
      <button className={styles.main} onClick={() => openItem(entry.itemId)}>
        <span className={styles.bar} style={{ background: entry.color ?? "var(--text-3)" }} aria-hidden />
        <span className={styles.time}>{deadline && entry.kind === "allDayDeadline" ? "" : timeLabel(entry)}</span>
        <span className={styles.title}>{entry.title || "Untitled"}</span>
        {deadline && <span className={`${styles.badge} ${entry.overdue ? styles.badgeLate : ""}`}>Due</span>}
        {entry.session && <span className={styles.session}>work</span>}
        {entry.seriesId && !entry.session && <span className={styles.session} title="Repeats">↻</span>}
      </button>
    </div>
  );
}
