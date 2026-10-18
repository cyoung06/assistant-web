import { useEffect, useState } from "react";
import { CalendarApp } from "./calendar/CalendarApp";
import { Shortcuts } from "./shell/Shortcuts";
import { Sidebar } from "./shell/Sidebar";
import { SourcesDialog } from "./shell/SourcesDialog";
import { shortcutsBlocked, TasksProvider, useTasksUi } from "./tasks/context";
import { FOCUS_SEARCH, TasksApp } from "./tasks/TasksApp";
import styles from "./App.module.css";

function useHash(): [string, (hash: string) => void] {
  const [hash, setHash] = useState(() => location.hash.slice(1));
  useEffect(() => {
    const onChange = () => setHash(location.hash.slice(1));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return [hash, (next) => (location.hash = next)];
}

/** A per-browser preference kept in localStorage (when the browser allows it). */
function useStored<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  });
  return [
    value,
    (v) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        // Private mode: kept until reload.
      }
    },
  ];
}

export function App() {
  return (
    <TasksProvider>
      <Shell />
    </TasksProvider>
  );
}

/** Sub-apps in the main area, each with its own part of the URL hash ("#tasks/…", "#calendar"); navigation on the left. */
function Shell() {
  const [hash, setHash] = useHash();
  const [collapsed, setCollapsed] = useStored("shell.collapsed", false);
  const [hidden, setHidden] = useStored<string[]>("calendar.hidden", []);
  const [drawer, setDrawer] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { openCreate } = useTasksUi();
  const onCalendar = hash.startsWith("calendar");
  const tasksRoute = hash.startsWith("tasks/") ? hash.slice(6) : "";
  const projectId = tasksRoute.startsWith("project/") ? tasksRoute.slice(8) : undefined;

  const go = (next: string) => {
    setHash(next);
    setDrawer(false);
  };
  const newTask = () => openCreate(projectId ? { projectId } : {});
  const search = () => {
    if (onCalendar || tasksRoute === "projects") go("tasks/all");
    setDrawer(false);
    setTimeout(() => window.dispatchEvent(new Event(FOCUS_SEARCH)), 50);
  };

  // C, ?, and Linear's G-then-key navigation.
  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if (shortcutsBlocked(e)) return;
      const key = e.key.toLowerCase();
      if (Date.now() - pendingG < 1200) {
        pendingG = 0;
        const target = { t: "tasks/active", p: "tasks/projects", c: "calendar" }[key];
        if (target) (e.preventDefault(), go(target));
        return;
      }
      if (key === "g") pendingG = Date.now();
      else if (key === "c") (e.preventDefault(), newTask());
      else if (e.key === "?") setShortcutsOpen((o) => !o);
      else if (e.key === "Escape") setShortcutsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={`${styles.app} ${drawer ? styles.drawerOpen : ""}`}>
      <div className={styles.side}>
        <Sidebar
          hash={hash}
          go={go}
          collapsed={collapsed}
          onCollapse={setCollapsed}
          hidden={hidden}
          onHidden={setHidden}
          onNewTask={newTask}
          onSearch={search}
          onSources={() => (setSourcesOpen(true), setDrawer(false))}
          onShortcuts={() => setShortcutsOpen((o) => !o)}
        />
      </div>
      {drawer && <div className={styles.scrim} onClick={() => setDrawer(false)} />}
      <div className={styles.mainCol}>
        <header className={styles.mobileBar}>
          <button className="btn btn-ghost" aria-label="Open navigation" onClick={() => setDrawer(true)}>
            ☰
          </button>
          <span className={styles.mobileTitle}>{onCalendar ? "Calendar" : "Tasks"}</span>
        </header>
        <main className={styles.main}>
          {onCalendar ? <CalendarApp hidden={hidden} /> : <TasksApp route={tasksRoute} go={(r) => go(`tasks/${r}`)} />}
        </main>
      </div>
      {sourcesOpen && <SourcesDialog onClose={() => setSourcesOpen(false)} />}
      {shortcutsOpen && <Shortcuts onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}
