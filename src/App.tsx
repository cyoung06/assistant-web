import { useEffect, useState } from "react";
import { CalendarApp } from "./calendar/CalendarApp";
import { SourcesDialog } from "./components/SourcesDialog";
import { TasksApp } from "./tasks/TasksApp";
import { TasksProvider } from "./tasks/context";
import styles from "./App.module.css";

/** Sub-apps, each with its own part of the URL hash: "#tasks/…", "#calendar". */
const APPS = [
  { id: "tasks", label: "Tasks" },
  { id: "calendar", label: "Calendar" },
] as const;

function useHash(): [string, (hash: string) => void] {
  const [hash, setHash] = useState(() => location.hash.slice(1));
  useEffect(() => {
    const onChange = () => setHash(location.hash.slice(1));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return [hash, (next) => (location.hash = next)];
}

export function App() {
  const [hash, go] = useHash();
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const app = hash.startsWith("calendar") ? "calendar" : "tasks";
  const tasksRoute = hash.startsWith("tasks/") ? hash.slice(6) : "";

  return (
    <TasksProvider>
      <div className={styles.app}>
        <header className={styles.header}>
          <span className={styles.brand}>Assistant</span>
          <nav className={styles.nav}>
            {APPS.map((a) => (
              <button key={a.id} className={app === a.id ? styles.current : ""} aria-current={app === a.id ? "page" : undefined} onClick={() => go(a.id)}>
                {a.label}
              </button>
            ))}
          </nav>
          <span className={styles.spacer} />
          <button className="btn btn-ghost" onClick={() => setSourcesOpen(true)}>
            Sources
          </button>
        </header>
        <main className={styles.main}>
          {app === "tasks" ? <TasksApp route={tasksRoute} go={(r) => go(r ? `tasks/${r}` : "tasks")} /> : <CalendarApp />}
        </main>
      </div>
      {sourcesOpen && <SourcesDialog onClose={() => setSourcesOpen(false)} />}
    </TasksProvider>
  );
}
