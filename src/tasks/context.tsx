import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CreateTask } from "../api/client";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { TaskPanel } from "./TaskPanel";
import styles from "./context.module.css";

interface Toast {
  text: string;
  undo?: () => void;
}

interface TasksApi {
  openTask: (id: string) => void;
  openCreate: (defaults?: Partial<CreateTask>) => void;
  closePanel: () => void;
  notify: (text: string, undo?: () => void) => void;
  panelTaskId: string | null;
}

const TasksContext = createContext<TasksApi | null>(null);

export const useTasksUi = () => useContext(TasksContext)!;

/** The task panel, the create dialog and toasts, available to every page (the calendar opens tasks too). */
export function TasksProvider({ children }: { children: ReactNode }) {
  const [panelTaskId, setPanelTaskId] = useState<string | null>(null);
  const [create, setCreate] = useState<Partial<CreateTask> | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = useCallback((text: string, undo?: () => void) => setToast({ text, undo }), []);
  const value = useMemo<TasksApi>(
    () => ({
      openTask: setPanelTaskId,
      openCreate: (defaults = {}) => setCreate(defaults),
      closePanel: () => setPanelTaskId(null),
      notify,
      panelTaskId,
    }),
    [notify, panelTaskId],
  );

  return (
    <TasksContext.Provider value={value}>
      {children}
      {panelTaskId && <TaskPanel key={panelTaskId} id={panelTaskId} onClose={() => setPanelTaskId(null)} />}
      {create && <CreateTaskDialog defaults={create} onClose={() => setCreate(null)} />}
      {toast && (
        <div className={styles.toast} role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              className={styles.undo}
              onClick={() => {
                toast.undo!();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </TasksContext.Provider>
  );
}

/** True while typing or while a menu or dialog is open: single-key shortcuts stay off then. */
export function shortcutsBlocked(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return true;
  return document.querySelector("[data-overlay]") !== null;
}
