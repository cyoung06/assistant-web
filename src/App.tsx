import { useEffect, useMemo, useRef, useState } from "react";
import { authEnabled, isSignedIn, onAuthChange, renderSignIn } from "./auth/google";
import { ItemPanel } from "./components/ItemPanel";
import { PanelContext, type PanelApi, type PanelTarget } from "./components/panel";
import { QuickAdd } from "./components/QuickAdd";
import { TagManager } from "./components/TagManager";
import { CalendarPage } from "./pages/CalendarPage";
import { ItemsPage } from "./pages/ItemsPage";
import styles from "./App.module.css";

type Page = "calendar" | "items";

function initialPage(): Page {
  return location.hash === "#items" ? "items" : "calendar";
}

export function App() {
  const [signedIn, setSignedIn] = useState(isSignedIn());
  useEffect(() => onAuthChange(() => setSignedIn(isSignedIn())), []);
  return signedIn ? <Shell /> : <SignIn />;
}

function Shell() {
  const [page, setPage] = useState<Page>(initialPage);
  const [panel, setPanel] = useState<PanelTarget>(null);
  const [tagsOpen, setTagsOpen] = useState(false);

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
            <button className={page === "calendar" ? styles.current : ""} onClick={() => go("calendar")}>
              Calendar
            </button>
            <button className={page === "items" ? styles.current : ""} onClick={() => go("items")}>
              Items
            </button>
          </nav>
          <QuickAdd />
          <button className="btn btn-ghost" onClick={() => setTagsOpen(true)}>
            Tags
          </button>
        </header>
        <main className={styles.main}>{page === "calendar" ? <CalendarPage /> : <ItemsPage />}</main>
      </div>
      <ItemPanel target={panel} />
      {tagsOpen && <TagManager onClose={() => setTagsOpen(false)} />}
    </PanelContext.Provider>
  );
}

function SignIn() {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (authEnabled && buttonRef.current) renderSignIn(buttonRef.current).catch((e: Error) => setError(e.message));
  }, []);
  return (
    <div className={styles.signIn}>
      <h1>Assistant</h1>
      <p>Sign in with your Google account.</p>
      <div ref={buttonRef} />
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
