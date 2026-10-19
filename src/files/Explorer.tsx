import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { folderEntry, kind, parentOf, useFolder, type DriveEntry } from "./api";
import { useLongPress } from "./ContextMenu";
import styles from "./Explorer.module.css";

export const ICON: Record<ReturnType<typeof kind>, string> = { folder: "📁", pdf: "📄", image: "🖼️", video: "🎞️", audio: "🎵", text: "📝", file: "📎" };

/** What the tree and the folder view share with the page around them. */
export interface Ops {
  /** What's shown: a folder (ending with "/") or a file. */
  at: string;
  selected: string | null;
  select: (e: DriveEntry) => void;
  /** Opens a file (in a preview tab, or [pin]ned in its own) or a folder. */
  open: (e: DriveEntry, pin?: boolean) => void;
  /** The context menu for [e] (or for the empty space of folder [here]). */
  menu: (x: number, y: number, e: DriveEntry | null, here: string) => void;
  renaming: string | null;
  rename: (e: DriveEntry, name: string | null) => void;
  dropOn: (folder: string) => object;
  targetClass: (folder: string) => string;
  dragStart: (ev: DragEvent, e: DriveEntry) => void;
  /** Entries seen so far, by path (for the keyboard, which knows rows only by path). */
  known: Map<string, DriveEntry>;
}

const EXPANDED = "files.expanded";

function loadExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/**
 * The folder tree from [root], with the files in each folder (like an editor's explorer). Click a
 * folder to show it, a file to preview it (double-click keeps it open in a tab); right-click or
 * long-press for more. ↑/↓ move, →/← open and close folders, Space opens.
 */
export function Explorer({ root, rootName, ops }: { root: string; rootName: string; ops: Ops }) {
  const [expanded, setExpanded] = useState(loadExpanded);
  const ref = useRef<HTMLDivElement>(null);
  const set = (path: string, open: boolean) =>
    setExpanded((old) => {
      if (old.has(path) === open) return old;
      const next = new Set(old);
      if (open) next.add(path);
      else next.delete(path);
      try {
        localStorage.setItem(EXPANDED, JSON.stringify([...next]));
      } catch {
        // Private mode: kept until reload.
      }
      return next;
    });

  // What's shown is always in view: the folders it's in are open.
  useEffect(() => {
    const parts = ops.at.slice(root.length).split("/").filter(Boolean);
    const folders = parts.slice(0, ops.at.endsWith("/") ? parts.length : parts.length - 1).map((_, i) => root + parts.slice(0, i + 1).join("/") + "/");
    folders.forEach((f) => set(f, true));
  }, [ops.at, root]);
  useEffect(() => {
    if (ops.selected) ref.current?.querySelector(`[data-path="${CSS.escape(ops.selected)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [ops.selected]);

  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const rows = [...(ref.current?.querySelectorAll<HTMLElement>("[data-path]") ?? [])].map((r) => r.dataset.path!);
    const at = ops.selected ? rows.indexOf(ops.selected) : -1;
    const entry = ops.selected ? ops.known.get(ops.selected) : undefined;
    const go = (i: number) => {
      const path = rows[Math.max(0, Math.min(rows.length - 1, i))];
      const e = path === undefined ? undefined : ops.known.get(path);
      if (e) ops.select(e);
    };
    const handled = () => (e.preventDefault(), e.stopPropagation());
    if (e.key === "ArrowDown") (handled(), go(at + 1));
    else if (e.key === "ArrowUp") (handled(), go(at < 0 ? 0 : at - 1));
    else if (e.key === "Home") (handled(), go(0));
    else if (e.key === "End") (handled(), go(rows.length - 1));
    else if (e.key === "ArrowRight" && entry?.folder) (handled(), expanded.has(entry.path) || entry.path === root ? go(at + 1) : set(entry.path, true));
    else if (e.key === "ArrowLeft" && entry) {
      handled();
      if (entry.folder && expanded.has(entry.path) && entry.path !== root) set(entry.path, false);
      else go(rows.indexOf(parentOf(entry.path)));
    } else if (e.key === " " && entry) (handled(), ops.open(entry));
  };

  const top = folderEntry(root, rootName);
  ops.known.set(root, top);
  return (
    <div ref={ref} className={styles.tree} role="tree" aria-label="Files" tabIndex={0} onKeyDown={onKey} onContextMenu={(e) => e.target === e.currentTarget && (e.preventDefault(), ops.menu(e.clientX, e.clientY, null, root))}>
      <Row entry={top} depth={0} ops={ops} expanded={expanded} set={set} focus={() => ref.current?.focus({ preventScroll: true })} />
    </div>
  );
}

type RowProps = { entry: DriveEntry; depth: number; ops: Ops; expanded: Set<string>; set: (path: string, open: boolean) => void; focus: () => void };

function Row({ entry: e, depth, ops, expanded, set, focus }: RowProps) {
  const top = depth === 0;
  const open = e.folder && (top || expanded.has(e.path));
  const children = useFolder(e.path, open);
  const menuAt = (x: number, y: number) => (ops.select(e), ops.menu(x, y, e, e.folder ? e.path : parentOf(e.path)));
  const press = useLongPress(menuAt);
  const onClick = (ev: MouseEvent) => {
    ev.stopPropagation();
    focus();
    ops.select(e);
    if (!e.folder) return ops.open(e);
    // A folder: show it; clicking the one shown opens or closes it.
    if (!top && ops.at === e.path) set(e.path, !expanded.has(e.path));
    else if (!top) set(e.path, true);
    ops.open(e);
  };
  return (
    <>
      <div
        className={`${styles.row} ${top ? styles.top : ""} ${ops.at === e.path ? styles.active : ""} ${ops.selected === e.path ? styles.selected : ""} ${e.folder ? ops.targetClass(e.path) : ""}`}
        style={{ paddingLeft: top ? 8 : 4 + (depth - 1) * 14 }}
        role="treeitem"
        aria-expanded={e.folder && !top ? open : undefined}
        aria-selected={ops.selected === e.path}
        data-path={e.path}
        title={e.name}
        draggable={!top && ops.renaming !== e.path}
        onDragStart={(ev) => ops.dragStart(ev, e)}
        {...(e.folder ? ops.dropOn(e.path) : {})}
        onClick={onClick}
        onDoubleClick={() => !e.folder && ops.open(e, true)}
        onContextMenu={(ev) => (ev.preventDefault(), ev.stopPropagation(), menuAt(ev.clientX, ev.clientY))}
        {...press}
      >
        {!top &&
          (e.folder ? (
            <button className={styles.arrow} tabIndex={-1} onClick={(ev) => (ev.stopPropagation(), set(e.path, !open))} aria-label={open ? "Collapse" : "Expand"}>
              <svg className={`${styles.chevron} ${open ? styles.down : ""}`} viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <span className={styles.arrow} />
          ))}
        {!top && <span className={styles.icon}>{ICON[kind(e)]}</span>}
        {ops.renaming === e.path ? (
          <input
            className={`input ${styles.rename}`}
            autoFocus
            defaultValue={e.name}
            onClick={(ev) => ev.stopPropagation()}
            onFocus={(ev) => {
              const dot = e.folder ? -1 : ev.target.value.lastIndexOf(".");
              ev.target.setSelectionRange(0, dot > 0 ? dot : ev.target.value.length);
            }}
            onBlur={(ev) => ops.rename(e, ev.target.value)}
            onKeyDown={(ev) => {
              ev.stopPropagation();
              if (ev.key === "Enter") ev.currentTarget.blur();
              if (ev.key === "Escape") ops.rename(e, null);
            }}
          />
        ) : (
          <span className={styles.name}>{e.name}</span>
        )}
      </div>
      {open && children.isPending && (
        <div className={styles.loading} style={{ paddingLeft: 4 + depth * 14 + 18 }}>
          …
        </div>
      )}
      {open &&
        children.data?.entries.map((c) => {
          ops.known.set(c.path, c);
          return <Row key={c.path} entry={c} depth={depth + 1} ops={ops} expanded={expanded} set={set} focus={focus} />;
        })}
    </>
  );
}
