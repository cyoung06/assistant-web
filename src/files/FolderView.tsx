import { useState, type MouseEvent } from "react";
import { fileUrl, kind, size, thumbUrl, useFolder, type DriveEntry } from "./api";
import { useLongPress } from "./ContextMenu";
import { ICON, type Ops } from "./Explorer";
import styles from "./FolderView.module.css";

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "");

/**
 * What's in a folder, as icons (PDFs and images previewed) or a list. A click opens (a file in a
 * preview tab; double-click keeps it), right-click or long-press shows what can be done with it,
 * and right-clicking empty space what can be put here.
 */
export function FolderView({ folder: path, view, ops }: { folder: string; view: "list" | "icons"; ops: Ops }) {
  const folder = useFolder(path);
  const entries = folder.data?.entries ?? [];
  entries.forEach((e) => ops.known.set(e.path, e));
  const empty = useLongPress((x, y) => ops.menu(x, y, null, path));
  return (
    <div
      className={view === "icons" ? styles.grid : styles.list}
      onContextMenu={(e) => (e.preventDefault(), ops.menu(e.clientX, e.clientY, null, path))}
      {...empty}
    >
      {folder.isPending && <p className={styles.note}>Loading…</p>}
      {folder.isError && <p className={styles.error}>Couldn't open this folder.</p>}
      {folder.data && entries.length === 0 && <p className={styles.note}>Nothing here yet. Drop files here to upload them, or right-click for more.</p>}
      {entries.map((e) => (view === "icons" ? <Tile key={e.path} entry={e} ops={ops} /> : <Line key={e.path} entry={e} ops={ops} />))}
    </div>
  );
}

/** What an entry does with the mouse, touch and drags (shared by tiles and list rows). */
function useEntry(e: DriveEntry, ops: Ops) {
  const menuAt = (x: number, y: number) => (ops.select(e), ops.menu(x, y, e, e.folder ? e.path : ops.at));
  const press = useLongPress(menuAt);
  return {
    "data-path": e.path,
    draggable: ops.renaming !== e.path,
    onDragStart: (ev: React.DragEvent) => ops.dragStart(ev, e),
    ...(e.folder ? ops.dropOn(e.path) : {}),
    onClick: (ev: MouseEvent) => (ev.stopPropagation(), ops.select(e), ops.open(e)),
    onDoubleClick: () => !e.folder && ops.open(e, true),
    onContextMenu: (ev: MouseEvent) => (ev.preventDefault(), ev.stopPropagation(), menuAt(ev.clientX, ev.clientY)),
    ...press,
    // A press inside isn't one on the empty space around.
    onPointerDown: (ev: React.PointerEvent) => (ev.stopPropagation(), press.onPointerDown(ev)),
  };
}

function Tile({ entry: e, ops }: { entry: DriveEntry; ops: Ops }) {
  const handlers = useEntry(e, ops);
  return (
    <div className={`${styles.tile} ${ops.selected === e.path ? styles.selected : ""} ${e.folder ? ops.targetClass(e.path) : ""}`} title={e.name} role="button" tabIndex={-1} {...handlers}>
      {kind(e) === "image" ? (
        <img className={styles.thumb} src={fileUrl(e.path)} alt="" loading="lazy" draggable={false} />
      ) : kind(e) === "pdf" ? (
        <PdfThumb entry={e} />
      ) : (
        <span className={styles.tileIcon}>{ICON[kind(e)]}</span>
      )}
      {ops.renaming === e.path ? <Rename entry={e} ops={ops} /> : <span className={styles.tileName}>{e.name}</span>}
      {!e.folder && <span className={styles.tileMeta}>{size(e.size)}</span>}
    </div>
  );
}

function Line({ entry: e, ops }: { entry: DriveEntry; ops: Ops }) {
  const handlers = useEntry(e, ops);
  return (
    <div className={`${styles.row} ${ops.selected === e.path ? styles.selected : ""} ${e.folder ? ops.targetClass(e.path) : ""}`} role="button" tabIndex={-1} {...handlers}>
      <span className={styles.icon}>{ICON[kind(e)]}</span>
      {ops.renaming === e.path ? <Rename entry={e} ops={ops} /> : <span className={styles.name}>{e.name}</span>}
      <span className={styles.meta}>{e.folder ? "" : size(e.size)}</span>
      <span className={`${styles.meta} ${styles.date}`}>{when(e.modified)}</span>
      <button
        className={styles.more}
        aria-label="More"
        onClick={(ev) => {
          ev.stopPropagation();
          const r = ev.currentTarget.getBoundingClientRect();
          ops.select(e);
          ops.menu(r.left, r.bottom + 2, e, e.folder ? e.path : ops.at);
        }}
      >
        ⋯
      </button>
    </div>
  );
}

function Rename({ entry: e, ops }: { entry: DriveEntry; ops: Ops }) {
  return (
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
  );
}

/** A PDF's first page (its icon until the preview loads, or if it can't be made). */
function PdfThumb({ entry }: { entry: DriveEntry }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={styles.tileIcon}>{ICON.pdf}</span>;
  return <img className={`${styles.thumb} ${styles.pdfThumb}`} src={thumbUrl(entry.path, entry.modified)} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />;
}
