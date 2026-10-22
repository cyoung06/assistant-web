import { useEffect, useMemo, useRef, useState } from "react";
import { appRoute, KIND_LABEL, plmsWebUrl } from "../refs/kinds";
import { useRefSearch } from "../refs/api";
import { useProjects } from "../tasks/api";
import styles from "./Palette.module.css";

/** Something the palette can do: go somewhere, make something. */
export type Command = { label: string; hint?: string; keywords?: string; run: () => void };

type Row = { key: string; label: string; detail?: string; run: () => void };

/**
 * ⌘K: one box for everything. What's typed narrows the app's commands (go to a page, new task,
 * quick note, new note in a project) and finds things (tasks, projects, events, notes, files, mail,
 * PLMS) to jump to.
 */
export function Palette({ commands, onClose, go, quickNoteIn }: { commands: Command[]; onClose: () => void; go: (route: string) => void; quickNoteIn: (projectId: string) => void }) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const projects = useProjects();
  const found = useRefSearch(q.trim() ? q.trim() : null);

  useEffect(() => input.current?.focus(), []);

  const rows = useMemo<Row[]>(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (text: string) => words.every((w) => text.toLowerCase().includes(w));
    const own: Row[] = commands.filter((c) => matches(`${c.label} ${c.keywords ?? ""}`)).map((c) => ({ key: `c:${c.label}`, label: c.label, detail: c.hint, run: c.run }));
    // "New note in <project>": when what's typed names a project (or asks for a new note).
    const notes: Row[] = words.length
      ? (projects.data ?? [])
          .filter((p) => matches(`new note in ${p.name}`))
          .map((p) => ({ key: `n:${p.id}`, label: `New note in ${p.name}`, run: () => quickNoteIn(p.id) }))
      : [];
    const things: Row[] = (found.data ?? []).map((r) => ({
      key: `r:${r.url}`,
      label: r.title,
      detail: [KIND_LABEL[r.kind], r.context].filter(Boolean).join(" · "),
      run: () => {
        const route = appRoute(r.url);
        if (route !== null) go(route);
        else window.open(r.url.startsWith("plms:") ? (plmsWebUrl(r.url) ?? r.url) : r.url, "_blank", "noopener");
      },
    }));
    return [...own, ...notes, ...(words.length ? things : [])];
  }, [q, commands, projects.data, found.data, go, quickNoteIn]);

  useEffect(() => setAt(0), [q]);

  const choose = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    row.run();
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.palette} role="dialog" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className={styles.input}
          placeholder="Go to, make, or find anything…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setAt((i) => Math.min(i + 1, rows.length - 1)));
            else if (e.key === "ArrowUp") (e.preventDefault(), setAt((i) => Math.max(i - 1, 0)));
            else if (e.key === "Enter") (e.preventDefault(), choose(rows[at]));
            else if (e.key === "Escape") (e.preventDefault(), onClose());
          }}
        />
        <ul className={styles.list} role="listbox">
          {rows.map((r, i) => (
            <li
              key={r.key}
              role="option"
              aria-selected={i === at}
              className={i === at ? styles.active : undefined}
              onMouseMove={() => setAt(i)}
              onClick={() => choose(r)}
              ref={(el) => void (i === at && el?.scrollIntoView({ block: "nearest" }))}
            >
              <span className={styles.label}>{r.label}</span>
              {r.detail && <span className={styles.detail}>{r.detail}</span>}
            </li>
          ))}
          {q.trim() && found.isFetching && rows.length === 0 && <li className={styles.empty}>Looking…</li>}
          {q.trim() && !found.isFetching && rows.length === 0 && <li className={styles.empty}>Nothing matches.</li>}
        </ul>
      </div>
    </div>
  );
}
