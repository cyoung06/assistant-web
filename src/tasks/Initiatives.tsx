import { useRef, useState } from "react";
import type { Initiative, InitiativeStatus, Project } from "../api/client";
import { EditableMarkdown } from "../refs/EditableMarkdown";
import { useInitiativeMutations, useInitiatives, useProjectMutations, useProjects } from "./api";
import { Popover } from "./Menu";
import { ProjectRow } from "./ProjectRow";
import styles from "./TasksApp.module.css";

// Initiatives, as in Linear: a larger goal (a semester, a research effort) grouping projects.

export const INITIATIVE_STATUSES: { value: InitiativeStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "planned", label: "Planned" },
  { value: "completed", label: "Completed" },
];

const statusOrder = (i: Initiative) => INITIATIVE_STATUSES.findIndex((s) => s.value === i.status);

/** Active first, then planned, then completed; by name within each. */
export const sortInitiatives = (list: Initiative[]) => [...list].sort((a, b) => statusOrder(a) - statusOrder(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

const formatDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

export function InitiativesPage({ open }: { open: (id: string) => void }) {
  const initiatives = useInitiatives();
  const { create } = useInitiativeMutations();
  const [name, setName] = useState("");
  const add = async () => {
    if (!name.trim()) return;
    const i = await create.mutateAsync({ name: name.trim() });
    setName("");
    open(i.id);
  };
  const list = sortInitiatives(initiatives.data ?? []);

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Initiatives</h1>
      <div className={styles.toolbar}>
        <input
          id="new-initiative"
          className={`input ${styles.search}`}
          placeholder="New initiative name, Enter to add"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
      </div>
      <div className={styles.scroll}>
        {initiatives.isPending && <p className={styles.note}>Loading…</p>}
        {initiatives.isSuccess && list.length === 0 && <p className={styles.note}>No initiatives yet. Group projects toward a bigger goal, like a semester. PLMS adds one per semester.</p>}
        {list.map((i) => {
          const pct = i.taskCount ? Math.round((i.doneCount / i.taskCount) * 100) : 0;
          return (
            <div key={i.id} className={styles.projectRow}>
              <button className={styles.projectOpen} onClick={() => open(i.id)}>
                <StatusMark status={i.status} />
                <span className={styles.projectName}>{i.name}</span>
                {i.targetDate && <span className={styles.source}>{formatDate(i.targetDate)}</span>}
                <span className={styles.state}>
                  {i.projectIds.length} project{i.projectIds.length === 1 ? "" : "s"}
                </span>
                <span className={styles.progress} title={`${i.doneCount} of ${i.taskCount} done`}>
                  <span style={{ width: `${pct}%`, background: "var(--accent)" }} />
                </span>
                <span className={styles.pct}>{pct}%</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function InitiativePage({ id, back, openProject }: { id: string; back: () => void; openProject: (id: string) => void }) {
  const initiatives = useInitiatives();
  const projects = useProjects().data ?? [];
  const { update, remove } = useInitiativeMutations();
  const [confirm, setConfirm] = useState(false);
  const i = initiatives.data?.find((x) => x.id === id);
  if (!i) return <div className={styles.page}>{initiatives.isPending ? <p className={styles.note}>Loading…</p> : <p className={styles.note}>No such initiative.</p>}</div>;

  const mine = projects.filter((p) => i.projectIds.includes(p.id));
  const others = projects.filter((p) => !i.projectIds.includes(p.id));
  const pct = i.taskCount ? Math.round((i.doneCount / i.taskCount) * 100) : 0;
  const setProjects = (projectIds: string[]) => update.mutate({ id: i.id, projectIds });

  return (
    <div className={styles.page}>
      <div className={styles.projectHead}>
        <button className={styles.back} onClick={back}>
          Initiatives ›
        </button>
        <input
          key={i.name}
          className={styles.projectTitle}
          defaultValue={i.name}
          aria-label="Initiative name"
          onBlur={(e) => e.target.value.trim() && e.target.value !== i.name && update.mutate({ id: i.id, name: e.target.value.trim() })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <select id="initiative-status" className={`input ${styles.stateSelect}`} value={i.status} onChange={(e) => update.mutate({ id: i.id, status: e.target.value as InitiativeStatus })}>
          {INITIATIVE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label className={styles.option}>
          Target
          <input
            id="initiative-target"
            className={`input ${styles.stateSelect}`}
            type="date"
            value={i.targetDate ?? ""}
            onChange={(e) => update.mutate({ id: i.id, targetDate: e.target.value || null })}
          />
        </label>
        <span className={styles.pct}>
          {pct}% · {i.doneCount}/{i.taskCount} done
        </span>
        <span className={styles.spacer} />
        {confirm ? (
          <>
            <span className={styles.note}>Delete the initiative? Its projects stay.</span>
            <button
              className="btn btn-danger"
              onClick={() => {
                remove.mutate(i.id);
                back();
              }}
            >
              Delete
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </>
        ) : (
          <button className="btn btn-ghost" onClick={() => setConfirm(true)}>
            Delete initiative
          </button>
        )}
      </div>
      <div className={styles.description}>
        <EditableMarkdown value={i.description} multiline placeholder="Add a description…" onCommit={(description) => update.mutate({ id: i.id, description })} />
      </div>
      <div className={styles.toolbar}>
        <strong className={styles.sectionTitle}>Projects</strong>
        <span className={styles.spacer} />
        {others.length > 0 && (
          <select
            id="initiative-add-project"
            className={`input ${styles.inlineSelect}`}
            value=""
            onChange={(e) => e.target.value && setProjects([...i.projectIds, e.target.value])}
          >
            <option value="">Add project…</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className={styles.scroll}>
        {mine.length === 0 && <p className={styles.note}>No projects in this initiative yet.</p>}
        {mine.map((p) => (
          <ProjectRow
            key={p.id}
            project={p}
            open={() => openProject(p.id)}
            extra={
              <button className={styles.rowRemove} title="Remove from initiative" aria-label={`Remove ${p.name}`} onClick={() => setProjects(i.projectIds.filter((x) => x !== p.id))}>
                ✕
              </button>
            }
          />
        ))}
      </div>
    </div>
  );
}

/** A project's initiatives as chips, with a menu to add it to others or start a new one. */
export function InitiativePicker({ project: p, openInitiative }: { project: Project; openInitiative: (id: string) => void }) {
  const initiatives = sortInitiatives(useInitiatives().data ?? []);
  const { update } = useProjectMutations();
  const { create } = useInitiativeMutations();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const anchor = useRef<HTMLButtonElement>(null);
  const set = (initiativeIds: string[]) => update.mutate({ id: p.id, initiativeIds });
  const mine = initiatives.filter((i) => p.initiativeIds.includes(i.id));

  return (
    <span className={styles.chips}>
      {mine.map((i) => (
        <span key={i.id} className={styles.chip}>
          <button className={styles.chipLabel} onClick={() => openInitiative(i.id)} title="Open initiative">
            <StatusMark status={i.status} />
            {i.name}
          </button>
          <button className={styles.chipRemove} aria-label={`Remove from ${i.name}`} onClick={() => set(p.initiativeIds.filter((x) => x !== i.id))}>
            ✕
          </button>
        </span>
      ))}
      <button ref={anchor} className={`btn btn-ghost ${styles.chipAdd}`} onClick={() => setOpen(true)}>
        {mine.length ? "＋" : "＋ Initiative"}
      </button>
      {open && (
        <Popover anchor={anchor.current} onClose={() => setOpen(false)} width={240}>
          <div className={styles.pickList}>
            {initiatives.map((i) => (
              <label key={i.id} className={styles.pickItem}>
                <input
                  className="checkbox"
                  type="checkbox"
                  checked={p.initiativeIds.includes(i.id)}
                  onChange={(e) => set(e.target.checked ? [...p.initiativeIds, i.id] : p.initiativeIds.filter((x) => x !== i.id))}
                />
                <StatusMark status={i.status} />
                <span>{i.name}</span>
              </label>
            ))}
            <input
              id="new-initiative-inline"
              className="input"
              placeholder="New initiative, Enter"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key !== "Enter" || !name.trim()) return;
                const i = await create.mutateAsync({ name: name.trim() });
                setName("");
                set([...p.initiativeIds, i.id]);
              }}
            />
          </div>
        </Popover>
      )}
    </span>
  );
}

/** Linear-style status ring: dashed when planned, half when active, full with a check when completed. */
export function StatusMark({ status }: { status: InitiativeStatus }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-label={status} className={styles.statusMark}>
      {status === "planned" && <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="2 2" />}
      {status === "active" && (
        <>
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--warn)" strokeWidth="1.5" />
          <path d="M6 1.5a4.5 4.5 0 0 1 0 9z" fill="var(--warn)" />
        </>
      )}
      {status === "completed" && (
        <>
          <circle cx="6" cy="6" r="5.25" fill="var(--accent)" />
          <path d="M3.8 6.2 5.3 7.6 8.2 4.6" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
