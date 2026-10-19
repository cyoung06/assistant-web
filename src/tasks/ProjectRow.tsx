import type { ReactNode } from "react";
import type { Project } from "../api/client";
import { Dot } from "./icons";
import styles from "./TasksApp.module.css";

export const PROJECT_STATES = [
  { value: "backlog", label: "Backlog" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
] as const;

/** A project in a list: name, source, state and progress; [extra] goes at the end (e.g. a remove button). */
export function ProjectRow({ project: p, open, extra }: { project: Project; open: () => void; extra?: ReactNode }) {
  const pct = p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0;
  return (
    <div className={styles.projectRow}>
      <button className={styles.projectOpen} onClick={open}>
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
      {extra}
    </div>
  );
}
