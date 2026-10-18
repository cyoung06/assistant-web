import { useEffect, useState } from "react";
import type { At, By, ItemPatch, Tag } from "../api/client";
import { toDateString, toLocalInput, shortTime } from "../lib/dates";
import { TagPicker } from "./TagPicker";
import styles from "./ItemForm.module.css";

export interface ItemValues {
  title: string;
  notes: string;
  by: By | null;
  at: At | null;
  tagIds: string[];
  mainTagId: string | null;
}

interface Props {
  value: ItemValues;
  tags: Tag[];
  /** Called with only the fields that changed. Text fields report on blur. */
  onChange: (patch: ItemPatch) => void;
  autoFocusTitle?: boolean;
}

/** The editable fields of an item. Used for both new drafts and existing items. */
export function ItemForm({ value, tags, onChange, autoFocusTitle }: Props) {
  return (
    <div className={styles.form}>
      <CommitInput
        className={styles.title}
        value={value.title}
        placeholder="Title"
        autoFocus={autoFocusTitle}
        onCommit={(title) => onChange({ title })}
      />

      <section className={styles.row}>
        <span className="label">Due</span>
        <ByField value={value.by} onChange={(by) => onChange({ by })} />
      </section>

      <section className={styles.row}>
        <span className="label">Scheduled</span>
        <AtField value={value.at} onChange={(at) => onChange({ at })} />
      </section>

      <section className={styles.row}>
        <span className="label">Tags</span>
        <TagPicker
          tags={tags}
          selected={value.tagIds}
          mainTagId={value.mainTagId}
          onChange={(tagIds, mainTagId) => onChange({ tagIds, mainTagId })}
        />
      </section>

      <section className={styles.row}>
        <span className="label">Notes</span>
        <CommitInput multiline value={value.notes} placeholder="Notes" onCommit={(notes) => onChange({ notes })} />
      </section>
    </div>
  );
}

function ByField({ value, onChange }: { value: By | null; onChange: (by: By | null) => void }) {
  if (!value) {
    return (
      <div className={styles.inline}>
        <button className="btn" type="button" onClick={() => onChange({ date: toDateString(new Date()) })}>
          Add deadline
        </button>
      </div>
    );
  }
  return (
    <div className={styles.inline}>
      <input
        className="input"
        type="date"
        aria-label="Due date"
        value={value.date}
        onChange={(e) => e.target.value && onChange({ ...value, date: e.target.value })}
      />
      <input
        className="input"
        type="time"
        aria-label="Due time"
        value={value.time ? shortTime(value.time) : ""}
        onChange={(e) => onChange({ date: value.date, time: e.target.value || null })}
      />
      <button className="btn btn-ghost" type="button" onClick={() => onChange(null)} aria-label="Remove deadline">
        Clear
      </button>
    </div>
  );
}

function AtField({ value, onChange }: { value: At | null; onChange: (at: At | null) => void }) {
  if (!value) {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    return (
      <div className={styles.inline}>
        <button
          className="btn"
          type="button"
          onClick={() =>
            onChange({
              allDay: false,
              start: start.toISOString(),
              end: new Date(start.getTime() + 3_600_000).toISOString(),
            })
          }
        >
          Add time
        </button>
      </div>
    );
  }

  const toggleAllDay = (allDay: boolean) => {
    if (allDay) {
      const day = value.start ? toDateString(new Date(value.start)) : toDateString(new Date());
      onChange({ allDay: true, startDate: day, endDate: day });
    } else {
      const start = new Date(`${value.startDate ?? toDateString(new Date())}T09:00`);
      onChange({ allDay: false, start: start.toISOString(), end: new Date(start.getTime() + 3_600_000).toISOString() });
    }
  };

  return (
    <div className={styles.stack}>
      <label className={styles.check}>
        <input
          className="checkbox"
          type="checkbox"
          checked={value.allDay}
          onChange={(e) => toggleAllDay(e.target.checked)}
        />
        All day
      </label>
      {value.allDay ? (
        <div className={styles.inline}>
          <input
            className="input"
            type="date"
            aria-label="Start date"
            value={value.startDate ?? ""}
            onChange={(e) => {
              const startDate = e.target.value;
              if (!startDate) return;
              const endDate = value.endDate && value.endDate >= startDate ? value.endDate : startDate;
              onChange({ allDay: true, startDate, endDate });
            }}
          />
          <span className={styles.dash}>–</span>
          <input
            className="input"
            type="date"
            aria-label="End date"
            min={value.startDate ?? undefined}
            value={value.endDate ?? ""}
            onChange={(e) => e.target.value && onChange({ ...value, endDate: e.target.value })}
          />
        </div>
      ) : (
        <div className={styles.inline}>
          <input
            className="input"
            type="datetime-local"
            aria-label="Start"
            value={value.start ? toLocalInput(value.start) : ""}
            onChange={(e) => {
              if (!e.target.value || !value.start || !value.end) return;
              // Moving the start keeps the duration.
              const start = new Date(e.target.value);
              const duration = new Date(value.end).getTime() - new Date(value.start).getTime();
              onChange({ allDay: false, start: start.toISOString(), end: new Date(start.getTime() + duration).toISOString() });
            }}
          />
          <span className={styles.dash}>–</span>
          <input
            className="input"
            type="datetime-local"
            aria-label="End"
            value={value.end ? toLocalInput(value.end) : ""}
            onChange={(e) => {
              if (!e.target.value || !value.start) return;
              const end = new Date(e.target.value);
              if (end > new Date(value.start)) onChange({ ...value, end: end.toISOString() });
            }}
          />
        </div>
      )}
      <div>
        <button className="btn btn-ghost" type="button" onClick={() => onChange(null)}>
          Clear
        </button>
      </div>
    </div>
  );
}

interface CommitInputProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/** A text field that reports its value on blur (and on Enter for single-line fields). */
function CommitInput({ value, onCommit, placeholder, multiline, autoFocus, className }: CommitInputProps) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  const shared = {
    className: `input ${className ?? ""}`,
    value: text,
    placeholder,
    autoFocus,
    onBlur: commit,
  };
  return multiline ? (
    <textarea {...shared} onChange={(e) => setText(e.target.value)} />
  ) : (
    <input
      {...shared}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}
