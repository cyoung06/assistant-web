import { useMemo, useState } from "react";
import { ItemPanel } from "./components/ItemPanel";
import { PanelContext, type PanelApi, type PanelTarget } from "./components/panel";
import { QuickAdd } from "./components/QuickAdd";
import { SourcesDialog } from "./components/SourcesDialog";
import { TagManager } from "./components/TagManager";
import { ByTagPage } from "./pages/ByTagPage";
import { CalendarPage } from "./pages/CalendarPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ItemsPage } from "./pages/ItemsPage";
import styles from "./App.module.css";

const PAGES = ["dashboard", "calendar", "items", "by-tag"] as const;
type Page = (typeof PAGES)[number];

/** Main screens first; custom views after the divider. */
const NAV: { page: Page; label: string; view?: boolean }[] = [
  { page: "dashboard", label: "Dashboard" },
  { page: "calendar", label: "Calendar" },
  { page: "items", label: "Items" },
  { page: "by-tag", label: "By tag", view: true },
];

function initialPage(): Page {
  const hash = location.hash.slice(1);
  return (PAGES as readonly string[]).includes(hash) ? (hash as Page) : "dashboard";
}

export function App() {
  const [page, setPage] = useState<Page>(initialPage);
  const [panel, setPanel] = useState<PanelTarget>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const panelApi = useMemo<PanelApi>(
    () => ({
      openItem: (id) => setPanel({ kind: "item", id }),
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
          <button className="btn btn-ghost" onClick={() => setTagsOpen(true)}>
            Tags
          </button>
        </header>
        <main className={styles.main}>
          {page === "dashboard" && <DashboardPage onOpenCalendar={() => go("calendar")} />}
          {page === "calendar" && <CalendarPage />}
          {page === "items" && <ItemsPage />}
          {page === "by-tag" && <ByTagPage />}
        </main>
      </div>
      <ItemPanel target={panel} />
      {tagsOpen && <TagManager onClose={() => setTagsOpen(false)} />}
      {sourcesOpen && <SourcesDialog onClose={() => setSourcesOpen(false)} />}
    </PanelContext.Provider>
  );
}
