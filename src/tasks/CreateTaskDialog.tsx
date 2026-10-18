import { useRef, useState } from "react";
import type { CreateTask } from "../api/client";
import { today } from "../lib/dates";
import { useLabels, useProjects, useTaskMutations, useTasks } from "./api";
import { Dot, PriorityIcon, StatusIcon } from "./icons";
import { dueText, priorityLabel, statusLabel } from "./model";
import { DueMenu, LabelsMenu, PriorityMenu, ProjectMenu, StatusMenu, TaskMenu } from "./pickers";
import styles from "./CreateTaskDialog.module.css";

type Field = "status" | "priority" | "due" | "project" | "labels" | "parent";

/** Linear's new-issue dialog: title, description and property chips; ⌘↵ creates. */
export function CreateTaskDialog({ defaults, onClose }: { defaults: Partial<CreateTask>; onClose: () => void }) {
  const blank = (): CreateTask => ({ title: "", description: "", status: "todo", priority: "none", labelIds: [], ...defaults });
  const [draft, setDraft] = useState<CreateTask>(blank);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<Field | null>(null);
  const refs = useRef<Partial<Record<Field, HTMLButtonElement | null>>>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const { create } = useTaskMutations();
  const projects = useProjects().data ?? [];
  const labels = useLabels().data ?? [];
  const parent = useTasks().data?.find((t) => t.id === draft.parentId);
  const project = projects.find((p) => p.id === draft.projectId);
  const set = (p: Partial<CreateTask>) => setDraft((d) => ({ ...d, ...p }));

  const submit = async () => {
    if (!draft.title.trim()) return titleRef.current?.focus();
    await create.mutateAsync({ ...draft, title: draft.title.trim() });
    if (!more) return onClose();
    setDraft(blank());
    titleRef.current?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.preventDefault(), submit());
  };
  const chip = (field: Field, content: React.ReactNode, muted: boolean) => (
    <button ref={(el) => void (refs.current[field] = el)} type="button" className={`${styles.chip} ${muted ? styles.muted : ""}`} onClick={() => setOpen(field)}>
      {content}
    </button>
  );
  const close = () => setOpen(null);

  return (
    <div className={styles.backdrop} data-overlay onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === "Escape" && !open && onClose()}>
      <div className={styles.dialog} role="dialog" aria-label="New task">
        <header className={styles.head}>
          <span className={styles.crumb}>{parent ? `New sub-task of #${parent.number}` : "New task"}</span>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <input
          ref={titleRef}
          id="new-task-title"
          className={styles.title}
          autoFocus
          placeholder="Task title"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          onKeyDown={(e) => {
            onKey(e);
            if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) (e.preventDefault(), submit());
          }}
        />
        <textarea
          id="new-task-description"
          className={styles.description}
          placeholder="Add description… (Markdown)"
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
          onKeyDown={onKey}
        />
        <div className={styles.chips}>
          {chip("status", <><StatusIcon status={draft.status!} /> {statusLabel(draft.status!)}</>, false)}
          {chip("priority", <><PriorityIcon priority={draft.priority!} /> {draft.priority === "none" ? "Priority" : priorityLabel(draft.priority!)}</>, draft.priority === "none")}
          {chip("due", draft.due ? dueText(draft.due, today()) : "Due date", !draft.due)}
          {chip("project", <>{project && <Dot color={project.color} />} {project?.name ?? "Project"}</>, !project)}
          {chip(
            "labels",
            draft.labelIds!.length ? labels.filter((l) => draft.labelIds!.includes(l.id)).map((l) => <span key={l.id} className={styles.label}><Dot color={l.color} size={7} />{l.name}</span>) : "Labels",
            !draft.labelIds!.length,
          )}
          {chip("parent", parent ? `Sub-task of #${parent.number}` : "Parent", !parent)}
        </div>
        {create.error && <p className={styles.error}>{create.error.message}</p>}
        <footer className={styles.foot}>
          <label className={styles.more}>
            <input id="create-more" className="checkbox" type="checkbox" checked={more} onChange={(e) => setMore(e.target.checked)} />
            Create more
          </label>
          <button className="btn btn-primary" onClick={submit} disabled={create.isPending}>
            Create task <kbd>⌘↵</kbd>
          </button>
        </footer>
      </div>

      {open === "status" && <StatusMenu anchor={refs.current.status!} onClose={close} value={draft.status!} onChange={(status) => set({ status })} />}
      {open === "priority" && <PriorityMenu anchor={refs.current.priority!} onClose={close} value={draft.priority!} onChange={(priority) => set({ priority })} />}
      {open === "due" && <DueMenu anchor={refs.current.due!} onClose={close} value={draft.due} onChange={(due) => set({ due })} />}
      {open === "project" && <ProjectMenu anchor={refs.current.project!} onClose={close} value={draft.projectId} onChange={(projectId) => set({ projectId })} />}
      {open === "labels" && <LabelsMenu anchor={refs.current.labels!} onClose={close} value={draft.labelIds!} onChange={(labelIds) => set({ labelIds })} />}
      {open === "parent" && (
        <TaskMenu
          anchor={refs.current.parent!}
          onClose={close}
          exclude={[]}
          placeholder="Sub-task of…"
          onPick={(t) => {
            set({ parentId: t.id, projectId: draft.projectId ?? t.projectId });
            close();
          }}
        />
      )}
    </div>
  );
}
