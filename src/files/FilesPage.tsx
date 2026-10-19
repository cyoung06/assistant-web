import { useEffect, useState, type DragEvent } from "react";
import { DRIVE_DRAG, fileUrl, kind, parentOf, readOnly, thumbUrl, type Clip, size, useDriveInfo, useDriveMutations, useFolder, type DriveEntry } from "./api";
import { FileViewer } from "./FileViewer";
import styles from "./FilesPage.module.css";

const ICON: Record<ReturnType<typeof kind>, string> = { folder: "📁", pdf: "📄", image: "🖼️", video: "🎞️", audio: "🎵", text: "📝", file: "📎" };

let clipboard: Clip | null = null;

/** Where [e] goes when put into [folder]. */
const into = (folder: string, e: { name: string; folder: boolean }) => folder + e.name + (e.folder ? "/" : "");

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "");

/**
 * Projects' storage (each project's folder in the drive, with the course files PLMS puts there),
 * browsed by folder from [root]: all projects, or one project's own. [path] is a folder (ending
 * with "/"), or a file, shown over its folder. Files dropped on the page (or picked) are uploaded
 * into the folder shown. The same storage is mounted in Finder and on the devices.
 */
export function FilesPage({ path: at, go, root = "Projects/", rootName = "Files" }: { path: string; go: (path: string) => void; root?: string; rootName?: string }) {
  const viewing = at.endsWith("/") || at === "" ? null : at;
  const path = viewing ? parentOf(viewing) : at;
  const folder = useFolder(path);
  const info = useDriveInfo().data;
  const { upload, makeFolder, move, copy, remove } = useDriveMutations();
  const [clip, setClip] = useState<Clip | null>(clipboard);
  const keep = (c: Clip | null) => ((clipboard = c), setClip(c));
  const [target, setTarget] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [connect, setConnect] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<"list" | "icons">(() => (localStorage.getItem("files.view") === "icons" ? "icons" : "list"));
  const [tree, setTree] = useState(() => localStorage.getItem("files.tree") !== "off");
  useEffect(() => localStorage.setItem("files.view", view), [view]);
  useEffect(() => localStorage.setItem("files.tree", tree ? "on" : "off"), [tree]);

  // From the top shown ([root]: all projects' storage, or one project's).
  const parts = path.slice(root.length).split("/").filter(Boolean);
  const run = (p: Promise<unknown>) => p.catch((e: Error) => setError(e.message));
  const send = (files: File[]) => files.length && run(upload.mutateAsync({ folder: path, files }));
  // Project folders (Projects/<name>/) follow their projects: they're renamed by renaming the project.
  // Course files from PLMS stay as PLMS has them.
  const fixed = (e: DriveEntry) => (e.path.split("/").filter(Boolean).length <= 2 && e.path.startsWith("Projects/")) || readOnly(e.path);
  const locked = readOnly(path);

  // A folder's address written without its "/": open the folder.
  const entry = viewing ? folder.data?.entries.find((e) => e.path.replace(/\/$/, "") === viewing) : undefined;
  useEffect(() => {
    if (entry?.folder) go(entry.path);
  }, [entry, go]);
  const files = folder.data?.entries.filter((e) => !e.folder) ?? [];

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!e.dataTransfer.types.includes(DRIVE_DRAG) && !locked) send([...e.dataTransfer.files]);
  };

  /** Puts a dragged or pasted entry into [folder]: moved, or copied (⌥/Alt while dropping, or a copied clip). */
  const put = (folder: string, item: Clip) => {
    if (folder.startsWith(item.path) || parentOf(item.path) === folder) return; // Into itself, or where it already is.
    run(item.cut ? move.mutateAsync({ from: item.path, to: into(folder, item) }) : copy.mutateAsync({ from: item.path, to: into(folder, item) }));
  };
  /** Dragging an entry: within the app it moves (or copies); to the desktop (Chrome) it downloads. */
  const dragStart = (ev: DragEvent, e: DriveEntry) => {
    ev.dataTransfer.setData(DRIVE_DRAG, JSON.stringify({ path: e.path, name: e.name, folder: e.folder }));
    if (!e.folder) ev.dataTransfer.setData("DownloadURL", `${e.contentType ?? "application/octet-stream"}:${e.name}:${location.origin}${fileUrl(e.path)}`);
    ev.dataTransfer.effectAllowed = fixed(e) ? "copy" : "copyMove";
  };
  /** A folder that takes dropped entries (and files from the computer, uploaded into it). */
  const dropOn = (folder: string) => (readOnly(folder) ? {} : {
    onDragOver: (ev: DragEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.dataTransfer.dropEffect = ev.altKey || ev.dataTransfer.effectAllowed === "copy" ? "copy" : "move";
      setTarget(folder);
    },
    onDragLeave: () => setTarget((t) => (t === folder ? null : t)),
    onDrop: (ev: DragEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      setTarget(null);
      setOver(false);
      const raw = ev.dataTransfer.getData(DRIVE_DRAG);
      if (raw) put(folder, { ...JSON.parse(raw), cut: !(ev.altKey || ev.dataTransfer.effectAllowed === "copy") });
      else if (ev.dataTransfer.files.length) run(upload.mutateAsync({ folder, files: [...ev.dataTransfer.files] }));
    },
  }) as object;
  const targetClass = (folder: string) => (target === folder ? (styles.target ?? "") : "");

  return (
    <div
      className={`${styles.page} ${over ? styles.over : ""}`}
      data-own-drop
      onDragOver={(e) => (e.preventDefault(), setOver(!locked))}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={onDrop}
    >
      <div className={styles.head}>
        {path !== root && path.startsWith(root) && (
          <button className={`btn btn-ghost ${styles.back}`} onClick={() => go(parentOf(path))} title="Up to the folder this is in" aria-label="Back">
            ‹
          </button>
        )}
        <nav className={styles.crumbs} aria-label="Folder">
          <button className={targetClass(root)} onClick={() => go(root)} {...dropOn(root)}>
            {rootName}
          </button>
          {parts.map((p, i) => (
            <span key={i}>
              <span className={styles.sep}>›</span>
              <button className={targetClass(root + parts.slice(0, i + 1).join("/") + "/")} onClick={() => go(root + parts.slice(0, i + 1).join("/") + "/")} {...dropOn(root + parts.slice(0, i + 1).join("/") + "/")}>
                {p}
              </button>
            </span>
          ))}
        </nav>
        <span className={styles.spacer} />
        {upload.isPending && <span className={styles.note}>Uploading…</span>}
        {locked && <span className={styles.note}>From PLMS · read-only (copy files out to write on them)</span>}
        {clip && !locked && (
          <span className={styles.clip}>
            <button className="btn" onClick={() => (put(path, clip), clip.cut && keep(null))} title={`${clip.cut ? "Move" : "Copy"} ${clip.name} here`}>
              Paste “{clip.name}”
            </button>
            <button className="btn btn-ghost" onClick={() => keep(null)} aria-label="Clear clipboard">
              ×
            </button>
          </span>
        )}
        <label className={`btn ${locked ? styles.disabled : ""}`}>
          Upload
          <input type="file" multiple hidden disabled={locked} onChange={(e) => (send([...(e.target.files ?? [])]), (e.target.value = ""))} />
        </label>
        <button
          className="btn"
          disabled={locked}
          onClick={() => {
            const name = prompt("Folder name")?.trim();
            if (name) run(makeFolder.mutateAsync(path + name.replace(/\//g, " ")));
          }}
        >
          New folder
        </button>
        <span className={styles.toggle} role="group" aria-label="View">
          <button className={tree ? styles.on : ""} title="Folder tree" onClick={() => setTree((t) => !t)}>
            Tree
          </button>
          <button className={view === "list" ? styles.on : ""} title="List" onClick={() => setView("list")}>
            List
          </button>
          <button className={view === "icons" ? styles.on : ""} title="Icons" onClick={() => setView("icons")}>
            Icons
          </button>
        </span>
        <button className="btn btn-ghost" onClick={() => setConnect((c) => !c)}>
          Open on Mac…
        </button>
      </div>
      {connect && info && (
        <div className={styles.connect}>
          In Finder: <b>Go → Connect to Server</b> (⌘K), enter <code>{info.url}</code>, and sign in as <code>{info.username}</code> with the drive's password. It
          mounts like a disk; course files from PLMS appear in each course's folder.
        </div>
      )}
      {error && (
        <p className={styles.error} onClick={() => setError(null)}>
          {error}
        </p>
      )}

      <div className={styles.body}>
      {tree && (
        <nav className={styles.tree} aria-label="Folders">
          <TreeNode path={root} name={rootName} depth={0} current={path} go={go} dropOn={dropOn} targetClass={targetClass} />
        </nav>
      )}
      {view === "icons" ? (
        <div className={styles.grid}>
          {folder.isPending && <p className={styles.note}>Loading…</p>}
          {folder.data && folder.data.entries.length === 0 && <p className={styles.note}>Nothing here yet. Drop files here to upload them.</p>}
          {folder.data?.entries.map((e) =>
            e.folder ? (
              <button key={e.path} className={`${styles.tile} ${targetClass(e.path)}`} onClick={() => go(e.path)} title={e.name} draggable onDragStart={(ev) => dragStart(ev, e)} {...dropOn(e.path)}>
                <span className={styles.tileIcon}>{ICON.folder}</span>
                <span className={styles.tileName}>{e.name}</span>
              </button>
            ) : (
              <button key={e.path} className={styles.tile} onClick={() => go(e.path)} title={e.name} draggable onDragStart={(ev) => dragStart(ev, e)}>
                {kind(e) === "image" ? (
                  <img className={styles.thumb} src={fileUrl(e.path)} alt="" loading="lazy" />
                ) : kind(e) === "pdf" ? (
                  <PdfThumb entry={e} />
                ) : (
                  <span className={styles.tileIcon}>{ICON[kind(e)]}</span>
                )}
                <span className={styles.tileName}>{e.name}</span>
                <span className={styles.tileMeta}>{size(e.size)}</span>
              </button>
            ),
          )}
        </div>
      ) : (
      <div className={styles.list}>
        {folder.isPending && <p className={styles.note}>Loading…</p>}
        {folder.isError && <p className={styles.error}>Couldn't open this folder.</p>}
        {folder.data && folder.data.entries.length === 0 && <p className={styles.note}>Nothing here yet. Drop files here to upload them.</p>}
        {folder.data?.entries.map((e) => (
          <div key={e.path} className={`${styles.row} ${e.folder ? targetClass(e.path) : ""}`} draggable={renaming !== e.path} onDragStart={(ev) => dragStart(ev, e)} {...(e.folder ? dropOn(e.path) : {})}>
            <span className={styles.icon}>{ICON[kind(e)]}</span>
            {renaming === e.path ? (
              <input
                className={`input ${styles.rename}`}
                autoFocus
                defaultValue={e.name}
                onBlur={(ev) => {
                  const name = ev.target.value.trim().replace(/\//g, " ");
                  setRenaming(null);
                  if (name && name !== e.name) run(move.mutateAsync({ from: e.path, to: path + name + (e.folder ? "/" : "") }));
                }}
                onKeyDown={(ev) => (ev.key === "Enter" ? ev.currentTarget.blur() : ev.key === "Escape" && setRenaming(null))}
              />
            ) : e.folder ? (
              <button className={styles.name} onClick={() => go(e.path)}>
                {e.name}
              </button>
            ) : (
              <button className={styles.name} onClick={() => go(e.path)}>
                {e.name}
              </button>
            )}
            <span className={styles.meta}>{e.folder ? "" : size(e.size)}</span>
            <span className={styles.meta}>{when(e.modified)}</span>
            <span className={styles.actions}>
              {!e.folder && (
                <a className="btn btn-ghost" href={fileUrl(e.path)} download={e.name}>
                  Download
                </a>
              )}
              <button className="btn btn-ghost" onClick={() => keep({ path: e.path, name: e.name, folder: e.folder, cut: false })} title="Copy, to paste into another folder">
                Copy
              </button>
              {!fixed(e) && confirm !== e.path && (
                <button className="btn btn-ghost" onClick={() => keep({ path: e.path, name: e.name, folder: e.folder, cut: true })} title="Cut, to move into another folder">
                  Cut
                </button>
              )}
              {!fixed(e) &&
                (confirm === e.path ? (
                  <>
                    <button className="btn btn-danger" onClick={() => (setConfirm(null), run(remove.mutateAsync(e.path)))}>
                      Delete{e.folder ? " folder" : ""}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setConfirm(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-ghost" onClick={() => setRenaming(e.path)}>
                      Rename
                    </button>
                    <button className="btn btn-ghost" onClick={() => setConfirm(e.path)}>
                      Delete
                    </button>
                  </>
                ))}
            </span>
          </div>
        ))}
      </div>
      )}
      </div>
      {viewing && !entry?.folder && (
        <FileViewer path={viewing} entry={entry} files={files} go={go} close={() => go(path)} />
      )}
      {over && <div className={styles.dropHint}>Drop to upload into {parts.at(-1) ?? rootName}</div>}
    </div>
  );
}

/** A PDF's first page (its icon until the preview loads, or if it can't be made). */
function PdfThumb({ entry }: { entry: DriveEntry }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={styles.tileIcon}>{ICON.pdf}</span>;
  return <img className={`${styles.thumb} ${styles.pdfThumb}`} src={thumbUrl(entry.path, entry.modified)} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

/** One folder in the tree: click to open it, the arrow to show what's inside (remembered). */
type Drops = { dropOn: (folder: string) => object; targetClass: (folder: string) => string };

function TreeNode({ path, name, depth, current, go, ...drops }: { path: string; name: string; depth: number; current: string; go: (path: string) => void } & Drops) {
  const key = `files.open.${path}`;
  const [open, setOpen] = useState(() => depth === 0 || current.startsWith(path) || localStorage.getItem(key) === "1");
  useEffect(() => {
    if (current.startsWith(path) && path !== current) setOpen(true);
  }, [current, path]);
  const children = useFolder(path, open);
  const folders = children.data?.entries.filter((e) => e.folder) ?? [];
  const toggle = () => {
    setOpen((o) => !o);
    localStorage.setItem(key, open ? "0" : "1");
  };
  return (
    <div>
      <div className={`${styles.treeRow} ${current === path ? styles.treeOn : ""} ${drops.targetClass(path)}`} style={{ paddingLeft: 6 + depth * 14 }} {...drops.dropOn(path)}>
        <button className={styles.arrow} onClick={toggle} aria-label={open ? "Collapse" : "Expand"}>
          {open ? "▾" : "▸"}
        </button>
        <button className={styles.treeName} onClick={() => go(path)} title={name}>
          {name}
        </button>
      </div>
      {open && folders.map((f) => <TreeNode key={f.path} path={f.path} name={f.name} depth={depth + 1} current={current} go={go} {...drops} />)}
    </div>
  );
}
