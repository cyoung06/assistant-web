import { useEffect, useRef, useState } from "react";
import type { RelationKind, Task } from "../api/client";
import { today } from "../lib/dates";
import { useLabels, useProjects, useTask, useTaskMutations, useTasks } from "./api";
import { useTasksUi } from "./context";
import { Dot, PriorityIcon, StatusIcon } from "./icons";
import { Menu } from "./Menu";
import { dueText, priorityLabel, statusLabel } from "./model";
import { DueMenu, LabelsMenu, PriorityMenu, ProjectMenu, StatusMenu, TaskMenu } from "./pickers";
import { useChangeTask } from "./TaskList";
import { useBacklinks } from "../refs/api";
import { EditableMarkdown } from "../refs/EditableMarkdown";
import { plainText } from "../refs/kinds";
import styles from "./TaskPanel.module.css";

type Field = "status" | "priority" | "due" | "project" | "labels" | "parent" | "relationKind" | "relationTask";

const RELATIONS: { kind: RelationKind; label: string }[] = [
  { kind: "blocked_by", label: "Blocked by" },
  { kind: "blocks", label: "Blocks" },
  { kind: "related", label: "Related" },
  { kind: "duplicate_of", label: "Duplicate of" },
  { kind: "duplicated_by", label: "Duplicated by" },
];

/** A task's details beside the list: title and description in place, properties, sub-tasks, relations. */
export function TaskPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTask(id);
  const tasks = useTasks();
  const { openTask, openCreate } = useTasksUi();
  const { create, remove, relate, unrelate } = useTaskMutations();
  const change = useChangeTask();
  const projects = useProjects().data ?? [];
  const labels = useLabels().data ?? [];
  const [open, setOpen] = useState<Field | null>(null);
  const [relationKind, setRelationKind] = useState<RelationKind>("blocked_by");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newSub, setNewSub] = useState("");
  const refs = useRef<Partial<Record<Field, HTMLElement | null>>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[data-overlay]") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!t) {
    return (
      <aside className={styles.panel}>
        <p className={styles.body}>{tasks.isPending ? "Loading…" : "This task no longer exists."}</p>
      </aside>
    );
  }

  const fixed = !!t.source;
  const set = (patch: Parameters<typeof change>[1]) => change(t, patch);
  const close = () => setOpen(null);
  const ref = (f: Field) => (el: HTMLElement | null) => void (refs.current[f] = el);
  const project = projects.find((p) => p.id === t.projectId);
  const parent = tasks.data?.find((x) => x.id === t.parentId);
  const subtasks = (tasks.data ?? []).filter((x) => x.parentId === t.id).sort((a, b) => a.number - b.number);
  const taskLabels = labels.filter((l) => t.labelIds.includes(l.id));

  const addSub = async () => {
    const title = newSub.trim();
    if (!title) return;
    await create.mutateAsync({ title, parentId: t.id, projectId: t.projectId });
    setNewSub("");
  };

  return (
    <aside className={styles.panel} aria-label={`Task #${t.number}`}>
      <header className={styles.head}>
        <span className={styles.number}>#{t.number}</span>
        {parent && (
          <button className={styles.crumb} onClick={() => openTask(parent.id)}>
            ↑ #{parent.number} {plainText(parent.title)}
          </button>
        )}
        <span className={styles.spacer} />
        {t.url && (
          <a className="btn btn-ghost" href={t.url} target="_blank" rel="noreferrer">
            Open in {t.source?.toUpperCase() ?? "source"}
          </a>
        )}
        <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className={styles.body}>
        <div className={styles.title} role="heading" aria-level={2} title={fixed ? `Set in ${t.source!.toUpperCase()}` : undefined}>
          <EditableMarkdown value={t.title} readOnly={fixed} placeholder="Title" onCommit={(title) => set({ title })} />
        </div>

        <dl className={styles.props}>
          <dt>Status</dt>
          <dd>
            <button ref={ref("status")} className={styles.value} onClick={() => setOpen("status")}>
              <StatusIcon status={t.status} /> {statusLabel(t.status)}
            </button>
          </dd>
          <dt>Priority</dt>
          <dd>
            <button ref={ref("priority")} className={styles.value} onClick={() => setOpen("priority")}>
              <PriorityIcon priority={t.priority} /> {priorityLabel(t.priority)}
            </button>
          </dd>
          <dt>Due</dt>
          <dd>
            <button
              ref={ref("due")}
              className={`${styles.value} ${t.overdue ? styles.overdue : ""} ${!t.due ? styles.muted : ""}`}
              disabled={fixed}
              title={fixed ? `Set in ${t.source!.toUpperCase()}` : undefined}
              onClick={() => setOpen("due")}
            >
              {t.due ? dueText(t.due, today()) : "No due date"}
              {t.overdue && " · overdue"}
            </button>
          </dd>
          <dt>Project</dt>
          <dd>
            <button ref={ref("project")} className={`${styles.value} ${!project ? styles.muted : ""}`} onClick={() => setOpen("project")}>
              {project && <Dot color={project.color} />} {project?.name ?? "No project"}
            </button>
          </dd>
          <dt>Labels</dt>
          <dd>
            <button ref={ref("labels")} className={`${styles.value} ${!taskLabels.length ? styles.muted : ""}`} onClick={() => setOpen("labels")}>
              {taskLabels.length
                ? taskLabels.map((l) => (
                    <span key={l.id} className={styles.label}>
                      <Dot color={l.color} size={7} />
                      {l.name}
                    </span>
                  ))
                : "Add labels"}
            </button>
          </dd>
          <dt>Parent</dt>
          <dd>
            <button ref={ref("parent")} className={`${styles.value} ${!parent ? styles.muted : ""}`} onClick={() => setOpen("parent")}>
              {parent ? `#${parent.number} ${plainText(parent.title)}` : "None"}
            </button>
            {parent && (
              <button className={styles.remove} aria-label="Remove parent" onClick={() => set({ parentId: null })}>
                ×
              </button>
            )}
          </dd>
        </dl>

        <EditableMarkdown multiline value={t.description} placeholder="Add description… Type @ to reference anything" onCommit={(description) => set({ description })} />

        <section className={styles.section}>
          <h3>
            Sub-tasks <span className={styles.count}>{subtasks.length ? `${t.subtasksDone}/${t.subtasks}` : ""}</span>
          </h3>
          {subtasks.map((s) => (
            <MiniRow key={s.id} task={s} onOpen={() => openTask(s.id)} onToggle={() => change(s, { status: s.status === "done" ? "todo" : "done" })} />
          ))}
          <input
            id="new-subtask"
            className={`input ${styles.addInput}`}
            placeholder="Add sub-task, Enter to save"
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSub()}
          />
        </section>

        <section className={styles.section}>
          <h3>Relations</h3>
          {RELATIONS.map(({ kind, label }) => {
            const list = t.relations.filter((r) => r.kind === kind);
            if (!list.length) return null;
            return (
              <div key={kind} className={styles.relationGroup}>
                <span className="label">{label}</span>
                {list.map((r) => (
                  <div key={r.id} className={styles.mini}>
                    <StatusIcon status={r.task.status} />
                    <button className={styles.miniTitle} onClick={() => openTask(r.task.id)}>
                      #{r.task.number} {plainText(r.task.title)}
                    </button>
                    <button className={styles.remove} aria-label="Remove relation" onClick={() => unrelate.mutate({ id: t.id, relationId: r.id })}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
          <button ref={ref("relationKind")} className={`btn ${styles.addRelation}`} onClick={() => setOpen("relationKind")}>
            Add relation
          </button>
        </section>

        {t.attachments.length > 0 && (
          <section className={styles.section}>
            <h3>Attachments</h3>
            <div className={styles.files}>
              {t.attachments.map((a) => (
                <a key={a.id} className={styles.file} href={`/api/v1/attachments/${a.id}`} target="_blank" rel="noreferrer" title={a.filename}>
                  {a.contentType.startsWith("image/") ? <img src={`/api/v1/attachments/${a.id}`} alt={a.filename} /> : <span>{a.filename}</span>}
                </a>
              ))}
            </div>
          </section>
        )}

        <Backlinks id={t.id} />

        <footer className={styles.foot}>
          <span className={styles.stamp}>
            Created {new Date(t.createdAt).toLocaleDateString()} · updated {new Date(t.updatedAt).toLocaleDateString()}
          </span>
          {confirmDelete ? (
            <>
              <span className={styles.stamp}>{t.subtasks ? `Delete with ${t.subtasks} sub-task${t.subtasks > 1 ? "s" : ""}?` : "Delete this task?"}</span>
              <button
                className="btn btn-danger"
                onClick={() => {
                  remove.mutate(t.id);
                  onClose();
                }}
              >
                Delete
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </>
          ) : (
            <span className={styles.actions}>
              <button className="btn btn-ghost" onClick={() => openCreate({ parentId: t.id, projectId: t.projectId })}>
                New sub-task
              </button>
              <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            </span>
          )}
        </footer>
      </div>

      {open === "status" && <StatusMenu anchor={refs.current.status!} onClose={close} value={t.status} onChange={(status) => set({ status })} />}
      {open === "priority" && <PriorityMenu anchor={refs.current.priority!} onClose={close} value={t.priority} onChange={(priority) => set({ priority })} />}
      {open === "due" && <DueMenu anchor={refs.current.due!} onClose={close} value={t.due} onChange={(due) => set({ due })} />}
      {open === "project" && <ProjectMenu anchor={refs.current.project!} onClose={close} value={t.projectId} onChange={(projectId) => set({ projectId })} />}
      {open === "labels" && <LabelsMenu anchor={refs.current.labels!} onClose={close} value={t.labelIds} onChange={(labelIds) => set({ labelIds })} />}
      {open === "parent" && (
        <TaskMenu
          anchor={refs.current.parent!}
          onClose={close}
          exclude={[t.id, ...descendantIds(tasks.data ?? [], t.id)]}
          placeholder="Make a sub-task of…"
          onPick={(p) => {
            set({ parentId: p.id });
            close();
          }}
        />
      )}
      {open === "relationKind" && (
        <Menu
          anchor={refs.current.relationKind!}
          onClose={close}
          keepOpen
          placeholder="Relation…"
          items={RELATIONS.map((r) => ({ key: r.kind, label: r.label }))}
          onPick={(k) => {
            setRelationKind(k as RelationKind);
            setOpen("relationTask");
          }}
        />
      )}
      {open === "relationTask" && (
        <TaskMenu
          anchor={refs.current.relationKind!}
          onClose={close}
          exclude={[t.id]}
          placeholder={`${RELATIONS.find((r) => r.kind === relationKind)!.label}…`}
          onPick={(other) => {
            relate.mutate({ id: t.id, kind: relationKind, taskId: other.id });
            close();
          }}
        />
      )}
    </aside>
  );
}

function descendantIds(tasks: Task[], id: string): string[] {
  const out: string[] = [];
  const queue = [id];
  while (queue.length) {
    const next = queue.shift()!;
    for (const t of tasks) if (t.parentId === next && !out.includes(t.id)) (out.push(t.id), queue.push(t.id));
  }
  return out;
}

function MiniRow({ task, onOpen, onToggle }: { task: Task; onOpen: () => void; onToggle: () => void }) {
  return (
    <div className={styles.mini}>
      <button className={styles.miniIcon} aria-label={task.status === "done" ? "Mark not done" : "Mark done"} onClick={onToggle}>
        <StatusIcon status={task.status} />
      </button>
      <button className={`${styles.miniTitle} ${task.status === "done" || task.status === "canceled" ? styles.closed : ""}`} onClick={onOpen}>
        <span className={styles.miniNumber}>#{task.number}</span> {plainText(task.title)}
      </button>
    </div>
  );
}

/** Tasks and events that link to this task. */
function Backlinks({ id }: { id: string }) {
  const url = `${location.origin}/task/${id}`;
  const backlinks = useBacklinks(url);
  const list = backlinks.data ?? [];
  if (!list.length) return null;
  return (
    <section className={styles.section}>
      <h3>Referenced by</h3>
      {list.map((r) => (
        <div key={r.url} className={styles.mini}>
          <a className="ref" data-kind={r.kind} href={r.url}>
            {r.title}
          </a>
        </div>
      ))}
    </section>
  );
}
