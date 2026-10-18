import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { Scope } from "../api/client";
import styles from "./ScopePrompt.module.css";

interface Ask {
  action: "edit" | "delete";
  /** False when the change only makes sense for one occurrence, e.g. moving it to another day. */
  seriesWide: boolean;
}

type AskScope = (ask: Ask) => Promise<Scope | null>;

const ScopeContext = createContext<AskScope>(async () => "this");

/** Ask which occurrences of a repeating event a change applies to. Resolves null if cancelled. */
export const useAskScope = () => useContext(ScopeContext);

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ ask: Ask; resolve: (s: Scope | null) => void } | null>(null);

  const ask = useCallback<AskScope>((a) => new Promise((resolve) => setPending({ ask: a, resolve })), []);
  const answer = (scope: Scope | null) => {
    pending?.resolve(scope);
    setPending(null);
  };

  return (
    <ScopeContext.Provider value={ask}>
      {children}
      {pending && (
        <div className={styles.backdrop} onClick={() => answer(null)}>
          <div className={styles.dialog} role="dialog" aria-label="Repeating event" onClick={(e) => e.stopPropagation()}>
            <h2>{pending.ask.action === "delete" ? "Delete repeating event" : "Change repeating event"}</h2>
            <button className="btn" autoFocus onClick={() => answer("this")}>
              This event
            </button>
            <button className="btn" disabled={!pending.ask.seriesWide} onClick={() => answer("following")}>
              This and following events
            </button>
            <button className="btn" disabled={!pending.ask.seriesWide} onClick={() => answer("all")}>
              All events
            </button>
            {!pending.ask.seriesWide && (
              <p className={styles.note}>Moving to another day applies to this event only. To move them all, change the repeat days.</p>
            )}
            <button className="btn btn-ghost" onClick={() => answer(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </ScopeContext.Provider>
  );
}
