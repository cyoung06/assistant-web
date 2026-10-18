import { WEEKDAYS, weekdayOf, type RepeatRule, type Weekday } from "../lib/repeat";
import styles from "./RepeatEditor.module.css";

type End = "never" | "until" | "count";

interface Props {
  value: RepeatRule | null;
  /** The first occurrence's date, used for the default weekday and end date. */
  startDate: string;
  onChange: (rule: RepeatRule | null) => void;
}

/** Picks how an event repeats. A null value means it doesn't. */
export function RepeatEditor({ value, startDate, onChange }: Props) {
  const end: End = value?.until ? "until" : value?.count ? "count" : "never";

  const setFreq = (freq: string) => {
    if (freq === "none") return onChange(null);
    const f = freq as RepeatRule["freq"];
    onChange({
      freq: f,
      interval: value?.interval ?? 1,
      weekdays: f === "weekly" ? (value?.weekdays?.length ? value.weekdays : [weekdayOf(startDate)]) : [],
      until: value?.until ?? null,
      count: value?.count ?? null,
    });
  };

  const toggleDay = (day: Weekday) => {
    if (!value) return;
    const days = value.weekdays ?? [];
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    // The first occurrence's weekday always stays on.
    onChange({ ...value, weekdays: next.length ? next : [weekdayOf(startDate)] });
  };

  const setEnd = (kind: End) => {
    if (!value) return;
    onChange({
      ...value,
      until: kind === "until" ? (value.until ?? startDate) : null,
      count: kind === "count" ? (value.count ?? 10) : null,
    });
  };

  return (
    <div className={styles.editor}>
      <div className={styles.line}>
        <select id="repeat-freq" className="input" value={value?.freq ?? "none"} onChange={(e) => setFreq(e.target.value)} aria-label="Repeat">
          <option value="none">Doesn't repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        {value && (
          <label className={styles.every}>
            every
            <input
              id="repeat-interval"
              className="input"
              type="number"
              min={1}
              max={99}
              value={value.interval ?? 1}
              onChange={(e) => onChange({ ...value, interval: Math.min(99, Math.max(1, Number(e.target.value) || 1)) })}
            />
            {value.freq === "daily" ? "days" : value.freq === "weekly" ? "weeks" : "months"}
          </label>
        )}
      </div>

      {value?.freq === "weekly" && (
        <div className={styles.days} role="group" aria-label="Repeat on">
          {WEEKDAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              aria-pressed={value.weekdays?.includes(d.value) ?? false}
              className={value.weekdays?.includes(d.value) ? styles.on : ""}
              onClick={() => toggleDay(d.value)}
            >
              {d.short}
            </button>
          ))}
        </div>
      )}

      {value && (
        <div className={styles.line}>
          <select id="repeat-end" className="input" value={end} onChange={(e) => setEnd(e.target.value as End)} aria-label="Ends">
            <option value="never">Never ends</option>
            <option value="until">Until</option>
            <option value="count">Number of times</option>
          </select>
          {end === "until" && (
            <input
              id="repeat-until"
              className="input"
              type="date"
              min={startDate}
              value={value.until ?? ""}
              onChange={(e) => e.target.value && onChange({ ...value, until: e.target.value })}
            />
          )}
          {end === "count" && (
            <input
              id="repeat-count"
              className="input"
              type="number"
              min={1}
              max={1000}
              value={value.count ?? 10}
              onChange={(e) => onChange({ ...value, count: Math.min(1000, Math.max(1, Number(e.target.value) || 1)) })}
            />
          )}
        </div>
      )}
    </div>
  );
}
