import { useState } from "react";
import type { Calendar } from "../api/client";
import { useCalendarMutations, useCalendars } from "../api/queries";
import styles from "./CalendarsDialog.module.css";

const PALETTE = ["#2F5BE0", "#E0642F", "#1F8A4C", "#A23FD1", "#D13B6E", "#0E8C9C", "#B88A00", "#7A5230", "#5B6CFF", "#C2410C", "#4D7C0F", "#BE185D"];

/** Calendars (CalDAV collections): one per course or area, each with a color every app shows. */
export function CalendarsDialog({ onClose }: { onClose: () => void }) {
  const calendars = useCalendars().data ?? [];
  const { create } = useCalendarMutations();
  const used = (c: string) => calendars.filter((x) => x.color?.toUpperCase() === c).length;
  const [name, setName] = useState("");
  const [color, setColor] = useState(() => [...PALETTE].sort((a, b) => used(a) - used(b))[0]!);

  const add = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim(), color });
    setName("");
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} role="dialog" aria-label="Calendars" onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <h2>Calendars</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <p className={styles.hint}>
          Each calendar shows up with its color in Calendar, Reminders and Tasks.org. Use categories on a task for anything else, like
          “assignment” or “class”.
        </p>
        <ul className={styles.list}>
          {calendars.map((c) => (
            <CalendarRow key={c.id} calendar={c} />
          ))}
        </ul>
        <form
          className={styles.add}
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input id="new-calendar-color" className={styles.color} type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Color" />
          <input id="new-calendar-name" className="input" placeholder="New calendar, e.g. CSED123" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary" disabled={!name.trim() || create.isPending}>
            Add
          </button>
        </form>
        {create.error && <p className={styles.error}>{create.error.message}</p>}
      </div>
    </div>
  );
}

function CalendarRow({ calendar: c }: { calendar: Calendar }) {
  const { update, remove } = useCalendarMutations();
  const [name, setName] = useState(c.name);
  const [confirming, setConfirming] = useState(false);
  const error = update.error ?? remove.error;

  return (
    <li className={styles.row}>
      <input
        className={styles.color}
        type="color"
        value={c.color ?? "#6B7280"}
        aria-label={`Color of ${c.name}`}
        onChange={(e) => update.mutate({ id: c.id, color: e.target.value })}
      />
      <input
        className="input"
        value={name}
        aria-label="Calendar name"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== c.name && update.mutate({ id: c.id, name: name.trim() })}
      />
      <span className={styles.count}>{c.openTasks} open</span>
      {confirming ? (
        <>
          <button className="btn btn-danger" onClick={() => remove.mutate(c.id, { onSettled: () => setConfirming(false) })}>
            Delete
          </button>
          <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
            Keep
          </button>
        </>
      ) : (
        <button className="btn btn-ghost" onClick={() => setConfirming(true)} aria-label={`Delete ${c.name}`}>
          Delete
        </button>
      )}
      {error && <span className={styles.error}>{error.message}</span>}
    </li>
  );
}
