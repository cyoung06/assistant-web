import { useState } from "react";
import type { Task } from "../api/client";
import { TASK_VIEW_HIDDEN, useCalendars, useTaskMutations, useTasks, type TaskFilter } from "../api/queries";
import { usePanel } from "../components/panel";
import { TagDot } from "../components/TagPicker";
import { formatDay, formatDuration, shortTime } from "../lib/dates";
import { sortTasks, type SortField } from "../lib/items";
import styles from "./TasksPage.module.css";

type Status = "open" | "done" | "all";

const COLUMNS: { field: SortField | null; label: string; className?: string }[] = [
  { field: null, label: "" },
  { field: "title", label: "Title" },
  { field: "due", label: "Due" },
  { field: "calendar", label: "Calendar" },
  { field: null, label: "Categories", className: "tags" },
  { field: "sub", label: "Sub-tasks", className: "num" },
  { field: "time", label: "Time", className: "num" },
];

/** Every task in one dense, sortable table. */
export function TasksPage() {
  const [status, setStatus] = useState<Status>("open");
  const [topLevel, setTopLevel] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [calendarId, setCalendarId] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ field: SortField; asc: boolean }>({ field: "due", asc: true });
  const calendars = useCalendars().data ?? [];
  const { openDraft } = usePanel();

  const filter: TaskFilter = {
    status,
    calendarId: calendarId || undefined,
    hide: showHidden ? undefined : TASK_VIEW_HIDDEN,
    q: query.trim() || undefined,
  };
  const tasks = useTasks(filter);
  const rows = sortTasks((tasks.data ?? []).filter((t) => !topLevel || !t.parentId), sort.field, sort.asc);

  const toggleSort = (field: SortField) => setSort((s) => (s.field === field ? { field, asc: !s.asc } : { field, asc: true }));

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.segment} role="radiogroup" aria-label="Status">
          {(["open", "done", "all"] as Status[]).map((s) => (
            <button key={s} role="radio" aria-checked={status === s} className={status === s ? styles.on : ""} onClick={() => setStatus(s)}>
              {s === "open" ? "Open" : s === "done" ? "Done" : "All"}
            </button>
          ))}
        </div>
        <label className={styles.check}>
          <input id="tasks-top-level" className="checkbox" type="checkbox" checked={topLevel} onChange={(e) => setTopLevel(e.target.checked)} />
          Top level only
        </label>
        <label className={styles.check}>
          <input id="tasks-hidden" className="checkbox" type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          Show classes &amp; holidays
        </label>
        <select id="tasks-calendar" className="input" value={calendarId} onChange={(e) => setCalendarId(e.target.value)} aria-label="Calendar">
          <option value="">All calendars</option>
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input id="tasks-search" className="input" type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className={styles.total}>{rows.length} tasks</span>
        <button className="btn btn-primary" onClick={() => openDraft({ title: "" })}>
          New task
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {COLUMNS.map((c, i) => (
                <th
                  key={i}
                  className={c.className ? styles[c.className] : undefined}
                  aria-sort={c.field && sort.field === c.field ? (sort.asc ? "ascending" : "descending") : undefined}
                >
                  {c.field ? (
                    <button onClick={() => toggleSort(c.field!)}>
                      {c.label}
                      {sort.field === c.field && <span aria-hidden> {sort.asc ? "↑" : "↓"}</span>}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <Row key={t.id} task={t} />
            ))}
          </tbody>
        </table>
        {tasks.isPending && <p className={styles.empty}>Loading…</p>}
        {tasks.error && <p className={styles.empty}>{tasks.error.message}</p>}
        {tasks.isSuccess && rows.length === 0 && <p className={styles.empty}>No tasks match. Add one with the bar above (⌘K).</p>}
      </div>
    </div>
  );
}

function Row({ task: t }: { task: Task }) {
  const { openTask } = usePanel();
  const { patch } = useTaskMutations();

  return (
    <tr className={t.done ? styles.done : ""} onClick={() => openTask(t.id)}>
      <td onClick={(e) => e.stopPropagation()}>
        <input
          className="checkbox"
          type="checkbox"
          checked={t.done}
          aria-label={t.done ? "Mark not done" : "Mark done"}
          onChange={(e) => patch.mutate({ id: t.id, patch: { done: e.target.checked } })}
        />
      </td>
      <td className={styles.title}>
        <TagDot color={t.color} />
        <span>{t.title || "Untitled"}</span>
        {t.parentId && (
          <span className={styles.subMark} title="Sub-task">
            ↳
          </span>
        )}
      </td>
      <td className={t.overdue ? styles.late : undefined}>{t.due ? `${formatDay(t.due.date)}${t.due.time ? ` ${shortTime(t.due.time)}` : ""}` : ""}</td>
      <td>{t.calendarName}</td>
      <td className={styles.tags}>
        {t.categories.map((c) => (
          <span key={c} className={styles.chip}>
            {c}
          </span>
        ))}
      </td>
      <td className={styles.num}>{t.subtasks ? `${t.subtasksDone}/${t.subtasks}` : ""}</td>
      <td className={styles.num}>
        {t.minutesSpent || t.minutesPlanned ? `${formatDuration(t.minutesSpent)} / ${formatDuration(t.minutesSpent + t.minutesPlanned)}` : ""}
      </td>
    </tr>
  );
}
