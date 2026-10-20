import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import {
  appUrl,
  DRIVE_DRAG,
  fileUrl,
  folderEntry,
  freeName,
  isFixed,
  kind,
  parentOf,
  readOnly,
  type Clip,
  type DriveEntry,
  useDriveInfo,
  useDriveMutations,
  useFolder,
  writable,
} from "./api";
import { Ask, ContextMenu, type MenuAction } from "./ContextMenu";
import { Explorer, ICON, type Ops } from "./Explorer";
import { FileViewer } from "./FileViewer";
import { FolderView } from "./FolderView";
import { drafts } from "../notes/drafts";
import { freshNotes } from "../notes/fresh";
import { flushNotes, stopNotes } from "../notes/open";
import styles from "./FilesPage.module.css";

let clipboard: Clip | null = null;

/** A file open in the pane: a preview tab (replaced by the next file previewed) until it's pinned. */
type Tab = { path: string; pinned: boolean };
/** Each storage's open tabs, kept while the app runs (switching pages and back keeps them). */
const tabsByRoot = new Map<string, Tab[]>();

/** Where [e] goes when put into [folder]. */
const into = (folder: string, e: { name: string; folder: boolean }) => folder + e.name + (e.folder ? "/" : "");
/** Renamed, moved or deleted on its own: not a project's folder, nothing in Course files. */
const changeable = (e: DriveEntry) => !isFixed(e.path) && !readOnly(e.path);
/** An entry known only by its path (a file opened from a link, say). */
const fileEntry = (path: string): DriveEntry => ({ path, name: path.split("/").pop() ?? path, folder: false, size: 0 });

function useNarrow() {
  const query = "(max-width: 640px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

const stored = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: kept until reload.
  }
};

/**
 * Projects' storage (each project's folder in the drive, with the course files PLMS puts there)
 * from [root], laid out like an editor: the folder tree on the left, and on the right the folder
 * shown, or open files in tabs. [path] is a folder (ending with "/") or a file. Right-click (or
 * long-press) anything for what can be done with it; ⌘C/⌘X/⌘V, Delete, F2 and ⌘⇧N work on what's
 * selected. On a phone it's the tree, and a file fills the screen. The same storage is mounted in
 * Finder and on the devices.
 */
export function FilesPage({ path: at, go, root = "Projects/", rootName = "Files" }: { path: string; go: (path: string) => void; root?: string; rootName?: string }) {
  const viewing = at.endsWith("/") || at === "" ? null : at;
  const path = viewing ? parentOf(viewing) : at;
  const narrow = useNarrow();
  const folder = useFolder(path);
  const info = useDriveInfo().data;
  const { upload, create, makeFolder, move, copy, remove } = useDriveMutations();
  const known = useRef(new Map<string, DriveEntry>()).current;

  const [clip, setClip] = useState<Clip | null>(clipboard);
  const keep = (c: Clip | null) => ((clipboard = c), setClip(c));
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuAction[] } | null>(null);
  const [asking, setAsking] = useState<{ title: string; initial?: string; confirm: string; danger?: boolean; done: (v: string) => void } | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [connect, setConnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "icons">(() => (stored("files.view", "list") === "icons" ? "icons" : "list"));
  const [tree, setTree] = useState(() => stored("files.tree", "on") !== "off");
  const [width, setWidth] = useState(() => Number(stored("files.treeWidth", "260")) || 260);
  useEffect(() => store("files.view", view), [view]);
  useEffect(() => store("files.tree", tree ? "on" : "off"), [tree]);

  const [tabs, setTabsState] = useState<Tab[]>(() => tabsByRoot.get(root) ?? []);
  useEffect(() => setTabsState(tabsByRoot.get(root) ?? []), [root]);
  const setTabs = useCallback(
    (change: (old: Tab[]) => Tab[]) =>
      setTabsState((old) => {
        const next = change(old);
        tabsByRoot.set(root, next);
        return next;
      }),
    [root],
  );

  const run = (p: Promise<unknown>) => p.catch((e: Error) => setError(e.message));
  const locked = readOnly(path);

  // A folder's address written without its "/": show the folder.
  const entry = viewing ? folder.data?.entries.find((e) => e.path.replace(/\/$/, "") === viewing) : undefined;
  useEffect(() => {
    if (entry?.folder) go(entry.path);
  }, [entry, go]);

  /** [path] in a tab: kept if it's open, else in the preview tab (or a new one, [pinned]). */
  const tabFor = useCallback(
    (path: string, pinned: boolean) =>
      setTabs((old) => {
        const i = old.findIndex((t) => t.path === path);
        if (i >= 0) return pinned && !old[i]?.pinned ? old.map((t, j) => (j === i ? { ...t, pinned } : t)) : old;
        const preview = old.findIndex((t) => !t.pinned);
        if (!pinned && preview >= 0) return old.map((t, j) => (j === preview ? { path, pinned } : t));
        return [...old, { path, pinned }];
      }),
    [setTabs],
  );
  // Arriving at a file (a link, back and forward): it has a tab.
  useEffect(() => {
    if (viewing && !entry?.folder) tabFor(viewing, false);
  }, [viewing, entry, tabFor]);

  const open = (e: DriveEntry, pin = false) => {
    if (!e.folder) tabFor(e.path, pin);
    go(e.path);
  };
  const closeTab = (p: string) => {
    const i = tabs.findIndex((t) => t.path === p);
    const rest = tabs.filter((t) => t.path !== p);
    setTabs(() => rest);
    if (p === viewing) go(rest[Math.min(i, rest.length - 1)]?.path ?? parentOf(p));
  };
  /** After [from] became [to] (renamed or moved; null: deleted): tabs, and what's shown, follow. */
  const moved = (from: string, to: string | null) => {
    setTabs((old) => old.flatMap((t) => (t.path.startsWith(from) ? (to === null ? [] : [{ ...t, path: to + t.path.slice(from.length) }]) : [t])));
    if (at.startsWith(from)) go(to === null ? parentOf(from) : to + at.slice(from.length));
    if (selected?.startsWith(from)) setSelected(null);
  };

  /** Before moving [path]: its open notes written (a move with something unwritten would lose it, or make the old file again). */
  const settle = async (path: string) => {
    if (!(await flushNotes(path))) throw new Error("A note there has changes that aren't saved yet (they're kept); settle them first.");
  };

  /** Puts an entry into [folder]: moved (a cut, or a drag), or copied (numbered if the name's taken). */
  const put = (folder: string, item: Clip) => {
    if (folder.startsWith(item.path)) return; // Into itself.
    if (item.cut) {
      if (parentOf(item.path) === folder) return; // Already there.
      const to = into(folder, item);
      return run(settle(item.path).then(() => move.mutateAsync({ from: item.path, to })).then(() => moved(item.path, to)));
    }
    run(copy.mutateAsync({ from: item.path, to: into(folder, item) }));
  };
  const paste = (dest: string, item: Clip) => {
    put(dest, item);
    if (item.cut) keep(null);
  };
  const uploadTo = useRef(path);
  const picker = useRef<HTMLInputElement>(null);
  const actions = {
    newFolder: (dest: string) =>
      setAsking({
        title: "New folder",
        initial: "New folder",
        confirm: "Create",
        done: (name) => run(freeName(dest, name).then((free) => makeFolder.mutateAsync(dest + free))),
      }),
    newFile: (dest: string) =>
      setAsking({
        title: "New file",
        initial: "Untitled.md",
        confirm: "Create",
        done: (typed) =>
          run(
            (async () => {
              const wanted = typed.includes(".") ? typed : typed + ".md";
              const note = /\.(md|markdown)$/i.test(wanted);
              // Not empty: a Markdown note starts with its title.
              const body = (name: string) => (note ? `# ${name.replace(/\.[^.]+$/, "")}\n\n` : "\n");
              const name = await create.mutateAsync({ folder: dest, name: wanted, body, type: note ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8" });
              open({ path: dest + name, name, folder: false, size: body(name).length }, true);
            })(),
          ),
      }),
    /** A note, made at once ("Untitled.md") and opened with its title selected to type over. */
    newNote: (dest: string) =>
      run(
        (async () => {
          const body = (name: string) => `# ${name.replace(/\.md$/, "")}\n\n`;
          const name = await create.mutateAsync({ folder: dest, name: "Untitled.md", body, type: "text/markdown; charset=utf-8" });
          freshNotes.add(dest + name);
          open({ path: dest + name, name, folder: false, size: body(name).length }, true);
        })(),
      ),
    upload: (dest: string) => ((uploadTo.current = dest), picker.current?.click()),
    remove: (e: DriveEntry) =>
      setAsking({
        title: `Delete “${e.name}”${e.folder ? " and everything in it" : ""}?`,
        confirm: "Delete",
        danger: true,
        done: () => {
          // Its open notes write nothing back (that would make it again); if the delete fails, they carry on.
          const resume = stopNotes(e.path);
          run(remove.mutateAsync(e.path).then(() => (drafts.clearUnder(e.path), moved(e.path, null)), (err) => (resume(), Promise.reject(err))));
        },
      }),
    duplicate: (e: DriveEntry) => run(copy.mutateAsync({ from: e.path, to: e.path })),
  };

  /** What can be done with [e], or (null) in the empty space of folder [here]. */
  const menuFor = (e: DriveEntry | null, here: string): MenuAction[] => {
    const dest = e ? (e.folder ? e.path : parentOf(e.path)) : here;
    const thing = e ?? folderEntry(here);
    const canPut = writable(dest);
    const canChange = e !== null && changeable(e);
    const canSiblings = e !== null && writable(parentOf(e.path)) && !readOnly(e.path);
    const items: MenuAction[] = [];
    if (e) {
      items.push({ label: "Open", hint: e.folder ? undefined : "Double-click", run: () => open(e, true) });
      items.push({ label: "Open in new tab", run: () => window.open(e.folder ? appUrl(e.path) : fileUrl(e.path), "_blank", "noopener") });
      if (!e.folder) items.push({ label: "Download", run: () => download(e) });
      items.push("-", { label: "Copy", hint: "⌘C", run: () => keep({ path: e.path, name: e.name, folder: e.folder, cut: false }) });
      if (canChange) items.push({ label: "Cut", hint: "⌘X", run: () => keep({ path: e.path, name: e.name, folder: e.folder, cut: true }) });
    } else items.push({ label: "Open in new tab", run: () => window.open(appUrl(here), "_blank", "noopener") }, "-");
    if (clip && canPut) items.push({ label: `Paste “${clip.name}”`, hint: "⌘V", run: () => paste(dest, clip) });
    if (e && canSiblings) items.push({ label: "Duplicate", run: () => actions.duplicate(e) });
    if (e && canChange) items.push("-", { label: "Rename", hint: "F2", run: () => setRenaming(e.path) }, { label: "Delete", hint: "⌫", danger: true, run: () => actions.remove(e) });
    if (canPut)
      items.push(
        "-",
        { label: "New folder", hint: "⌘⇧N", run: () => actions.newFolder(dest) },
        { label: "New note", run: () => actions.newNote(dest) },
        { label: "New file", run: () => actions.newFile(dest) },
        { label: "Upload here…", run: () => actions.upload(dest) },
      );
    items.push("-", { label: "Copy path", run: () => void navigator.clipboard?.writeText(thing.path) });
    return items;
  };
  const showMenu = (x: number, y: number, e: DriveEntry | null, here: string) => setMenu({ x, y, items: menuFor(e, here) });

  const rename = (e: DriveEntry, typed: string | null) => {
    setRenaming(null);
    const name = typed?.trim().replace(/\//g, " ");
    if (!name || name === e.name) return;
    const to = parentOf(e.path) + name + (e.folder ? "/" : "");
    run(settle(e.path).then(() => move.mutateAsync({ from: e.path, to })).then(() => moved(e.path, to)));
  };

  /** Dragging an entry: within the app it moves (or copies); to the desktop (Chrome) it downloads. */
  const dragStart = (ev: DragEvent, e: DriveEntry) => {
    ev.dataTransfer.setData(DRIVE_DRAG, JSON.stringify({ path: e.path, name: e.name, folder: e.folder }));
    if (!e.folder) ev.dataTransfer.setData("DownloadURL", `${e.contentType ?? "application/octet-stream"}:${e.name}:${location.origin}${fileUrl(e.path)}`);
    ev.dataTransfer.effectAllowed = changeable(e) ? "copyMove" : "copy";
  };
  /** A folder that takes dropped entries (and files from the computer, uploaded into it). */
  const dropOn = (folder: string): object =>
    writable(folder)
      ? {
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
        }
      : {};

  const ops: Ops = {
    at,
    selected,
    select: (e) => setSelected(e.path),
    open,
    menu: showMenu,
    renaming,
    rename,
    dropOn,
    targetClass: (folder) => (target === folder ? "drop-target" : ""),
    dragStart,
    known,
  };

  const onKey = (ev: KeyboardEvent) => {
    const t = ev.target as HTMLElement;
    if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || document.querySelector("[data-overlay]")) return;
    const mod = ev.metaKey || ev.ctrlKey;
    const key = ev.key.toLowerCase();
    const sel = selected ? known.get(selected) : undefined;
    const dest = sel ? (sel.folder ? sel.path : parentOf(sel.path)) : path;
    if (mod && ev.shiftKey && key === "n" && writable(dest)) actions.newFolder(dest);
    else if (mod && key === "c" && sel && !window.getSelection()?.toString()) keep({ path: sel.path, name: sel.name, folder: sel.folder, cut: false });
    else if (mod && key === "x" && sel && changeable(sel)) keep({ path: sel.path, name: sel.name, folder: sel.folder, cut: true });
    else if (mod && key === "v" && clip && writable(dest)) paste(dest, clip);
    else if ((key === "delete" || key === "backspace") && sel && changeable(sel)) actions.remove(sel);
    else if ((key === "f2" || (key === "enter" && !["BUTTON", "A"].includes(t.tagName))) && sel && changeable(sel)) setRenaming(sel.path);
    else if (key === "escape" && selected) setSelected(null);
    else return;
    ev.preventDefault();
    ev.stopPropagation();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!e.dataTransfer.types.includes(DRIVE_DRAG) && writable(path)) run(upload.mutateAsync({ folder: path, files: [...e.dataTransfer.files] }));
  };

  /** The divider between the tree and the pane: drag to resize (remembered). */
  const resize = (e: PointerEvent<HTMLDivElement>) => {
    const startX = e.clientX;
    const startW = width;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    let w = startW;
    const moveTo = (ev: globalThis.PointerEvent) => setWidth((w = Math.max(160, Math.min(560, startW + ev.clientX - startX))));
    el.addEventListener("pointermove", moveTo);
    el.addEventListener(
      "pointerup",
      () => {
        el.removeEventListener("pointermove", moveTo);
        store("files.treeWidth", String(Math.round(w)));
      },
      { once: true },
    );
  };

  // The end of a long path in view (on a phone the crumbs scroll sideways).
  const crumbsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = crumbsRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [at]);

  // From the top shown ([root]: all projects' storage, or one project's).
  const parts = path.slice(root.length).split("/").filter(Boolean);
  const crumb = (i: number) => root + parts.slice(0, i + 1).join("/") + "/";
  const showTree = narrow ? !viewing : tree;
  const showPane = !narrow || viewing;

  return (
    <div
      className={`${styles.page} ${over ? styles.over : ""}`}
      data-own-drop
      onKeyDown={onKey}
      onDragOver={(e) => (e.preventDefault(), setOver(writable(path) && !e.dataTransfer.types.includes(DRIVE_DRAG)))}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={onDrop}
    >
      <div className={styles.head}>
        {narrow ? (
          viewing && (
            <button className={`btn btn-ghost ${styles.back}`} onClick={() => go(path)} aria-label="Back to the folder">
              ‹
            </button>
          )
        ) : (
          <button className={`btn btn-ghost ${styles.treeToggle} ${tree ? styles.on : ""}`} onClick={() => setTree((t) => !t)} title={tree ? "Hide the folder tree" : "Show the folder tree"} aria-label="Folder tree">
            ☰
          </button>
        )}
        <nav ref={crumbsRef} className={styles.crumbs} aria-label="Folder">
          <button className={target === root ? "drop-target" : ""} onClick={() => go(root)} {...dropOn(root)}>
            {rootName}
          </button>
          {parts.map((p, i) => (
            <span key={i}>
              <span className={styles.sep}>›</span>
              <button className={target === crumb(i) ? "drop-target" : ""} onClick={() => go(crumb(i))} {...dropOn(crumb(i))}>
                {p}
              </button>
            </span>
          ))}
          {viewing && (
            <span>
              <span className={styles.sep}>›</span>
              <span className={styles.current}>{viewing.split("/").pop()}</span>
            </span>
          )}
        </nav>
        <span className={styles.spacer} />
        {upload.isPending && <span className={styles.note}>Uploading…</span>}
        {locked && <span className={styles.note}>From PLMS · read-only</span>}
        {clip && writable(path) && !viewing && (
          <span className={`${styles.clip} ${styles.wide}`}>
            <button className="btn" onClick={() => paste(path, clip)} title={`${clip.cut ? "Move" : "Copy"} ${clip.name} here`}>
              Paste “{clip.name}”
            </button>
            <button className="btn btn-ghost" onClick={() => keep(null)} aria-label="Clear clipboard">
              ×
            </button>
          </span>
        )}
        {writable(path) && !viewing && (
          <>
            <button className={`btn ${styles.wide}`} onClick={() => actions.upload(path)}>
              Upload
            </button>
            <button className={`btn ${styles.wide}`} onClick={() => actions.newFolder(path)}>
              New folder
            </button>
            <button className={`btn ${styles.wide}`} onClick={() => actions.newNote(path)}>
              New note
            </button>
          </>
        )}
        {!viewing && !narrow && (
          <span className={styles.toggle} role="group" aria-label="View">
            <button className={view === "list" ? styles.on : ""} title="List" onClick={() => setView("list")}>
              List
            </button>
            <button className={view === "icons" ? styles.on : ""} title="Icons" onClick={() => setView("icons")}>
              Icons
            </button>
          </span>
        )}
        <button
          className={`btn btn-ghost ${styles.more}`}
          aria-label="More"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const here = viewing ? (known.get(viewing) ?? fileEntry(viewing)) : null;
            setMenu({ x: r.right - 220, y: r.bottom + 4, items: [...menuFor(here, path), "-", { label: "Open on Mac…", run: () => setConnect((c) => !c) }] });
          }}
        >
          ⋯
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
        {showTree && (
          <>
            <nav className={styles.tree} style={narrow ? undefined : { width }} aria-label="Folders">
              <Explorer root={root} rootName={rootName} ops={ops} />
            </nav>
            {!narrow && <div className={styles.divider} onPointerDown={resize} role="separator" aria-orientation="vertical" aria-label="Resize the folder tree" />}
          </>
        )}
        {showPane && (
          <section className={styles.pane}>
            {!narrow && tabs.length > 0 && (
              <div className={styles.tabs} role="tablist">
                {tabs.map((t) => (
                  <TabButton
                    key={t.path}
                    tab={t}
                    active={t.path === viewing}
                    onOpen={() => go(t.path)}
                    onPin={() => tabFor(t.path, true)}
                    onClose={() => closeTab(t.path)}
                    onMenu={(x, y) =>
                      setMenu({
                        x,
                        y,
                        items: [
                          { label: "Close", run: () => closeTab(t.path) },
                          { label: "Close others", run: () => (setTabs((old) => old.filter((o) => o.path === t.path)), go(t.path)) },
                          ...(t.pinned ? [] : [{ label: "Keep open", run: () => tabFor(t.path, true) }]),
                          "-",
                          ...menuFor(known.get(t.path) ?? fileEntry(t.path), parentOf(t.path)),
                        ],
                      })
                    }
                  />
                ))}
              </div>
            )}
            {viewing && !entry?.folder ? <FileViewer key={viewing} path={viewing} entry={entry} openPath={(p) => open(known.get(p) ?? fileEntry(p), true)} /> : <FolderView folder={path} view={view} ops={ops} />}
          </section>
        )}
      </div>
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) run(upload.mutateAsync({ folder: uploadTo.current, files }));
        }}
      />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {asking && (
        <Ask
          title={asking.title}
          initial={asking.initial}
          confirm={asking.confirm}
          danger={asking.danger}
          onDone={(v) => {
            setAsking(null);
            if (v !== null) asking.done(v);
          }}
        />
      )}
      {over && <div className={styles.dropHint}>Drop to upload into {parts.at(-1) ?? rootName}</div>}
    </div>
  );
}

function download(e: DriveEntry) {
  const a = document.createElement("a");
  a.href = fileUrl(e.path);
  a.download = e.name;
  a.click();
}

/** A tab: click to show, double-click to keep it (a preview tab is replaced), middle-click or × to close. */
function TabButton({ tab, active, onOpen, onPin, onClose, onMenu }: { tab: Tab; active: boolean; onOpen: () => void; onPin: () => void; onClose: () => void; onMenu: (x: number, y: number) => void }) {
  const name = tab.path.split("/").pop() ?? tab.path;
  return (
    <div
      className={`${styles.tab} ${active ? styles.tabOn : ""} ${tab.pinned ? "" : styles.preview}`}
      role="tab"
      aria-selected={active}
      title={tab.path}
      onClick={onOpen}
      onDoubleClick={onPin}
      onAuxClick={(e) => e.button === 1 && onClose()}
      onContextMenu={(e) => (e.preventDefault(), onMenu(e.clientX, e.clientY))}
    >
      <span className={styles.tabIcon}>{ICON[kind({ name })]}</span>
      <span className={styles.tabName}>{name}</span>
      <button className={styles.tabClose} onClick={(e) => (e.stopPropagation(), onClose())} aria-label={`Close ${name}`}>
        ×
      </button>
    </div>
  );
}
