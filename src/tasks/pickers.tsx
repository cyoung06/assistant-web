import { useState } from "react";
import type { Due, Priority, Task, TaskStatus } from "../api/client";
import { formatDay, shortTime, today } from "../lib/dates";
import { useLabelMutations, useLabels, useProjectMutations, useProjects, useTasks } from "./api";
import { Dot, PriorityIcon, StatusIcon } from "./icons";
import { Menu, Popover } from "./Menu";
import { plainText } from "../refs/kinds";
import { PRIORITIES, STATUSES, dueChoices } from "./model";
import styles from "./Menu.module.css";

// The property menus, shared by rows, the create dialog and the side panel. Each one is only the
// menu; callers render the chip that opens it.

interface MenuBase {
  anchor: HTMLElement | null;
  onClose: () => void;
}

export function StatusMenu({ anchor, onClose, value, onChange }: MenuBase & { value: TaskStatus; onChange: (s: TaskStatus) => void }) {
  return (
    <Menu
      anchor={anchor}
      onClose={onClose}
      placeholder="Change status…"
      items={STATUSES.map((s, i) => ({ key: s.value, label: s.label, icon: <StatusIcon status={s.value} />, hint: String(i + 1), selected: s.value === value }))}
      onPick={(k) => onChange(k as TaskStatus)}
    />
  );
}

export function PriorityMenu({ anchor, onClose, value, onChange }: MenuBase & { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <Menu
      anchor={anchor}
      onClose={onClose}
      placeholder="Set priority…"
      items={PRIORITIES.map((p) => ({ key: p.value, label: p.label, icon: <PriorityIcon priority={p.value} />, selected: p.value === value }))}
      onPick={(k) => onChange(k as Priority)}
    />
  );
}

/** Today / Tomorrow / End of week / Next week, or a custom date and time. Quick picks keep the time. */
export function DueMenu({ anchor, onClose, value, onChange }: MenuBase & { value: Due | null | undefined; onChange: (d: Due | null) => void }) {
  const [custom, setCustom] = useState(false);
  const [date, setDate] = useState(value?.date ?? today());
  const [time, setTime] = useState(value?.time ? shortTime(value.time) : "");

  if (custom) {
    return (
      <Popover anchor={anchor} onClose={onClose}>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (!date) return;
            onChange({ date, time: time || null });
            onClose();
          }}
        >
          <span className="label">Due date</span>
          <input id="due-custom-date" className="input" type="date" value={date} autoFocus onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <input id="due-custom-time" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time (optional)" />
          <div className={styles.formRow}>
            <button className="btn btn-ghost" type="button" onClick={() => setCustom(false)}>
              Back
            </button>
            <button className="btn btn-primary" type="submit">
              Set
            </button>
          </div>
        </form>
      </Popover>
    );
  }
  const items = [
    ...dueChoices(today()).map((c) => ({ key: `date:${c.date}`, label: c.label, hint: formatDay(c.date), selected: value?.date === c.date })),
    { key: "custom", label: "Custom date…" },
    ...(value ? [{ key: "none", label: "No due date" }] : []),
  ];
  return (
    <Menu
      anchor={anchor}
      onClose={onClose}
      placeholder="Set due date…"
      items={items}
      onPick={(k) => {
        if (k === "custom") return setCustom(true);
        onChange(k === "none" ? null : { date: k.slice(5), time: value?.time ?? null });
        onClose();
      }}
      // "Custom date…" swaps in the form instead of closing.
      keepOpen
    />
  );
}

export function LabelsMenu({ anchor, onClose, value, onChange }: MenuBase & { value: string[]; onChange: (ids: string[]) => void }) {
  const labels = useLabels().data ?? [];
  const { create } = useLabelMutations();
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <Menu
      anchor={anchor}
      onClose={onClose}
      multi
      placeholder="Labels…"
      items={labels.map((l) => ({ key: l.id, label: l.name, icon: <Dot color={l.color} />, selected: value.includes(l.id) }))}
      onPick={toggle}
      onCreate={async (name) => {
        const l = await create.mutateAsync({ name });
        onChange([...value, l.id]);
      }}
    />
  );
}

export function ProjectMenu({ anchor, onClose, value, onChange }: MenuBase & { value: string | null | undefined; onChange: (id: string | null) => void }) {
  const projects = useProjects().data ?? [];
  const { create } = useProjectMutations();
  return (
    <Menu
      anchor={anchor}
      onClose={onClose}
      placeholder="Move to project…"
      items={[
        { key: "", label: "No project", selected: !value },
        ...projects.map((p) => ({ key: p.id, label: p.name, icon: <Dot color={p.color} />, selected: p.id === value })),
      ]}
      onPick={(k) => onChange(k || null)}
      onCreate={async (name) => {
        const p = await create.mutateAsync({ name });
        onChange(p.id);
        onClose();
      }}
    />
  );
}

/** Picks another task, e.g. for a relation or a parent. */
export function TaskMenu({ anchor, onClose, exclude, onPick, placeholder }: MenuBase & { exclude: string[]; onPick: (t: Task) => void; placeholder: string }) {
  const tasks = useTasks().data ?? [];
  const shown = tasks.filter((t) => !exclude.includes(t.id)).sort((a, b) => b.number - a.number);
  return (
    <Menu
      anchor={anchor}
      onClose={onClose}
      width={320}
      placeholder={placeholder}
      items={shown.map((t) => ({ key: t.id, label: `#${t.number} ${plainText(t.title)}`, icon: <StatusIcon status={t.status} /> }))}
      onPick={(id) => onPick(shown.find((t) => t.id === id)!)}
    />
  );
}
