import { useRef } from "react";
import type { Label, Project, Task, TaskPatch } from "../api/client";
import { Dot, PriorityIcon, StatusIcon } from "./icons";
import { dueText, dueTone, priorityLabel, statusLabel } from "./model";
import { DueMenu, LabelsMenu, PriorityMenu, ProjectMenu, StatusMenu } from "./pickers";
import { RefText } from "../refs/Markdown";
import { plainText } from "../refs/kinds";
import styles from "./TaskRow.module.css";

export type Picker = "status" | "priority" | "due" | "labels" | "project";

interface Props {
  task: Task;
  today: string;
  projects: Map<string, Project>;
  labels: Map<string, Label>;
  parentTitle?: string;
  focused: boolean;
  picker: Picker | null;
  onPicker: (p: Picker | null) => void;
  onFocus: () => void;
  onOpen: () => void;
  onChange: (patch: TaskPatch) => void;
  showProject?: boolean;
}

/** One dense row, Linear-style: every property is a button that opens its menu. */
export function TaskRow({ task: t, today, projects, labels, parentTitle, focused, picker, onPicker, onFocus, onOpen, onChange, showProject = true }: Props) {
  const refs = {
    priority: useRef<HTMLButtonElement>(null),
    status: useRef<HTMLButtonElement>(null),
    labels: useRef<HTMLButtonElement>(null),
    project: useRef<HTMLButtonElement>(null),
    due: useRef<HTMLButtonElement>(null),
  };
  const end = useRef<HTMLSpanElement>(null);
  const anchor = (p: Picker) => refs[p].current ?? end.current;
  const close = () => onPicker(null);
  const project = t.projectId ? projects.get(t.projectId) : undefined;
  const taskLabels = t.labelIds.map((id) => labels.get(id)).filter((l): l is Label => !!l);
  const tone = dueTone(t, today);
  const fixed = !!t.source;

  return (
    <div
      role="row"
      data-task-id={t.id}
      className={`${styles.row} ${focused ? styles.focused : ""} ${t.status === "done" || t.status === "canceled" ? styles.closed : ""}`}
      onMouseMove={focused ? undefined : onFocus}
      onClick={onOpen}
    >
      <button ref={refs.priority} className={styles.icon} title={`Priority: ${priorityLabel(t.priority)}`} onClick={(e) => (e.stopPropagation(), onPicker("priority"))}>
        <PriorityIcon priority={t.priority} />
      </button>
      <span className={styles.number}>#{t.number}</span>
      <button ref={refs.status} className={styles.icon} title={`Status: ${statusLabel(t.status)}`} onClick={(e) => (e.stopPropagation(), onPicker("status"))}>
        <StatusIcon status={t.status} />
      </button>

      <span className={styles.titleCell}>
        {parentTitle && <span className={styles.parent}>{plainText(parentTitle)} ›</span>}
        <span className={styles.title}>
          <RefText text={t.title} />
        </span>
        {t.blocked && <span className={styles.blocked} title="Blocked by an open task">Blocked</span>}
        {t.subtasks > 0 && (
          <span className={styles.meta} title="Sub-tasks done">
            {t.subtasksDone}/{t.subtasks}
          </span>
        )}
      </span>

      <span className={styles.props}>
        {taskLabels.length > 0 && (
          <button ref={refs.labels} className={`${styles.chip} ${styles.labels}`} onClick={(e) => (e.stopPropagation(), onPicker("labels"))}>
            {taskLabels.map((l) => (
              <span key={l.id} className={styles.label}>
                <Dot color={l.color} size={7} />
                {l.name}
              </span>
            ))}
          </button>
        )}
        {showProject && project && (
          <button ref={refs.project} className={`${styles.chip} ${styles.project}`} onClick={(e) => (e.stopPropagation(), onPicker("project"))}>
            <Dot color={project.color} size={7} />
            <span>{project.name}</span>
          </button>
        )}
        {t.due && (
          <button
            ref={refs.due}
            className={`${styles.chip} ${tone ? styles[tone] : ""}`}
            title={fixed ? `Due date set in ${t.source!.toUpperCase()}` : "Due date"}
            disabled={fixed}
            onClick={(e) => (e.stopPropagation(), onPicker("due"))}
          >
            {dueText(t.due, today)}
          </button>
        )}
        {fixed && <span className={styles.source}>{t.source!.toUpperCase()}</span>}
        <span ref={end} className={styles.end} aria-hidden />
      </span>

      {picker === "status" && <StatusMenu anchor={anchor("status")} onClose={close} value={t.status} onChange={(status) => onChange({ status })} />}
      {picker === "priority" && <PriorityMenu anchor={anchor("priority")} onClose={close} value={t.priority} onChange={(priority) => onChange({ priority })} />}
      {picker === "due" && !fixed && <DueMenu anchor={anchor("due")} onClose={close} value={t.due} onChange={(due) => onChange({ due })} />}
      {picker === "labels" && <LabelsMenu anchor={anchor("labels")} onClose={close} value={t.labelIds} onChange={(labelIds) => onChange({ labelIds })} />}
      {picker === "project" && <ProjectMenu anchor={anchor("project")} onClose={close} value={t.projectId} onChange={(projectId) => onChange({ projectId })} />}
    </div>
  );
}
