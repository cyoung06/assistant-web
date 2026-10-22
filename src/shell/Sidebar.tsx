import type { ReactNode } from "react";
import { useCalendars } from "../calendar/api";
import { DEADLINES } from "../calendar/CalendarApp";
import { useInitiatives, useProjects, useTasks } from "../tasks/api";
import { Dot } from "../tasks/icons";
import { isClosed } from "../tasks/model";
import { VIEWS } from "../tasks/TasksApp";
import { useTriage, waitingCount } from "../triage/api";
import styles from "./Sidebar.module.css";

interface Props {
  /** The route (the path without its "/"), e.g. "tasks/active", "tasks/project/<id>", "calendar". */
  hash: string;
  go: (hash: string) => void;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  hidden: string[];
  onHidden: (hidden: string[]) => void;
  onNewTask: () => void;
  onSearch: () => void;
  onSources: () => void;
  onShortcuts: () => void;
}

/** Linear-style navigation: task views, projects, calendar (with its toggles), and the app's tools. */
export function Sidebar({ hash, go, collapsed, onCollapse, hidden, onHidden, onNewTask, onSearch, onSources, onShortcuts }: Props) {
  const projects = useProjects().data ?? [];
  const initiatives = useInitiatives().data ?? [];
  const tasks = useTasks().data ?? [];
  const calendars = useCalendars().data ?? [];
  const triage = waitingCount(useTriage().data);
  const openIn = (projectId: string) => tasks.filter((t) => t.projectId === projectId && !isClosed(t.status)).length;
  const onCalendar = hash.startsWith("calendar");
  const taskRoute = hash.startsWith("tasks/") ? hash.slice(6) : hash === "tasks" || !hash ? "active" : "";
  // Open projects that are in an active initiative or in none: last semester's courses drop out once it's completed.
  const active = new Set(initiatives.filter((i) => i.status === "active").map((i) => i.id));
  const shownProjects = projects.filter(
    (p) => p.state !== "completed" && p.state !== "canceled" && (p.initiativeIds.length === 0 || p.initiativeIds.some((id) => active.has(id))),
  );
  const toggle = (id: string) => onHidden(hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]);

  return (
    <nav className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`} aria-label="Navigation">
      <div className={styles.top}>
        <span className={styles.brand}>Assistant</span>
        <button className={styles.tool} title="Search" aria-label="Search" onClick={onSearch}>
          <SearchIcon />
        </button>
        <button className={styles.tool} title="New task (C)" aria-label="New task" onClick={onNewTask}>
          <PenIcon />
        </button>
      </div>

      <div className={styles.scroll}>
        <Link icon={<TodayIcon />} label="Today" active={hash === "today"} onClick={() => go("today")} />
        <Link icon={<TriageIcon />} label="Triage" count={triage || undefined} active={hash === "triage"} onClick={() => go("triage")} />

        {/* Section links: the view underneath carries the highlight. */}
        <Link icon={<TasksIcon />} label="Tasks" active={false} onClick={() => go("tasks/active")} />
        {VIEWS.map((v) => (
          <Link key={v.id} sub label={v.label} active={taskRoute === v.id} onClick={() => go(`tasks/${v.id}`)} />
        ))}

        <Link icon={<InitiativesIcon />} label="Initiatives" active={taskRoute === "initiatives" || taskRoute.startsWith("initiative/")} onClick={() => go("tasks/initiatives")} />
        <Link icon={<ProjectsIcon />} label="Projects" active={taskRoute === "projects"} onClick={() => go("tasks/projects")} />
        {shownProjects.map((p) => (
          <Link
            key={p.id}
            sub
            icon={<Dot color={p.color} size={8} />}
            label={p.name}
            count={openIn(p.id) || undefined}
            active={taskRoute === `project/${p.id}`}
            onClick={() => go(`tasks/project/${p.id}`)}
          />
        ))}

        <Link icon={<FilesIcon />} label="Files" active={hash === "files" || hash.startsWith("files/")} onClick={() => go("files")} />
        <Link icon={<TrashIcon />} label="Trash" active={hash === "trash"} onClick={() => go("trash")} />
        <Link icon={<CalendarIcon />} label="Calendar" active={onCalendar} onClick={() => go("calendar")} />
        {onCalendar && (
          <div className={styles.toggles}>
            {calendars.map((c) => (
              <label key={c.id} className={styles.toggle}>
                <input className="checkbox" type="checkbox" checked={!hidden.includes(c.id)} onChange={() => toggle(c.id)} />
                <Dot color={c.color} size={8} />
                <span>{c.name}</span>
              </label>
            ))}
            <label className={styles.toggle}>
              <input className="checkbox" type="checkbox" checked={!hidden.includes(DEADLINES)} onChange={() => toggle(DEADLINES)} />
              <span className={styles.dueMark} aria-hidden />
              <span>Task deadlines</span>
            </label>
          </div>
        )}
      </div>

      <div className={styles.bottom}>
        <button className={styles.footLink} onClick={onSources} title="Sources and calendar feed">
          <SourcesIcon />
          <span>Sources</span>
        </button>
        <span className={styles.spacer} />
        <button className={styles.tool} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={onShortcuts}>
          ?
        </button>
        <button className={`${styles.tool} ${styles.collapse}`} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => onCollapse(!collapsed)}>
          {collapsed ? "»" : "«"}
        </button>
      </div>
    </nav>
  );
}

function Link({ icon, label, active, onClick, sub, count }: { icon?: ReactNode; label: string; active: boolean; onClick: () => void; sub?: boolean; count?: number }) {
  return (
    <button className={`${styles.link} ${sub ? styles.sub : ""} ${active ? styles.active : ""}`} aria-current={active ? "page" : undefined} title={label} onClick={onClick}>
      <span className={styles.icon}>{icon}</span>
      <span className={styles.label}>{label}</span>
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </button>
  );
}

// ---- icons (15px, currentColor) -------------------------------------------------------

const svg = (children: ReactNode) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
const TodayIcon = () => svg(<><circle cx="8" cy="8" r="2.8" /><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" /></>);
const TasksIcon = () => svg(<><circle cx="8" cy="8" r="6" /><path d="M5.5 8.2 7.2 9.8 10.6 6.3" /></>);
const ProjectsIcon = () => svg(<><rect x="2" y="2.5" width="12" height="11" rx="2" /><path d="M2 6h12M6 6v7.5" /></>);
const TriageIcon = () => svg(<><path d="M2 9.5h3l1.2 2h3.6l1.2-2h3" /><path d="M2 9.5 3.8 3.5h8.4L14 9.5v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" /></>);
const InitiativesIcon = () => svg(<><path d="M3 14V2.5" /><path d="M3 3h8.5l-1.8 2.7L11.5 8.5H3" /></>);
const TrashIcon = () => svg(<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v4M9 7v4" />);
const FilesIcon = () => svg(<path d="M2 4.5a1 1 0 0 1 1-1h3.2l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />);
const CalendarIcon = () => svg(<><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" /></>);
const SearchIcon = () => svg(<><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.5 3.5" /></>);
const PenIcon = () => svg(<><path d="M10.5 2.5 13.5 5.5 6 13H3v-3z" /><path d="m9 4 3 3" /></>);
const SourcesIcon = () => svg(<><path d="M3 8a5 5 0 0 1 8.5-3.5L13 6M13 8a5 5 0 0 1-8.5 3.5L3 10" /><path d="M13 2.5V6H9.5M3 13.5V10h3.5" /></>);
