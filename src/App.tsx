import { useMemo, useState } from "react";
import { PanelContext, type PanelApi, type PanelTarget } from "./components/panel";
import { QuickAdd } from "./components/QuickAdd";
import { SourcesDialog } from "./components/SourcesDialog";
import { TaskPanel } from "./components/TaskPanel";
import { ByCategoryPage } from "./pages/ByCategoryPage";
import { CalendarPage } from "./pages/CalendarPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TasksPage } from "./pages/TasksPage";
import styles from "./App.module.css";

const PAGES = ["dashboard", "calendar", "tasks", "by-category"] as const;
type Page = (typeof PAGES)[number];

/** Main screens first; custom views after the divider. */
const NAV: { page: Page; label: string; view?: boolean }[] = [
  { page: "dashboard", label: "Dashboard" },
  { page: "calendar", label: "Calendar" },
  { page: "tasks", label: "Tasks" },
  { page: "by-category", label: "By category", view: true },
];

function initialPage(): Page {
  const hash = location.hash.slice(1);
  return (PAGES as readonly string[]).includes(hash) ? (hash as Page) : "dashboard";
}

export function App() {
  const [page, setPage] = useState<Page>(initialPage);
  const [panel, setPanel] = useState<PanelTarget>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const panelApi = useMemo<PanelApi>(
    () => ({
      openTask: (id) => setPanel({ kind: "task", id }),
      openDraft: (draft) => setPanel({ kind: "draft", draft }),
      close: () => setPanel(null),
    }),
    [],
  );

  const go = (next: Page) => {
    setPage(next);
    history.replaceState(null, "", `#${next}`);
  };

  return (
      <PanelContext.Provider value={panelApi}>
        <div className={styles.app}>
          <header className={styles.header}>
            <span className={styles.brand}>Assistant</span>
            <nav className={styles.nav}>
              {NAV.map((n, i) => (
                <span key={n.page} className={styles.navItem}>
                  {n.view && !NAV[i - 1]?.view && <span className={styles.divider} aria-hidden />}
                  <button className={page === n.page ? styles.current : ""} aria-current={page === n.page ? "page" : undefined} onClick={() => go(n.page)}>
                    {n.label}
                  </button>
                </span>
              ))}
            </nav>
            <div className={styles.quick}>
              <QuickAdd />
            </div>
            <button className="btn btn-ghost" onClick={() => setSourcesOpen(true)}>
              Sources
            </button>
          </header>
          <main className={styles.main}>
            {page === "dashboard" && <DashboardPage />}
            {page === "tasks" && <TasksPage />}
            {page === "calendar" && <CalendarPage />}
            {page === "by-category" && <ByCategoryPage />}
          </main>
        </div>
        <TaskPanel target={panel} />
        {sourcesOpen && <SourcesDialog onClose={() => setSourcesOpen(false)} />}
      </PanelContext.Provider>
  );
}
