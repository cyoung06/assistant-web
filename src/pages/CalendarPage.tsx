import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { Draggable } from "@fullcalendar/interaction";
import type { EventContentArg, EventDropArg } from "@fullcalendar/core";
import type { EventResizeDoneArg, DropArg } from "@fullcalendar/interaction";
import { useQueryClient } from "@tanstack/react-query";
import { api, unwrap, type AgendaEntry } from "../api/client";
import { TASK_VIEW_HIDDEN, useAgenda, useCalendars, useEventMutations, useTaskMutations, useTasks } from "../api/queries";
import { usePanel } from "../components/panel";
import { TagDot } from "../components/TagPicker";
import { dueLabel } from "../components/TaskRow";
import { changeForPlacement, sessionForDrop, toEvent } from "../lib/calendarMapping";
import { addDays, formatTime, toDateString } from "../lib/dates";
import styles from "./CalendarPage.module.css";
import "../styles/calendar.css";

/**
 * Events, work sessions and deadlines on one grid. Your own one-off events and deadlines can be
 * dragged; items from a source (PLMS, holidays) and repeating events are fixed here.
 */
export function CalendarPage() {
  const [range, setRange] = useState({ from: "", to: "" });
  const [hidden, setHidden] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const calendars = useCalendars().data ?? [];
  const agenda = useAgenda(range.from, range.to, hidden);
  const events = useMemo(() => (range.from ? (agenda.data ?? []) : []).map(toEvent), [agenda.data, range.from]);
  const { openTask } = usePanel();
  const { patch } = useTaskMutations();
  const { create } = useEventMutations();
  const qc = useQueryClient();

  const onMove = async (info: EventDropArg | EventResizeDoneArg) => {
    const entry = info.event.extendedProps.entry as AgendaEntry;
    const change = changeForPlacement(entry, { start: info.event.start!, end: info.event.end, allDay: info.event.allDay });
    try {
      if (change.kind === "due") {
        await patch.mutateAsync({ id: change.id, patch: { due: change.due } });
      } else {
        unwrap(await api.PATCH("/api/v1/events/{id}", { params: { path: { id: change.id } }, body: change.move }));
        await qc.invalidateQueries({ queryKey: ["agenda"] });
      }
    } catch {
      info.revert();
    }
  };

  // Dropping a task from the sidebar plans a work session for it at that slot.
  const onDrop = (info: DropArg) => {
    const { taskId, title } = info.draggedEl.dataset;
    if (taskId) create.mutate({ taskId, title: title ?? "", ...sessionForDrop(info.date, info.allDay) });
  };

  return (
    <div className={styles.page}>
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.open : ""}`}>
        <section className={styles.section}>
          <h2 className="label">Calendars</h2>
          {calendars.map((c) => (
            <label key={c.id} className={styles.toggle}>
              <input
                className="checkbox"
                type="checkbox"
                checked={!hidden.includes(c.name)}
                onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((n) => n !== c.name) : [...h, c.name]))}
              />
              <TagDot color={c.color} />
              {c.name}
            </label>
          ))}
        </section>
        <ToSchedule />
      </aside>

      <div className={styles.main}>
        <button className={`btn ${styles.sidebarToggle}`} onClick={() => setSidebarOpen((o) => !o)}>
          {sidebarOpen ? "Hide panel" : "Calendars & to schedule"}
        </button>
        <FullCalendar
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          firstDay={0}
          headerToolbar={{ left: "prev,next today", center: "title", right: "timeGridWeek,dayGridMonth" }}
          buttonText={{ today: "Today", week: "Week", month: "Month" }}
          height="100%"
          nowIndicator
          editable
          droppable
          scrollTime="08:00:00"
          slotMinTime="06:00:00"
          slotEventOverlap={false}
          slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          dayMaxEvents
          events={events}
          // The agenda takes inclusive dates; FullCalendar's end is exclusive.
          datesSet={(arg) => setRange({ from: toDateString(arg.start), to: addDays(toDateString(arg.end), -1) })}
          eventClick={(arg) => {
            const entry = arg.event.extendedProps.entry as AgendaEntry;
            const taskId = entry.kind === "deadline" || entry.kind === "allDayDeadline" ? entry.id : entry.taskId;
            if (taskId) openTask(taskId);
          }}
          eventDrop={onMove}
          eventResize={onMove}
          drop={onDrop}
          eventContent={renderEntry}
        />
      </div>
    </div>
  );
}

function renderEntry(arg: EventContentArg) {
  const entry = arg.event.extendedProps.entry as AgendaEntry;
  const isDeadline = entry.kind === "deadline" || entry.kind === "allDayDeadline";
  const time = entry.kind === "deadline" ? formatTime(entry.due!) : entry.kind === "block" ? arg.timeText : "";
  return (
    <div className="entry" title={`${isDeadline ? "Due: " : ""}${arg.event.title} · ${entry.calendarName}`}>
      {isDeadline && <span className="entry-flag">Due</span>}
      {(entry.repeats || time) && (
        <span className="entry-time">
          {entry.repeats && <span title="Repeats">↻ </span>}
          {time}
        </span>
      )}
      <span className="entry-title">{arg.event.title}</span>
    </div>
  );
}

/** Open top-level tasks; drag one onto the calendar to plan time for it. */
function ToSchedule() {
  const ref = useRef<HTMLDivElement>(null);
  const tasks = useTasks({ status: "open", hide: TASK_VIEW_HIDDEN });
  const list = (tasks.data ?? []).filter((t) => !t.parentId);

  useEffect(() => {
    if (!ref.current) return;
    const draggable = new Draggable(ref.current, {
      itemSelector: "[data-task-id]",
      // `create: false`: the drop handler saves the session; the refetch draws it.
      eventData: (el) => ({ title: el.dataset.title, create: false, duration: "01:00" }),
    });
    return () => draggable.destroy();
  }, []);

  return (
    <section className={styles.section}>
      <h2 className="label">To schedule</h2>
      <p className={styles.hint}>Drag a task onto the calendar to plan a work session.</p>
      <div ref={ref} className={styles.drag}>
        {tasks.isSuccess && list.length === 0 && <p className={styles.hint}>Nothing open.</p>}
        {list.map((t) => (
          <div key={t.id} className={styles.dragItem} data-task-id={t.id} data-title={t.title}>
            <TagDot color={t.color} />
            <span className={styles.dragTitle}>{t.title || "Untitled"}</span>
            <span className={styles.dragMeta}>{[dueLabel(t), ...t.categories].filter(Boolean).join(" · ")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
