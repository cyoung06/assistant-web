import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { Draggable } from "@fullcalendar/interaction";
import type { DateSelectArg, EventContentArg, EventDropArg } from "@fullcalendar/core";
import type { EventResizeDoneArg, DropArg } from "@fullcalendar/interaction";
import type { CalendarEntry, Scope } from "../api/client";
import { useAskScope } from "../components/ScopePrompt";
import { useCalendar, useItemMutations, useItems, useTags } from "../api/queries";
import { usePanel } from "../components/panel";
import { TagDot } from "../components/TagPicker";
import { whenLabel } from "../components/ItemRow";
import { atForDrop, atForSelection, patchForPlacement, toEvent } from "../lib/calendarMapping";
import { formatTime, toDateString } from "../lib/dates";
import styles from "./CalendarPage.module.css";
import "../styles/calendar.css";

export function CalendarPage() {
  const [range, setRange] = useState({ from: "", to: "" });
  const [hiddenTags, setHiddenTags] = useState<string[]>([]);
  const [showSessions, setShowSessions] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const tags = useTags().data ?? [];
  const calendar = useCalendar(range.from, range.to, hiddenTags, showSessions);
  const events = useMemo(() => (calendar.data ?? []).map(toEvent), [calendar.data]);

  const { openItem, openDraft } = usePanel();
  const { patch, create } = useItemMutations();
  const askScope = useAskScope();

  const onMove = async (info: EventDropArg | EventResizeDoneArg) => {
    const entry = info.event.extendedProps.entry as CalendarEntry;
    const placement = { start: info.event.start!, end: info.event.end, allDay: info.event.allDay };
    let scope: Scope | undefined;
    if (entry.seriesId) {
      // Moving to another day can only apply to this occurrence.
      const sameDay = toDateString(info.oldEvent.start!) === toDateString(placement.start);
      const answer = await askScope({ action: "edit", seriesWide: sameDay });
      if (!answer) return info.revert();
      scope = answer;
    }
    try {
      await patch.mutateAsync({ id: entry.itemId, patch: patchForPlacement(entry, placement), scope });
    } catch {
      info.revert();
    }
  };

  // Dropping an item from the sidebar: an item with a deadline gets a work session at that slot;
  // anything else is scheduled itself.
  const onDrop = (info: DropArg) => {
    const { itemId, hasBy } = info.draggedEl.dataset;
    if (!itemId) return;
    const at = atForDrop(info.date, info.allDay);
    if (hasBy === "true") create.mutate({ parentId: itemId, title: "", at });
    else patch.mutate({ id: itemId, patch: { at } });
  };

  const onSelect = (info: DateSelectArg) => {
    info.view.calendar.unselect();
    openDraft({ title: "", at: atForSelection(info.start, info.end, info.allDay) });
  };

  return (
    <div className={styles.page}>
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.open : ""}`}>
        <section className={styles.section}>
          <h2 className="label">Show</h2>
          <label className={styles.toggle}>
            <input
              className="checkbox"
              type="checkbox"
              checked={showSessions}
              onChange={(e) => setShowSessions(e.target.checked)}
            />
            Work sessions
          </label>
          {tags.map((tag) => (
            <label key={tag.id} className={styles.toggle}>
              <input
                className="checkbox"
                type="checkbox"
                checked={!hiddenTags.includes(tag.id)}
                onChange={(e) =>
                  setHiddenTags((h) => (e.target.checked ? h.filter((id) => id !== tag.id) : [...h, tag.id]))
                }
              />
              <TagDot color={tag.color} />
              {tag.name}
            </label>
          ))}
        </section>
        <ToSchedule />
      </aside>

      <div className={styles.main}>
        <button className={`btn ${styles.sidebarToggle}`} onClick={() => setSidebarOpen((o) => !o)}>
          {sidebarOpen ? "Hide panel" : "Filters & to schedule"}
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
          selectable
          droppable
          selectMirror
          scrollTime="08:00:00"
          slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          dayMaxEvents
          events={events}
          datesSet={(arg) => setRange({ from: toDateString(arg.start), to: toDateString(arg.end) })}
          eventClick={(arg) => openItem((arg.event.extendedProps.entry as CalendarEntry).itemId)}
          eventDrop={onMove}
          eventResize={onMove}
          drop={onDrop}
          select={onSelect}
          eventContent={renderEntry}
        />
      </div>
    </div>
  );
}

function renderEntry(arg: EventContentArg) {
  const entry = arg.event.extendedProps.entry as CalendarEntry;
  const isDeadline = entry.kind === "deadline" || entry.kind === "allDayDeadline";
  const time = entry.kind === "deadline" ? formatTime(entry.due!) : entry.kind === "block" ? arg.timeText : "";
  return (
    <div className="entry" title={isDeadline ? `Due: ${arg.event.title}` : arg.event.title}>
      {isDeadline && <span className="entry-flag">Due</span>}
      {entry.seriesId && <span className="entry-repeat" title="Repeats">↻</span>}
      {time && <span className="entry-time">{time}</span>}
      <span className="entry-title">{arg.event.title}</span>
    </div>
  );
}

/** Open, unscheduled top-level items, draggable onto the calendar. */
function ToSchedule() {
  const ref = useRef<HTMLDivElement>(null);
  const items = useItems({ done: false, topLevel: true });
  const unscheduled = (items.data?.items ?? []).filter((i) => !i.at);

  useEffect(() => {
    if (!ref.current) return;
    const draggable = new Draggable(ref.current, {
      itemSelector: "[data-item-id]",
      // `create: false`: the drop handler saves the change; the API response redraws the calendar.
      eventData: (el) => ({ title: el.dataset.title, create: false, duration: "01:00" }),
    });
    return () => draggable.destroy();
  }, []);

  return (
    <section className={styles.section}>
      <h2 className="label">To schedule</h2>
      <p className={styles.hint}>Drag onto the calendar to plan time for it.</p>
      <div ref={ref} className={styles.drag}>
        {unscheduled.length === 0 && <p className={styles.hint}>Nothing waiting.</p>}
        {unscheduled.map((item) => (
          <div
            key={item.id}
            className={styles.dragItem}
            data-item-id={item.id}
            data-title={item.derived.displayTitle}
            data-has-by={item.by ? "true" : "false"}
          >
            <TagDot color={item.derived.color} />
            <span className={styles.dragTitle}>{item.derived.displayTitle || "Untitled"}</span>
            <span className={styles.dragMeta}>{whenLabel(item).join(" · ")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
