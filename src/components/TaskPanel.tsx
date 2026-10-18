import { useEffect, useState } from "react";
import type { CreateTask, Due, Task, TaskPatch } from "../api/client";
import { useCalendars, useEventMutations, useTask, useTaskMutations, useTasks } from "../api/queries";
import { formatDuration, shortTime } from "../lib/dates";
import { usePanel, type PanelTarget } from "./panel";
import { TaskRow } from "./TaskRow";
import styles from "./TaskPanel.module.css";

export function TaskPanel({ target }: { target: PanelTarget }) {
  const { close } = usePanel();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  if (!target) return null;
  return (
    <aside className={styles.panel} aria-label="Task details">
      <button className={`btn btn-ghost ${styles.close}`} onClick={close} aria-label="Close">
        ✕
      </button>
      {target.kind === "task" ? <ExistingTask id={target.id} /> : <NewTask key={JSON.stringify(target.draft)} draft={target.draft} />}
    </aside>
  );
}

interface Values {
  title: string;
  notes: string;
  due: Due | null;
  calendarId: string | null;
  categories: string[];
}

/** The fields of a task. Text fields report on blur; the rest right away. */
function TaskForm({ value, onChange, autoFocus }: { value: Values; onChange: (patch: Partial<Values>) => void; autoFocus?: boolean }) {
  const calendars = useCalendars().data ?? [];
  return (
    <div className={styles.form}>
      <CommitInput className={styles.titleInput} value={value.title} placeholder="Title" autoFocus={autoFocus} onCommit={(title) => onChange({ title })} />

      <section className={styles.field}>
        <span className="label">Due</span>
        {value.due ? (
          <div className={styles.inline}>
            <input
              id="task-due-date"
              className="input"
              type="date"
              value={value.due.date}
              onChange={(e) => e.target.value && onChange({ due: { ...value.due!, date: e.target.value } })}
              aria-label="Due date"
            />
            <input
              id="task-due-time"
              className="input"
              type="time"
              value={value.due.time ? shortTime(value.due.time) : ""}
              onChange={(e) => onChange({ due: { date: value.due!.date, time: e.target.value || null } })}
              aria-label="Due time"
            />
            <button className="btn btn-ghost" type="button" onClick={() => onChange({ due: null })}>
              Clear
            </button>
          </div>
        ) : (
          <div>
            <button className="btn" type="button" onClick={() => onChange({ due: { date: new Date().toLocaleDateString("sv-SE") } })}>
              Add deadline
            </button>
          </div>
        )}
      </section>

      <section className={styles.field}>
        <span className="label">Calendar</span>
        <select
          id="task-calendar"
          className="input"
          value={value.calendarId ?? ""}
          onChange={(e) => onChange({ calendarId: e.target.value || null })}
          aria-label="Calendar"
        >
          {!value.calendarId && <option value="">Inbox</option>}
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </section>

      <section className={styles.field}>
        <span className="label">Categories</span>
        <CategoryInput value={value.categories} onChange={(categories) => onChange({ categories })} />
      </section>

      <section className={styles.field}>
        <span className="label">Notes</span>
        <CommitInput multiline value={value.notes} placeholder="Notes" onCommit={(notes) => onChange({ notes })} />
      </section>
    </div>
  );
}

function NewTask({ draft }: { draft: CreateTask }) {
  const { openTask } = usePanel();
  const { create } = useTaskMutations();
  const [values, setValues] = useState<Values>({
    title: draft.title,
    notes: draft.notes ?? "",
    due: draft.due ?? null,
    calendarId: draft.calendarId ?? null,
    categories: draft.categories ?? [],
  });

  const save = async () => {
    const task = await create.mutateAsync({
      title: values.title,
      notes: values.notes,
      due: values.due,
      calendarId: values.calendarId,
      categories: values.categories,
      parentId: draft.parentId,
    });
    openTask(task.id);
  };

  return (
    <div className={styles.body}>
      <p className="label">{draft.parentId ? "New sub-task" : "New task"}</p>
      <TaskForm value={values} autoFocus onChange={(patch) => setValues((v) => ({ ...v, ...patch }))} />
      {create.error && <p className={styles.error}>{create.error.message}</p>}
      <div className={styles.actions}>
        <button className="btn btn-primary" onClick={save} disabled={!values.title.trim() || create.isPending}>
          Create
        </button>
      </div>
    </div>
  );
}

function ExistingTask({ id }: { id: string }) {
  const { openTask, close } = usePanel();
  const task = useTask(id);
  const subtasks = useTasks({ status: "all", parentId: id });
  const { patch, create, remove } = useTaskMutations();
  const events = useEventMutations();
  const [newSub, setNewSub] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (task.isPending) return <div className={styles.body}>Loading…</div>;
  if (task.error) return <div className={styles.body}>{task.error.message}</div>;
  const t: Task = task.data;

  const save = (change: Partial<Values> | TaskPatch) => patch.mutate({ id, patch: change as TaskPatch });

  const addSub = async () => {
    const title = newSub.trim();
    if (!title) return;
    await create.mutateAsync({ title, parentId: id });
    setNewSub("");
  };

  const scheduleSession = () => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    events.create.mutate({ taskId: id, title: t.title, start: start.toISOString(), end: new Date(start.getTime() + 3_600_000).toISOString() });
  };

  return (
    <div className={styles.body}>
      <label className={styles.done}>
        <input className="checkbox" type="checkbox" checked={t.done} onChange={(e) => save({ done: e.target.checked })} />
        {t.done ? "Done" : "Mark done"}
        {t.overdue && <span className={styles.overdue}>Overdue</span>}
        {t.source && <span className={styles.source}>from {t.source.toUpperCase()}</span>}
      </label>

      {patch.error && <p className={styles.error}>{patch.error.message}</p>}

      {t.parentId && (
        <button className={styles.link} onClick={() => openTask(t.parentId!)}>
          ↑ Part of a larger task
        </button>
      )}

      <TaskForm key={`${t.id}:${t.etag}`} value={{ title: t.title, notes: t.notes, due: t.due ?? null, calendarId: t.calendarId, categories: t.categories }} onChange={save} />

      {t.url && (
        <a className={styles.link} href={t.url} target="_blank" rel="noreferrer">
          Open in {t.source?.toUpperCase() ?? "source"}
        </a>
      )}

      <section className={styles.children}>
        <div className={styles.childrenHead}>
          <span className="label">Sub-tasks</span>
          {(t.minutesSpent > 0 || t.minutesPlanned > 0) && (
            <span className={styles.time}>
              {formatDuration(t.minutesSpent)} spent · {formatDuration(t.minutesPlanned)} planned
            </span>
          )}
        </div>
        {(subtasks.data ?? []).map((s) => (
          <TaskRow key={s.id} task={s} compact showCalendar={false} />
        ))}
        <div className={styles.addChild}>
          <input
            id="new-subtask"
            className="input"
            placeholder="Add a sub-task"
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSub()}
          />
          <button className="btn" onClick={scheduleSession} title="Adds a one-hour work session to your calendar; move it in your calendar app">
            Schedule work
          </button>
        </div>
        {events.create.isSuccess && <p className={styles.hint}>Work session added for the next hour. Move it in your calendar app.</p>}
      </section>

      <div className={styles.actions}>
        {confirmDelete ? (
          <>
            <span className={styles.hint}>Delete with its sub-tasks and work sessions?</span>
            <button
              className="btn btn-danger"
              onClick={async () => {
                await remove.mutateAsync(id);
                close();
              }}
            >
              Delete
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
          </>
        ) : (
          <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/** Categories as removable chips plus a field to add one (Enter or comma). */
function CategoryInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])]);
    setText("");
  };
  return (
    <div className={styles.chips}>
      {value.map((c) => (
        <span key={c} className={styles.chip}>
          {c}
          <button type="button" aria-label={`Remove ${c}`} onClick={() => onChange(value.filter((x) => x !== c))}>
            ×
          </button>
        </span>
      ))}
      <input
        id="task-category"
        className={styles.chipInput}
        value={text}
        placeholder="Add category"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
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
  const shared = { className: `input ${className ?? ""}`, value: text, placeholder, autoFocus, onBlur: commit };
  return multiline ? (
    <textarea {...shared} onChange={(e) => setText(e.target.value)} />
  ) : (
    <input {...shared} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
  );
}
