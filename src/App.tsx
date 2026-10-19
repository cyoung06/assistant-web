import { useCallback, useEffect, useState } from "react";
import { CalendarApp } from "./calendar/CalendarApp";
import { Shortcuts } from "./shell/Shortcuts";
import { Sidebar } from "./shell/Sidebar";
import { appRoute, plmsWebUrl } from "./refs/kinds";
import { MailReader } from "./refs/MailReader";
import { SourcesDialog } from "./shell/SourcesDialog";
import { shortcutsBlocked, TasksProvider, useTasksUi } from "./tasks/context";
import { FOCUS_SEARCH, TasksApp } from "./tasks/TasksApp";
import { DropToTriage } from "./triage/DropToTriage";
import { TriagePage } from "./triage/TriagePage";
import styles from "./App.module.css";

/** The route: the URL path without its leading "/" ("tasks/active", "task/<id>", "calendar"). */
const currentRoute = () => decodeURI(location.pathname).slice(1);

/** [route, navigate (a history entry), replace (none)]. Old "#tasks/…" addresses become paths. */
function useRoute(): [string, (route: string) => void, (route: string) => void] {
  const [route, setRoute] = useState(() => {
    const legacy = location.hash.startsWith("#") ? appRoute(location.hash) : null;
    if (legacy) history.replaceState(null, "", "/" + legacy);
    return currentRoute();
  });
  useEffect(() => {
    const onPop = () => setRoute(currentRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((next: string) => {
    if (next !== currentRoute()) history.pushState(null, "", "/" + next);
    setRoute(next);
  }, []);
  const replace = useCallback((next: string) => {
    history.replaceState(null, "", "/" + next);
    setRoute(next);
  }, []);
  return [route, navigate, replace];
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

/** Sub-apps in the main area, each with its own path ("/tasks/…", "/calendar"); navigation on the left. */
function Shell() {
  const [hash, navigate, replace] = useRoute();
  const [collapsed, setCollapsed] = useStored("shell.collapsed", false);
  const [hidden, setHidden] = useStored<string[]>("calendar.hidden", []);
  const [drawer, setDrawer] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { openCreate, openTask } = useTasksUi();
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  // Links to things (references): /task/<id> opens the task over the task list, /event/<uid> opens
  // the event on the calendar, /mail/<id> (from mid:) shows the mail.
  useEffect(() => {
    const m = /^(task|event)\/(.+)$/.exec(hash);
    if (!m) return;
    const id = decodeURIComponent(m[2]!);
    if (m[1] === "task") {
      openTask(id);
      replace("tasks/active");
    } else {
      setOpenEventId(id);
      replace("calendar");
    }
  }, [hash, openTask, replace]);

  // Every link in the app: its own pages and mail open in place; plms: links open PLMS.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      const href = a?.getAttribute("href");
      if (!href || e.defaultPrevented || e.button !== 0) return;
      if (href.startsWith("plms:")) {
        e.preventDefault();
        const url = plmsWebUrl(href);
        if (url) window.open(url, "_blank", "noopener");
        return;
      }
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a?.target === "_blank") return;
      const route = appRoute(href);
      if (route !== null) {
        e.preventDefault();
        navigate(route);
        setDrawer(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [navigate]);

  const mailId = hash.startsWith("mail/") ? decodeURIComponent(hash.slice(5)) : null;
  const onTriage = hash === "triage";
  const onCalendar = hash.startsWith("calendar");
  const tasksRoute = hash.startsWith("tasks/") ? hash.slice(6) : "";
  const projectId = tasksRoute.startsWith("project/") ? tasksRoute.slice(8) : undefined;

  const clearOpenEvent = useCallback(() => setOpenEventId(null), []);
  const go = (next: string) => {
    navigate(next);
    setDrawer(false);
  };
  const newTask = () => openCreate(projectId ? { projectId } : {});
  const search = () => {
    if (onCalendar || onTriage || tasksRoute === "projects" || tasksRoute.startsWith("initiative")) go("tasks/all");
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
        const target = { t: "tasks/active", p: "tasks/projects", c: "calendar", i: "triage" }[key];
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
          <span className={styles.mobileTitle}>{onCalendar ? "Calendar" : onTriage ? "Triage" : "Tasks"}</span>
        </header>
        <main className={styles.main}>
          {mailId ? (
            <MailReader messageId={mailId} back={() => (history.length > 1 ? history.back() : go("tasks/active"))} />
          ) : onTriage ? (
            <TriagePage />
          ) : onCalendar ? (
            <CalendarApp hidden={hidden} openEventId={openEventId} onOpened={clearOpenEvent} />
          ) : (
            <TasksApp route={tasksRoute} go={(r) => go(`tasks/${r}`)} />
          )}
        </main>
      </div>
      <DropToTriage />
      {sourcesOpen && <SourcesDialog onClose={() => setSourcesOpen(false)} />}
      {shortcutsOpen && <Shortcuts onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}
