import { useEffect, useState, type DragEvent } from "react";
import { fileUrl, size, useDriveInfo, useDriveMutations, useFolder, type DriveEntry } from "./api";
import styles from "./FilesPage.module.css";

/** The kind of file, for its icon and how it opens. */
function kind(e: DriveEntry): "folder" | "pdf" | "image" | "video" | "file" {
  if (e.folder) return "folder";
  const n = e.name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|gif|webp|heic)$/.test(n)) return "image";
  if (/\.(mp4|mov|webm|mkv)$/.test(n)) return "video";
  return "file";
}

const ICON: Record<ReturnType<typeof kind>, string> = { folder: "📁", pdf: "📄", image: "🖼️", video: "🎞️", file: "📎" };

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "");

/**
 * Projects' storage (each project's folder in the drive, with the course files PLMS puts there),
 * browsed by folder from [root]: all projects, or one project's own. Files open in the browser;
 * files dropped on the page (or picked) are uploaded into the folder shown. The same storage is
 * mounted in Finder and on the devices.
 */
export function FilesPage({ path, go, root = "Projects/", rootName = "Files" }: { path: string; go: (path: string) => void; root?: string; rootName?: string }) {
  const folder = useFolder(path);
  const info = useDriveInfo().data;
  const { upload, makeFolder, move, remove } = useDriveMutations();
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
  const fixed = (e: DriveEntry) => e.path.split("/").filter(Boolean).length <= 2 && e.path.startsWith("Projects/");

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    send([...e.dataTransfer.files]);
  };

  return (
    <div
      className={`${styles.page} ${over ? styles.over : ""}`}
      data-own-drop
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={onDrop}
    >
      <div className={styles.head}>
        <nav className={styles.crumbs} aria-label="Folder">
          <button onClick={() => go(root)}>{rootName}</button>
          {parts.map((p, i) => (
            <span key={i}>
              <span className={styles.sep}>›</span>
              <button onClick={() => go(root + parts.slice(0, i + 1).join("/") + "/")}>{p}</button>
            </span>
          ))}
        </nav>
        <span className={styles.spacer} />
        {upload.isPending && <span className={styles.note}>Uploading…</span>}
        <label className="btn">
          Upload
          <input type="file" multiple hidden onChange={(e) => (send([...(e.target.files ?? [])]), (e.target.value = ""))} />
        </label>
        <button
          className="btn"
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
          <TreeNode path={root} name={rootName} depth={0} current={path} go={go} />
        </nav>
      )}
      {view === "icons" ? (
        <div className={styles.grid}>
          {folder.isPending && <p className={styles.note}>Loading…</p>}
          {folder.data && folder.data.entries.length === 0 && <p className={styles.note}>Nothing here yet. Drop files here to upload them.</p>}
          {folder.data?.entries.map((e) =>
            e.folder ? (
              <button key={e.path} className={styles.tile} onClick={() => go(e.path)} title={e.name}>
                <span className={styles.tileIcon}>{ICON.folder}</span>
                <span className={styles.tileName}>{e.name}</span>
              </button>
            ) : (
              <a key={e.path} className={styles.tile} href={fileUrl(e.path)} target="_blank" rel="noreferrer" title={e.name}>
                {kind(e) === "image" ? <img className={styles.thumb} src={fileUrl(e.path)} alt="" loading="lazy" /> : <span className={styles.tileIcon}>{ICON[kind(e)]}</span>}
                <span className={styles.tileName}>{e.name}</span>
                <span className={styles.tileMeta}>{size(e.size)}</span>
              </a>
            ),
          )}
        </div>
      ) : (
      <div className={styles.list}>
        {folder.isPending && <p className={styles.note}>Loading…</p>}
        {folder.isError && <p className={styles.error}>Couldn't open this folder.</p>}
        {folder.data && folder.data.entries.length === 0 && <p className={styles.note}>Nothing here yet. Drop files here to upload them.</p>}
        {folder.data?.entries.map((e) => (
          <div key={e.path} className={styles.row}>
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
              <a className={styles.name} href={fileUrl(e.path)} target="_blank" rel="noreferrer">
                {e.name}
              </a>
            )}
            <span className={styles.meta}>{e.folder ? "" : size(e.size)}</span>
            <span className={styles.meta}>{when(e.modified)}</span>
            <span className={styles.actions}>
              {!e.folder && (
                <a className="btn btn-ghost" href={fileUrl(e.path)} download={e.name}>
                  Download
                </a>
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
      {over && <div className={styles.dropHint}>Drop to upload into {parts.at(-1) ?? rootName}</div>}
    </div>
  );
}

/** One folder in the tree: click to open it, the arrow to show what's inside (remembered). */
function TreeNode({ path, name, depth, current, go }: { path: string; name: string; depth: number; current: string; go: (path: string) => void }) {
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
      <div className={`${styles.treeRow} ${current === path ? styles.treeOn : ""}`} style={{ paddingLeft: 6 + depth * 14 }}>
        <button className={styles.arrow} onClick={toggle} aria-label={open ? "Collapse" : "Expand"}>
          {open ? "▾" : "▸"}
        </button>
        <button className={styles.treeName} onClick={() => go(path)} title={name}>
          {name}
        </button>
      </div>
      {open && folders.map((f) => <TreeNode key={f.path} path={f.path} name={f.name} depth={depth + 1} current={current} go={go} />)}
    </div>
  );
}
