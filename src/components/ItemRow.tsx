import type { Item } from "../api/client";
import { useItemMutations } from "../api/queries";
import { formatDay, formatTime, shortTime } from "../lib/dates";
import { usePanel } from "./panel";
import { TagDot } from "./TagPicker";
import styles from "./ItemRow.module.css";

/** When an item is due or scheduled, in a few words. */
export function whenLabel(item: Item): string[] {
  const parts: string[] = [];
  if (item.at) {
    parts.push(
      item.at.allDay
        ? item.at.startDate === item.at.endDate
          ? formatDay(item.at.startDate!)
          : `${formatDay(item.at.startDate!)} – ${formatDay(item.at.endDate!)}`
        : `${formatDay(new Date(item.at.start!))} ${formatTime(item.at.start!)}–${formatTime(item.at.end!)}`,
    );
  }
  if (item.by) parts.push(`due ${formatDay(item.by.date)}${item.by.time ? ` ${shortTime(item.by.time)}` : ""}`);
  return parts;
}

export function ItemRow({ item, compact }: { item: Item; compact?: boolean }) {
  const { openItem } = usePanel();
  const { patch } = useItemMutations();
  const done = item.doneAt != null;

  return (
    <div className={`${styles.row} ${compact ? styles.compact : ""} ${done ? styles.done : ""}`}>
      <input
        className="checkbox"
        type="checkbox"
        checked={done}
        aria-label={done ? "Mark not done" : "Mark done"}
        onChange={(e) =>
          patch.mutate({ id: item.id, patch: { doneAt: e.target.checked ? new Date().toISOString() : null }, version: item.version })
        }
      />
      <button className={styles.main} onClick={() => openItem(item.id)}>
        <TagDot color={item.derived.color} />
        <span className={styles.title}>{item.derived.displayTitle || "Untitled"}</span>
        <span className={styles.meta}>
          {whenLabel(item).map((label) => (
            <span key={label}>{label}</span>
          ))}
          {item.derived.overdue && <span className={styles.overdue}>Overdue</span>}
        </span>
      </button>
    </div>
  );
}
