import { useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction";
import type { DateSelectArg, EventClickArg, EventContentArg, EventDropArg } from "@fullcalendar/core";
import { addDays, shortTime, toDateString } from "../lib/dates";
import { useProjects, useTaskMutations, useTasks } from "../tasks/api";
import { useTasksUi } from "../tasks/context";
import { useEventMutations, useEvents } from "./api";
import { EventDialog, type EventTarget } from "./EventDialog";
import { changeForPlacement, toEvent, type CalItem } from "./mapping";
import styles from "./CalendarApp.module.css";
import "./fullcalendar.css";

/** The id that hides task deadlines, next to the calendar ids. */
export const DEADLINES = "deadlines";

/**
 * The Calendar sub-app: classes, meetings and holidays, plus the deadlines from Tasks. [hidden]
 * holds the calendars (and [DEADLINES]) switched off in the sidebar.
 */
export function CalendarApp({ hidden }: { hidden: string[] }) {
  const [range, setRange] = useState({ from: "", to: "" });
  const [dialog, setDialog] = useState<EventTarget | null>(null);
  const events = useEvents(range.from, range.to);
  const tasks = useTasks();
  const projects = useProjects().data ?? [];
  const { openTask } = useTasksUi();
  const taskMutations = useTaskMutations();
  const eventMutations = useEventMutations();

  const items = useMemo<CalItem[]>(() => {
    if (!range.from) return [];
    const projectColor = new Map(projects.map((p) => [p.id, p.color]));
    const shownEvents = (events.data ?? []).filter((e) => !hidden.includes(e.calendarId)).map((event) => ({ kind: "event" as const, event }));
    const deadlines = hidden.includes(DEADLINES)
      ? []
      : (tasks.data ?? [])
          .filter((t) => t.due && t.due.date >= range.from && t.due.date <= range.to && t.status !== "canceled")
          .map((task) => ({ kind: "deadline" as const, task, color: (task.projectId && projectColor.get(task.projectId)) || undefined }));
    return [...shownEvents, ...deadlines];
  }, [events.data, tasks.data, projects, hidden, range]);
  const shapes = useMemo(() => items.map(toEvent), [items]);

  const onMove = async (info: EventDropArg | EventResizeDoneArg) => {
    const item = info.event.extendedProps.item as CalItem;
    const change = changeForPlacement(item, { start: info.event.start!, end: info.event.end, allDay: info.event.allDay });
    try {
      if (change.kind === "due") await taskMutations.patch.mutateAsync({ id: change.id, patch: { due: change.due } });
      else await eventMutations.patch.mutateAsync({ id: change.id, patch: change.move });
    } catch {
      info.revert();
    }
  };

  const onSelect = (arg: DateSelectArg) => {
    arg.view.calendar.unselect();
    // A single click selects one 30-minute slot; make that a one-hour event.
    const end = !arg.allDay && arg.end.getTime() - arg.start.getTime() <= 30 * 60_000 ? new Date(arg.start.getTime() + 60 * 60_000) : arg.end;
    setDialog({ kind: "new", start: arg.start, end, allDay: arg.allDay });
  };

  const onClick = (arg: EventClickArg) => {
    const item = arg.event.extendedProps.item as CalItem;
    if (item.kind === "deadline") return openTask(item.task.id);
    setDialog({ kind: "edit", id: item.event.id, occurrence: item.event.startDate ?? toDateString(new Date(item.event.start!)) });
  };

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <div className={styles.bar}>
          <span className={styles.hint}>Click or drag on an empty slot to add an event. Click a class to change its weekly times or skip a date.</span>
          <button className="btn btn-primary" onClick={() => setDialog({ kind: "new", start: nextHour(), end: new Date(nextHour().getTime() + 3_600_000), allDay: false })}>
            New event
          </button>
        </div>
        <FullCalendar
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          firstDay={0}
          headerToolbar={{ left: "prev,next today", center: "title", right: "timeGridWeek,dayGridMonth" }}
          buttonText={{ today: "Today", week: "Week", month: "Month" }}
          height="100%"
          nowIndicator
          selectable
          selectMirror
          scrollTime="08:00:00"
          slotEventOverlap={false}
          slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          dayMaxEvents
          events={shapes}
          // The API takes inclusive dates; FullCalendar's end is exclusive.
          datesSet={(arg) => setRange({ from: toDateString(arg.start), to: addDays(toDateString(arg.end), -1) })}
          select={onSelect}
          eventClick={onClick}
          eventDrop={onMove}
          eventResize={onMove}
          eventContent={renderItem}
        />
      </div>

      {dialog && <EventDialog key={dialog.kind === "edit" ? dialog.id : "new"} target={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

function nextHour() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

function renderItem(arg: EventContentArg) {
  const item = arg.event.extendedProps.item as CalItem | undefined;
  // The selection preview while dragging over empty slots has no item: default look.
  if (!item) return undefined;
  if (item.kind === "deadline") {
    const t = item.task;
    const time = t.due?.time ? shortTime(t.due.time) : "";
    return (
      <div className="entry" title={`Due: #${t.number} ${t.title}`}>
        <span className="entry-flag">Due</span>
        {time && <span className="entry-time">{time}</span>}
        <span className="entry-title">{t.title}</span>
      </div>
    );
  }
  const e = item.event;
  return (
    <div className="entry" title={`${e.title} · ${e.calendarName}`}>
      {(e.repeats || arg.timeText) && (
        <span className="entry-time">
          {e.repeats && <span title="Repeats">↻ </span>}
          {arg.timeText}
        </span>
      )}
      <span className="entry-title">{arg.event.title}</span>
    </div>
  );
}
