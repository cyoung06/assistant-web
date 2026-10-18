import { useEffect, useRef, useState } from "react";
import type { Project, ProjectState } from "../api/client";
import { today } from "../lib/dates";
import { useLabels, useProjectMutations, useProjects, useTasks } from "./api";
import { useTasksUi } from "./context";
import { Dot } from "./icons";
import { closedGroup, groupTasks, GROUPINGS, ORDERINGS, type Grouping, type Ordering } from "./model";
import { TaskList } from "./TaskList";
import styles from "./TasksApp.module.css";

const PROJECT_STATES: { value: ProjectState; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
];

/** The task views in the sidebar; closed tasks show (folded) only under All and in projects. */
export const VIEWS = [
  { id: "active", label: "Active", statuses: ["todo", "in_progress"] },
  { id: "backlog", label: "Backlog", statuses: ["backlog"] },
  { id: "all", label: "All tasks", statuses: null },
] as const;
export type View = (typeof VIEWS)[number]["id"];

/** Asks the open task list to focus its search box (from the sidebar's search button). */
export const FOCUS_SEARCH = "tasks:focus-search";

/** The Tasks sub-app. [route] is what follows "#tasks/": a view, "projects" or "project/<id>". */
export function TasksApp({ route, go }: { route: string; go: (route: string) => void }) {
  if (route === "projects") return <ProjectsPage open={(id) => go(`project/${id}`)} />;
  const projectId = route.startsWith("project/") ? route.slice(8) : null;
  const view = VIEWS.find((v) => v.id === route) ?? VIEWS[0];
  return <TasksPage key={projectId ?? view.id} view={projectId ? null : view} projectId={projectId} back={() => go("projects")} />;
}

// ---- the list -------------------------------------------------------------------------

interface Display {
  grouping: Grouping;
  ordering: Ordering;
  subtasks: boolean;
}

/** Display options are a per-browser convenience. */
function useDisplay(): [Display, (d: Partial<Display>) => void] {
  const [display, setDisplay] = useState<Display>(() => {
    const fallback: Display = { grouping: "due", ordering: "priority", subtasks: true };
    try {
      return { ...fallback, ...JSON.parse(localStorage.getItem("tasks.display") ?? "{}") };
    } catch {
      return fallback;
    }
  });
  const update = (d: Partial<Display>) =>
    setDisplay((old) => {
      const next = { ...old, ...d };
      try {
        localStorage.setItem("tasks.display", JSON.stringify(next));
      } catch {
        // Private mode: the choice lasts until reload.
      }
      return next;
    });
  return [display, update];
}

function TasksPage({ view, projectId, back }: { view: (typeof VIEWS)[number] | null; projectId: string | null; back: () => void }) {
  const tasks = useTasks();
  const projects = useProjects().data ?? [];
  const labels = useLabels().data ?? [];
  const { openCreate } = useTasksUi();
  const [display, setDisplay] = useDisplay();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = () => searchRef.current?.focus();
    window.addEventListener(FOCUS_SEARCH, focus);
    return () => window.removeEventListener(FOCUS_SEARCH, focus);
  }, []);
  const project = projectId ? projects.find((p) => p.id === projectId) : undefined;
  const baseDefaults = projectId ? { projectId } : {};

  const q = query.trim().toLowerCase();
  const shown = (tasks.data ?? [])
    .filter((t) => !projectId || t.projectId === projectId)
    .filter((t) => !view?.statuses || (view.statuses as readonly string[]).includes(t.status))
    .filter((t) => display.subtasks || !t.parentId)
    .filter((t) => !q || t.title.toLowerCase().includes(q) || `#${t.number}` === q);
  const ctx = { today: today(), projects, labels };
  const groups = groupTasks(shown, projectId && display.grouping === "project" ? "status" : display.grouping, display.ordering, ctx);

  return (
    <div className={styles.page}>
      {projectId ? <ProjectHeader project={project} back={back} /> : <h1 className={styles.pageTitle}>{view?.label}</h1>}
      <div className={styles.toolbar}>
        <input ref={searchRef} id="tasks-search" className={`input ${styles.search}`} type="search" placeholder="Search or #number" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className={styles.option}>
          Group
          <select id="tasks-grouping" className="input" value={display.grouping} onChange={(e) => setDisplay({ grouping: e.target.value as Grouping })}>
            {GROUPINGS.filter((g) => !projectId || g.value !== "project").map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.option}>
          Order
          <select id="tasks-ordering" className="input" value={display.ordering} onChange={(e) => setDisplay({ ordering: e.target.value as Ordering })}>
            {ORDERINGS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input id="tasks-subtasks" className="checkbox" type="checkbox" checked={display.subtasks} onChange={(e) => setDisplay({ subtasks: e.target.checked })} />
          Sub-tasks
        </label>
        <span className={styles.spacer} />
        <button className="btn btn-primary" onClick={() => openCreate(baseDefaults)}>
          New task <kbd>C</kbd>
        </button>
      </div>
      <div className={styles.scroll}>
        {tasks.isPending && <p className={styles.note}>Loading…</p>}
        {tasks.error && <p className={styles.note}>{tasks.error.message}</p>}
        {tasks.isSuccess && <TaskList groups={groups} closed={closedGroup(view?.statuses ? [] : shown)} tasks={shown} showProject={!projectId} baseDefaults={baseDefaults} />}
      </div>
    </div>
  );
}

// ---- projects ---------------------------------------------------------------------------

function ProjectsPage({ open }: { open: (id: string) => void }) {
  const projects = useProjects();
  const { create } = useProjectMutations();
  const [name, setName] = useState("");
  const add = async () => {
    if (!name.trim()) return;
    const p = await create.mutateAsync({ name: name.trim() });
    setName("");
    open(p.id);
  };
  const order = (p: Project) => PROJECT_STATES.findIndex((s) => s.value === p.state);
  const list = [...(projects.data ?? [])].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Projects</h1>
      <div className={styles.toolbar}>
        <input
          id="new-project"
          className={`input ${styles.search}`}
          placeholder="New project name, Enter to add"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
      </div>
      <div className={styles.scroll}>
        {projects.isPending && <p className={styles.note}>Loading…</p>}
        {projects.isSuccess && list.length === 0 && <p className={styles.note}>No projects yet. PLMS adds one per course.</p>}
        {list.map((p) => {
          const pct = p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0;
          return (
            <button key={p.id} className={styles.projectRow} onClick={() => open(p.id)}>
              <Dot color={p.color} size={10} />
              <span className={styles.projectName}>{p.name}</span>
              {p.source && <span className={styles.source}>{p.source.toUpperCase()}</span>}
              <span className={styles.state}>{PROJECT_STATES.find((s) => s.value === p.state)!.label}</span>
              <span className={styles.progress} title={`${p.doneCount} of ${p.taskCount} done`}>
                <span style={{ width: `${pct}%`, background: p.color }} />
              </span>
              <span className={styles.pct}>
                {p.doneCount}/{p.taskCount}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProjectHeader({ project: p, back }: { project: Project | undefined; back: () => void }) {
  const { update, remove } = useProjectMutations();
  const [confirm, setConfirm] = useState(false);
  if (!p) return null;
  const pct = p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0;
  return (
    <div className={styles.projectHead}>
      <button className={styles.back} onClick={back}>
        Projects ›
      </button>
      <input
        aria-label="Project color"
        type="color"
        className={styles.color}
        value={p.color}
        onChange={(e) => update.mutate({ id: p.id, color: e.target.value.toUpperCase() })}
      />
      <input
        key={p.name}
        className={styles.projectTitle}
        defaultValue={p.name}
        aria-label="Project name"
        onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && update.mutate({ id: p.id, name: e.target.value.trim() })}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <select id="project-state" className={`input ${styles.stateSelect}`} value={p.state} onChange={(e) => update.mutate({ id: p.id, state: e.target.value as ProjectState })}>
        {PROJECT_STATES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <span className={styles.pct}>
        {pct}% · {p.doneCount}/{p.taskCount} done
      </span>
      <span className={styles.spacer} />
      {confirm ? (
        <>
          <span className={styles.note}>Delete the project? Its tasks stay.</span>
          <button
            className="btn btn-danger"
            onClick={() => {
              remove.mutate(p.id);
              back();
            }}
          >
            Delete
          </button>
          <button className="btn btn-ghost" onClick={() => setConfirm(false)}>
            Keep
          </button>
        </>
      ) : (
        <button className="btn btn-ghost" onClick={() => setConfirm(true)}>
          Delete project
        </button>
      )}
    </div>
  );
}
