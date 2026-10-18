import { useEffect, useMemo, useState } from "react";
import type { CreateTask, Task, TaskPatch } from "../api/client";
import { today as todayDate } from "../lib/dates";
import { useLabels, useProjects, useTaskMutations } from "./api";
import { shortcutsBlocked, useTasksUi } from "./context";
import { Dot } from "./icons";
import { isClosed, statusLabel, type Group } from "./model";
import { TaskRow, type Picker } from "./TaskRow";
import styles from "./TaskList.module.css";

/** A status change, with an Undo toast when it closes the task. */
export function useChangeTask() {
  const { patch } = useTaskMutations();
  const { notify } = useTasksUi();
  return (t: Task, change: TaskPatch) => {
    patch.mutate({ id: t.id, patch: change });
    if (change.status && isClosed(change.status) && !isClosed(t.status)) {
      notify(`#${t.number} marked ${statusLabel(change.status)}`, () => patch.mutate({ id: t.id, patch: { status: t.status } }));
    }
  };
}

interface Props {
  groups: Group[];
  closed: Group;
  tasks: Task[];
  showProject?: boolean;
  /** Defaults every new task here gets (e.g. the project of a project page). */
  baseDefaults?: Partial<CreateTask>;
}

const PICKER_KEYS: Record<string, Picker> = { s: "status", p: "priority", d: "due", l: "labels", m: "project" };

/** Grouped rows with Linear's keyboard model: J/K move, Enter opens, X done, S/P/D/L/M menus. */
export function TaskList({ groups, closed, tasks, showProject = true, baseDefaults = {} }: Props) {
  const today = todayDate();
  const projects = new Map((useProjects().data ?? []).map((p) => [p.id, p]));
  const labels = new Map((useLabels().data ?? []).map((l) => [l.id, l]));
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const { openTask, openCreate } = useTasksUi();
  const change = useChangeTask();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(["closed"]));
  const [focus, setFocus] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ id: string; kind: Picker } | null>(null);

  const all = closed.tasks.length ? [...groups, closed] : groups;
  // The rows on screen, in order; a task in two groups (by label) is one stop per group.
  const visible = all.flatMap((g) => (collapsed.has(g.key) ? [] : g.tasks.map((t) => `${g.key}:${t.id}`)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutsBlocked(e)) return;
      const i = focus ? visible.indexOf(focus) : -1;
      const task = focus ? byId.get(focus.slice(focus.indexOf(":") + 1)) : undefined;
      const move = (to: number) => {
        const next = visible[Math.max(0, Math.min(visible.length - 1, to))];
        if (!next) return;
        setFocus(next);
        document.querySelector(`[data-row="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" });
      };
      const key = e.key.toLowerCase();
      if (key === "j" || e.key === "ArrowDown") move(i + 1);
      else if (key === "k" || e.key === "ArrowUp") move(i < 0 ? 0 : i - 1);
      else if (e.key === "Enter" && task) openTask(task.id);
      else if (key === "x" && task) change(task, { status: isClosed(task.status) ? "todo" : "done" });
      else if (PICKER_KEYS[key] && task && focus) setPicker({ id: focus, kind: PICKER_KEYS[key]! });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (tasks.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No tasks yet.</p>
        <button className="btn btn-primary" onClick={() => openCreate(baseDefaults)}>
          New task <kbd>C</kbd>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.list} role="grid">
      {all.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        return (
          <section key={g.key}>
            <header className={`${styles.group} ${g.tone === "danger" ? styles.danger : ""}`}>
              <button
                className={styles.toggle}
                aria-expanded={!isCollapsed}
                onClick={() => setCollapsed((c) => (c.has(g.key) ? new Set([...c].filter((k) => k !== g.key)) : new Set([...c, g.key])))}
              >
                <span className={styles.caret} aria-hidden>
                  {isCollapsed ? "▸" : "▾"}
                </span>
                {g.color && <Dot color={g.color} />}
                <span>{g.label}</span>
                <span className={styles.count}>{g.tasks.length}</span>
              </button>
              {g.key !== "closed" && (
                <button className={styles.add} title={`New task in ${g.label}`} onClick={() => openCreate({ ...baseDefaults, ...g.defaults })}>
                  +
                </button>
              )}
            </header>
            {!isCollapsed &&
              g.tasks.map((t) => {
                const key = `${g.key}:${t.id}`;
                return (
                  <div key={key} data-row={key}>
                    <TaskRow
                      task={t}
                      today={today}
                      projects={projects}
                      labels={labels}
                      parentTitle={t.parentId ? byId.get(t.parentId)?.title : undefined}
                      focused={focus === key}
                      picker={picker?.id === key ? picker.kind : null}
                      onPicker={(kind) => setPicker(kind ? { id: key, kind } : null)}
                      onFocus={() => setFocus(key)}
                      onOpen={() => openTask(t.id)}
                      onChange={(patch) => change(t, patch)}
                      showProject={showProject}
                    />
                  </div>
                );
              })}
          </section>
        );
      })}
    </div>
  );
}
