import { useEffect, useState } from "react";
import type { CalendarEvent, Repeat } from "../api/client";
import { addDays, formatDay, toDateString, toTimeString } from "../lib/dates";
import { useProjects } from "../tasks/api";
import { useEvent, useEventMutations } from "./api";
import { Markdown } from "../refs/Markdown";
import { MentionField } from "../refs/MentionField";
import styles from "./EventDialog.module.css";

type Weekday = NonNullable<Repeat["weekdays"]>[number];
const WEEKDAYS: { value: Weekday; short: string }[] = [
  { value: "SUNDAY", short: "S" },
  { value: "MONDAY", short: "M" },
  { value: "TUESDAY", short: "T" },
  { value: "WEDNESDAY", short: "W" },
  { value: "THURSDAY", short: "T" },
  { value: "FRIDAY", short: "F" },
  { value: "SATURDAY", short: "S" },
];
const JS_WEEKDAY: Weekday[] = WEEKDAYS.map((w) => w.value);

/** What the dialog opens on: a new event in a slot, or an existing one (from one of its occurrences). */
export type EventTarget =
  | { kind: "new"; start: Date; end: Date; allDay: boolean }
  | { kind: "edit"; id: string; occurrence: string };

interface Form {
  title: string;
  notes: string;
  allDay: boolean;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  repeats: boolean;
  /** "" for none. */
  projectId: string;
  repeat: Required<Pick<Repeat, "freq" | "interval" | "weekdays" | "skipped">> & { until: string };
}

const at = (date: string, time: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y!, m! - 1, d!, h, min);
};

function formFor(target: EventTarget, e: CalendarEvent | undefined): Form {
  const blankRepeat = (date: string): Form["repeat"] => ({ freq: "weekly", interval: 1, weekdays: [JS_WEEKDAY[new Date(at(date, "00:00")).getDay()]!], skipped: [], until: "" });
  if (target.kind === "new") {
    const date = toDateString(target.start);
    const lastDay = target.allDay ? addDays(toDateString(target.end), -1) : date;
    return {
      title: "", notes: "", allDay: target.allDay, date, endDate: lastDay,
      startTime: toTimeString(target.start), endTime: toTimeString(target.end), repeats: false, projectId: "", repeat: blankRepeat(date),
    };
  }
  const start = e?.start ? new Date(e.start) : null;
  const end = e?.end ? new Date(e.end) : null;
  const date = e?.startDate ?? (start ? toDateString(start) : target.occurrence);
  return {
    title: e?.title ?? "",
    notes: e?.notes ?? "",
    allDay: !!e?.startDate,
    date,
    endDate: e?.endDate ?? date,
    startTime: start ? toTimeString(start) : "09:00",
    endTime: end ? toTimeString(end) : "10:00",
    repeats: !!e?.repeat,
    projectId: e?.projectId ?? "",
    repeat: e?.repeat
      ? { freq: e.repeat.freq ?? "weekly", interval: e.repeat.interval ?? 1, weekdays: e.repeat.weekdays ?? [], skipped: e.repeat.skipped ?? [], until: e.repeat.until ?? "" }
      : blankRepeat(date),
  };
}

/** Create or edit an event; a repeating one is edited as a whole (its first occurrence's time and its rule). */
export function EventDialog({ target, onClose }: { target: EventTarget; onClose: () => void }) {
  const existing = useEvent(target.kind === "edit" ? target.id : null);
  const e = existing.data;
  const [form, setForm] = useState<Form | null>(target.kind === "new" ? formFor(target, undefined) : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { create, patch, remove } = useEventMutations();
  const projects = (useProjects().data ?? []).filter((p) => (p.state !== "completed" && p.state !== "canceled") || p.id === form?.projectId);
  const set = (p: Partial<Form>) => setForm((f) => f && { ...f, ...p });
  const setRepeat = (p: Partial<Form["repeat"]>) => setForm((f) => f && { ...f, repeat: { ...f.repeat, ...p } });

  useEffect(() => {
    if (e && !form) setForm(formFor(target, e));
  }, [e, form, target]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const readOnly = !!e?.fixed;
  // A rule from another app that this dialog can't express: shown, kept, not edited.
  const foreignRule = !!e?.repeats && !e.repeat;
  const error = create.error ?? patch.error ?? remove.error;

  const body = (f: Form) => {
    const time = f.allDay
      ? { startDate: f.date, endDate: f.endDate < f.date ? f.date : f.endDate }
      : { start: at(f.date, f.startTime).toISOString(), end: at(f.date, f.endTime).toISOString() };
    const repeat: Repeat | null = f.repeats
      ? { freq: f.repeat.freq, interval: f.repeat.interval, weekdays: f.repeat.freq === "weekly" ? f.repeat.weekdays : [], until: f.repeat.until || null, skipped: f.repeat.skipped }
      : null;
    return { title: f.title.trim(), notes: f.notes, ...time, projectId: f.projectId || null, ...(foreignRule ? {} : { repeat }) };
  };

  const save = async () => {
    if (!form || !form.title.trim()) return;
    if (!form.allDay && form.endTime <= form.startTime) return;
    if (target.kind === "new") await create.mutateAsync({ ...body(form), repeat: body(form).repeat ?? undefined, projectId: body(form).projectId ?? undefined });
    else await patch.mutateAsync({ id: target.id, patch: body(form) });
    onClose();
  };

  const skipOccurrence = async () => {
    if (!form || target.kind !== "edit") return;
    await patch.mutateAsync({ id: target.id, patch: { repeat: { ...body(form).repeat!, skipped: [...form.repeat.skipped, target.occurrence] } } });
    onClose();
  };

  return (
    <div className={styles.backdrop} data-overlay onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className={styles.dialog} role="dialog" aria-label={target.kind === "new" ? "New event" : "Event"}>
        {!form ? (
          <p className={styles.note}>{existing.error ? existing.error.message : "Loading…"}</p>
        ) : (
          <form
            className={styles.form}
            onSubmit={(ev) => {
              ev.preventDefault();
              save();
            }}
          >
            <header className={styles.head}>
              <span className="label">{target.kind === "new" ? "New event" : (e?.calendarName ?? "Event")}</span>
              <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
                ✕
              </button>
            </header>
            {readOnly ? (
              <h2 className={styles.title}>
                <Markdown inline text={form.title} />
              </h2>
            ) : (
              <MentionField id="event-title" className={styles.title} autoFocus placeholder="Event title (@ to reference)" value={form.title} onChange={(title) => set({ title })} />
            )}
            {readOnly && <p className={styles.note}>From {e?.calendarName}; it can't be changed here.</p>}

            <fieldset className={styles.fields} disabled={readOnly}>
              <label className={styles.check}>
                <input id="event-all-day" className="checkbox" type="checkbox" checked={form.allDay} onChange={(ev) => set({ allDay: ev.target.checked })} />
                All day
              </label>
              <div className={styles.row}>
                {form.repeats && <span>From</span>}
                <input id="event-date" className="input" type="date" value={form.date} onChange={(ev) => set({ date: ev.target.value })} aria-label={form.repeats ? "First date" : "Date"} />
                {form.allDay ? (
                  <input id="event-end-date" className="input" type="date" value={form.endDate} min={form.date} onChange={(ev) => set({ endDate: ev.target.value })} aria-label="Last date" />
                ) : (
                  <>
                    <input id="event-start" className="input" type="time" value={form.startTime} onChange={(ev) => set({ startTime: ev.target.value })} aria-label="Start time" />
                    <span className={styles.dash}>–</span>
                    <input id="event-end" className="input" type="time" value={form.endTime} onChange={(ev) => set({ endTime: ev.target.value })} aria-label="End time" />
                  </>
                )}
              </div>
              {!form.allDay && form.endTime <= form.startTime && <p className={styles.warn}>End must be after start.</p>}

              <div className={styles.row}>
                <span>Project</span>
                <select id="event-project" className="input" value={form.projectId} onChange={(ev) => set({ projectId: ev.target.value })}>
                  <option value="">None</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {foreignRule ? (
                <p className={styles.note}>Repeats by a rule set in another app; edit the rule there.</p>
              ) : (
                <>
                  <label className={styles.check}>
                    <input id="event-repeats" className="checkbox" type="checkbox" checked={form.repeats} onChange={(ev) => set({ repeats: ev.target.checked })} />
                    Repeats
                  </label>
                  {form.repeats && (
                    <div className={styles.repeat}>
                      <div className={styles.row}>
                        <span>Every</span>
                        <input
                          id="repeat-interval"
                          className={`input ${styles.small}`}
                          type="number"
                          min={1}
                          max={99}
                          value={form.repeat.interval}
                          onChange={(ev) => setRepeat({ interval: Math.max(1, Math.min(99, Number(ev.target.value) || 1)) })}
                          aria-label="Interval"
                        />
                        <select id="repeat-freq" className={`input ${styles.auto}`} value={form.repeat.freq} onChange={(ev) => setRepeat({ freq: ev.target.value as Form["repeat"]["freq"] })}>
                          <option value="daily">day(s)</option>
                          <option value="weekly">week(s)</option>
                          <option value="monthly">month(s)</option>
                        </select>
                      </div>
                      {form.repeat.freq === "weekly" && (
                        <div className={styles.days} role="group" aria-label="On">
                          {WEEKDAYS.map((w) => {
                            const on = form.repeat.weekdays.includes(w.value);
                            return (
                              <button
                                key={w.value}
                                type="button"
                                aria-pressed={on}
                                title={w.value.toLowerCase()}
                                className={on ? styles.dayOn : ""}
                                onClick={() => setRepeat({ weekdays: on ? form.repeat.weekdays.filter((d) => d !== w.value) : [...form.repeat.weekdays, w.value] })}
                              >
                                {w.short}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <label className={styles.row}>
                        <span>Until</span>
                        <input id="repeat-until" className={`input ${styles.auto}`} type="date" value={form.repeat.until} min={form.date} onChange={(ev) => setRepeat({ until: ev.target.value })} />
                        {!form.repeat.until && <span className={styles.note}>forever</span>}
                      </label>
                      {form.repeat.skipped.length > 0 && (
                        <div className={styles.skipped}>
                          <span className="label">Skipped</span>
                          {form.repeat.skipped.map((d) => (
                            <span key={d} className={styles.skip}>
                              {formatDay(d)}
                              <button type="button" aria-label={`Bring back ${d}`} onClick={() => setRepeat({ skipped: form.repeat.skipped.filter((x) => x !== d) })}>
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {readOnly ? (
                form.notes && <Markdown text={form.notes} />
              ) : (
                <MentionField multiline id="event-notes" className={`input ${styles.notes}`} placeholder="Notes… Type @ to reference anything" value={form.notes} onChange={(notes) => set({ notes })} />
              )}
            </fieldset>

            {error && <p className={styles.warn}>{error.message}</p>}

            {!readOnly && (
              <footer className={styles.foot}>
                {target.kind === "edit" &&
                  (confirmDelete ? (
                    <>
                      <span className={styles.note}>{e?.repeats ? "Delete every occurrence?" : "Delete this event?"}</span>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={async () => {
                          await remove.mutateAsync(target.id);
                          onClose();
                        }}
                      >
                        Delete
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                      Delete
                    </button>
                  ))}
                {target.kind === "edit" && e?.repeat && !confirmDelete && (
                  <button type="button" className="btn" onClick={skipOccurrence} title="Cancel just this occurrence">
                    Skip {formatDay(target.occurrence)}
                  </button>
                )}
                <span className={styles.spacer} />
                <button type="submit" className="btn btn-primary" disabled={!form.title.trim() || create.isPending || patch.isPending}>
                  {target.kind === "new" ? "Create" : "Save"}
                </button>
              </footer>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
