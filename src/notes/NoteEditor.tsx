import { autocompletion, closeBrackets, closeBracketsKeymap, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Annotation, Compartment, EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder, type Command } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useQueryClient } from "@tanstack/react-query";
import "katex/dist/katex.min.css";
import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { fileUrl, freeName, parentOf, readOnly, size, type DriveEntry } from "../files/api";
import { freshNotes } from "./fresh";
import { livePreview } from "./livePreview";
import { applyTemplate, pastedName, relativeTo, SLASH_ITEMS, toggleWrap } from "./md";
import styles from "./NoteEditor.module.css";

type Status = "loading" | "saved" | "unsaved" | "saving" | "error" | "conflict" | "readonly";

const STATUS: Record<Status, string> = {
  loading: "Opening…",
  saved: "Saved",
  unsaved: "Edited",
  saving: "Saving…",
  error: "Couldn't save",
  conflict: "Changed elsewhere",
  readonly: "Read-only",
};

/** Code and Markdown colours, from the app's own (so light and dark both work). */
const highlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "var(--text-3)" },
  { tag: t.monospace, fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)", fontSize: "0.9em" },
  { tag: t.link, color: "var(--accent)" },
  { tag: t.url, color: "var(--text-3)" },
  { tag: [t.processingInstruction, t.contentSeparator, t.meta], color: "var(--text-3)" },
  { tag: t.quote, color: "var(--text-2)" },
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword], color: "var(--accent)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--ok)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--warn)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--text-3)", fontStyle: "italic" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--danger)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--text)", fontWeight: "600" },
]);

/** Toggles [mark] around each selection (⌘B, ⌘I). */
const wrap =
  (mark: string): Command =>
  (view) => {
    if (view.state.readOnly) return false;
    const doc = view.state.doc.toString();
    view.dispatch(
      view.state.changeByRange((r) => {
        const w = toggleWrap(doc, r.from, r.to, mark);
        return { changes: w.changes, range: EditorSelection.range(w.anchor, w.head) };
      }),
    );
    return true;
  };

/** ⌘K: the selection as a link's text, with its address selected to type. */
const link: Command = (view) => {
  if (view.state.readOnly) return false;
  const r = view.state.selection.main;
  const label = view.state.sliceDoc(r.from, r.to) || "link";
  const insert = `[${label}](https://)`;
  const urlAt = r.from + label.length + 3;
  view.dispatch({ changes: { from: r.from, to: r.to, insert }, selection: EditorSelection.range(urlAt, urlAt + 8) });
  return true;
};

/** The "/" menu: typing "/" at the start of a line or after a space offers blocks to insert. */
function slashMenu(ctx: CompletionContext) {
  const m = ctx.matchBefore(/(?:^|\s)\/[\w ]*$/);
  if (!m) return null;
  const slash = m.text.lastIndexOf("/") + m.from;
  const options: Completion[] = SLASH_ITEMS.map((item) => ({
    label: item.label,
    detail: item.template.split("\n")[0]!.replace("|", "").trim() || undefined,
    type: "text",
    boost: 0,
    apply: (view, _c, _from, to) => {
      const { text, cursor } = applyTemplate(item.template);
      view.dispatch({ changes: { from: slash, to, insert: text }, selection: { anchor: slash + cursor } });
    },
  }));
  return { from: slash + 1, options, validFor: /^[\w ]*$/, filter: true };
}

/** The editor's look: a readable column, sized headings, rendered pieces. */
const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "16px", backgroundColor: "var(--surface)", color: "var(--text)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-ui)", lineHeight: "1.65", overflow: "auto" },
  ".cm-content": { maxWidth: "760px", margin: "0 auto", padding: "28px 24px 40vh", caretColor: "var(--text)" },
  ".cm-line": { padding: "0 2px" },
  ".cm-cursor": { borderLeftColor: "var(--text)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--accent-soft) !important" },
  ".cm-md-h": { fontWeight: "700", lineHeight: "1.3" },
  ".cm-md-h1": { fontSize: "1.9em", paddingTop: "0.6em", paddingBottom: "0.15em" },
  ".cm-md-h2": { fontSize: "1.5em", paddingTop: "0.55em", paddingBottom: "0.1em" },
  ".cm-md-h3": { fontSize: "1.25em", paddingTop: "0.45em" },
  ".cm-md-h4, .cm-md-h5, .cm-md-h6": { fontSize: "1.05em", paddingTop: "0.35em" },
  ".cm-md-link": { color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: "2px", cursor: "pointer" },
  ".cm-md-bullet": { color: "var(--text-2)", display: "inline-block", width: "0.9em", textAlign: "center", fontWeight: "700" },
  ".cm-md-task": { margin: "0 0.45em 0 0", width: "1.05em", height: "1.05em", verticalAlign: "-0.15em", accentColor: "var(--accent)", cursor: "pointer" },
  ".cm-md-done": { color: "var(--text-3)", textDecoration: "line-through" },
  ".cm-md-quote": { borderLeft: "3px solid var(--line-strong)", paddingLeft: "14px !important", color: "var(--text-2)" },
  ".cm-md-hr": { display: "inline-block", width: "100%", height: "0", borderTop: "1px solid var(--line-strong)", verticalAlign: "middle" },
  ".cm-md-code": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "0.88em",
    backgroundColor: "var(--surface-2)",
    padding: "0 14px !important",
  },
  ".cm-md-codeFirst": { borderTopLeftRadius: "8px", borderTopRightRadius: "8px", paddingTop: "4px !important" },
  ".cm-md-codeLast": { borderBottomLeftRadius: "8px", borderBottomRightRadius: "8px", paddingBottom: "4px !important" },
  ".cm-md-fence": { color: "var(--text-3)", fontSize: "0.75em" },
  ".cm-md-table": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.88em", whiteSpace: "pre" },
  ".cm-md-tableHead": { fontWeight: "700" },
  ".cm-md-tableView": { padding: "6px 0", overflowX: "auto", cursor: "text" },
  ".cm-md-tableView table": { borderCollapse: "collapse", fontSize: "0.95em" },
  ".cm-md-tableView th, .cm-md-tableView td": { border: "1px solid var(--line-strong)", padding: "5px 12px", textAlign: "left" },
  ".cm-md-tableView th": { backgroundColor: "var(--surface-2)", fontWeight: "600" },
  ".cm-md-math": { cursor: "text" },
  ".cm-md-mathBlock": { display: "block", textAlign: "center", padding: "6px 0", overflowX: "auto" },
  ".cm-md-mathSource": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.9em", color: "var(--accent)" },
  ".cm-md-image": { maxWidth: "100%", maxHeight: "60vh", borderRadius: "6px", display: "inline-block", verticalAlign: "top", cursor: "text" },
  ".cm-tooltip.cm-tooltip-autocomplete": { border: "1px solid var(--line)", borderRadius: "8px", backgroundColor: "var(--surface)", boxShadow: "var(--shadow)", overflow: "hidden" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "5px 12px !important", fontFamily: "var(--font-ui)", fontSize: "14px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--accent-soft)", color: "var(--text)" },
  ".cm-completionDetail": { color: "var(--text-3)", fontStyle: "normal", marginLeft: "12px", fontFamily: "ui-monospace, monospace", fontSize: "12px" },
  ".cm-panels": { backgroundColor: "var(--surface-2)", color: "var(--text)", borderColor: "var(--line)" },
  ".cm-searchMatch": { backgroundColor: "var(--warn)", opacity: "0.6" },
  ".cm-placeholder": { color: "var(--text-3)" },
});

/** Changes that aren't typing (another version loaded): not saved back. */
const loaded = Annotation.define<boolean>();

/** What the editor needs from the server: the file's version (an ETag, or its modified time from the folder listing). */
type Version = { etag: string | null; modified: string | null };

async function listed(path: string): Promise<(DriveEntry & { etag?: string | null }) | undefined> {
  const res = await api.GET("/api/v1/drive/folder", { params: { query: { path: parentOf(path) } } });
  return res.data?.entries.find((e) => e.path === path);
}

/** A file as written now: its text and version. */
async function read(path: string): Promise<{ text: string; version: Version }> {
  const res = await fetch(fileUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't open the note (${res.status})`);
  const text = await res.text();
  const etag = res.headers.get("ETag");
  return { text, version: { etag, modified: etag ? null : ((await listed(path))?.modified ?? null) } };
}

/**
 * A Markdown note (with $…$ and $$…$$ math) from the drive, edited in place: it reads as rendered
 * except where the cursor is, and saves itself a second after typing stops (and on leaving). If the
 * file changed elsewhere meanwhile, nothing is overwritten: you choose. Course files only read.
 */
export default function NoteEditor({ path, entry, openPath }: { path: string; entry?: DriveEntry; openPath: (path: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const locked = readOnly(path);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const controls = useRef<{ setSource: (on: boolean) => void; retry: () => void; overwrite: () => void; loadTheirs: () => void; saveCopy: () => void } | null>(null);
  const openRef = useRef(openPath);
  openRef.current = openPath;

  useEffect(() => {
    let alive = true;
    let view: EditorView | null = null;
    let version: Version = { etag: null, modified: null };
    let dirty = false;
    let saving: Promise<void> | null = null;
    let timer: number | undefined;
    let conflicted = false;
    const folder = parentOf(path);
    const mode = new Compartment();
    const set = (s: Status) => alive && setStatus(s);

    const refreshListing = () => qc.invalidateQueries({ queryKey: ["drive", "folder", folder] });

    /** Writes the note; with [force], even over a version written elsewhere. */
    const save = async (force = false): Promise<void> => {
      if (!view || locked || (!dirty && !force) || (conflicted && !force)) return;
      if (saving) return saving.then(() => save(force));
      const text = view.state.doc.toString();
      dirty = false;
      set("saving");
      saving = (async () => {
        try {
          const headers: Record<string, string> = { "Content-Type": "text/markdown; charset=utf-8" };
          // A compressing proxy on the way marks ETags weak ("W/"); the file's own is the strong one.
          if (!force && version.etag) headers["If-Match"] = version.etag.replace(/^W\//, "");
          // Without ETags (an older server), the folder listing's modified time tells.
          if (!force && !version.etag && version.modified) {
            const now = (await listed(path))?.modified ?? null;
            if (now && now !== version.modified) throw Object.assign(new Error("conflict"), { conflict: true });
          }
          // An empty body may be refused by older servers; an empty note is a newline.
          const res = await fetch(fileUrl(path), { method: "PUT", headers, body: text || "\n", keepalive: text.length < 60_000 });
          if (res.status === 412) throw Object.assign(new Error("conflict"), { conflict: true });
          if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `Failed (${res.status})`);
          const etag = res.headers.get("ETag");
          if (etag) version = { etag, modified: null };
          else {
            const e = await listed(path);
            version = { etag: e?.etag ?? null, modified: e?.etag ? null : (e?.modified ?? null) };
          }
          conflicted = false;
          setError(null);
          set(dirty ? "unsaved" : "saved");
          void refreshListing();
        } catch (e) {
          dirty = true;
          if ((e as { conflict?: boolean }).conflict) {
            conflicted = true;
            set("conflict");
          } else {
            setError((e as Error).message);
            set("error");
          }
        } finally {
          saving = null;
        }
      })();
      return saving;
    };
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void save(), 1000);
    };

    /** Shows [text] as the note (another version, loaded), keeping the cursor where it can. */
    const replace = (text: string) => {
      if (!view) return;
      const head = Math.min(view.state.selection.main.head, text.length);
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: head }, annotations: loaded.of(true) });
      dirty = false;
    };

    /** Coming back to the page: a note not being edited shows what's there now. */
    const recheck = async () => {
      if (!view || dirty || saving || conflicted) return;
      try {
        if (version.etag) {
          const res = await fetch(fileUrl(path), { cache: "no-store", headers: { "If-None-Match": version.etag.replace(/^W\//, "") } });
          if (res.status === 304 || !res.ok) return;
          const etag = res.headers.get("ETag");
          if (etag?.replace(/^W\//, "") === version.etag.replace(/^W\//, "")) return;
          const text = await res.text();
          if (!dirty && text !== view.state.doc.toString()) replace(text);
          version = { etag, modified: null };
        } else if (version.modified) {
          const now = (await listed(path))?.modified ?? null;
          if (!now || now === version.modified) return;
          const fresh = await read(path);
          if (!dirty) (replace(fresh.text), (version = fresh.version));
        }
      } catch {
        // Offline for a moment: checked again next time.
      }
    };

    /** Uploads images (pasted or dropped) next to the note, in attachments/, and links them at [at]. */
    const insertImages = async (files: File[], at: number) => {
      if (!view || locked) return;
      const dir = folder + "attachments/";
      const links: string[] = [];
      for (const f of files) {
        try {
          const name = await freeName(dir, pastedName(f));
          const res = await fetch(fileUrl(dir + name), { method: "PUT", body: f, headers: { "Content-Type": f.type || "application/octet-stream" } });
          if (!res.ok) throw new Error(`Couldn't upload ${name} (${res.status})`);
          links.push(`![](${relativeTo(folder, dir + name)})`);
        } catch (e) {
          setError((e as Error).message);
        }
      }
      if (!links.length || !view) return;
      const pos = Math.min(at, view.state.doc.length);
      const lineStart = view.state.doc.lineAt(pos).from === pos;
      const insert = (lineStart ? "" : "\n") + links.join("\n") + "\n";
      view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + insert.length } });
      void qc.invalidateQueries({ queryKey: ["drive", "folder", dir] });
    };
    const imagesIn = (data: DataTransfer | null) => [...(data?.files ?? [])].filter((f) => f.type.startsWith("image/"));

    const live = (): Extension => livePreview(folder, (p) => openRef.current(p));

    read(path)
      .then(({ text, version: v }) => {
        if (!alive || !host.current) return;
        version = v;
        view = new EditorView({
          parent: host.current,
          state: EditorState.create({
            doc: text,
            extensions: [
              history(),
              drawSelection(),
              EditorView.lineWrapping,
              markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
              markdownLanguage.data.of({ closeBrackets: { brackets: ["(", "[", "{", "$", "`"] } }),
              closeBrackets(),
              syntaxHighlighting(highlight),
              search({ top: true }),
              highlightSelectionMatches(),
              autocompletion({ override: [slashMenu], icons: false, defaultKeymap: true }),
              placeholder("Write, or type / for blocks…"),
              keymap.of([
                { key: "Mod-b", run: wrap("**") },
                { key: "Mod-i", run: wrap("*") },
                { key: "Mod-k", run: link },
                { key: "Mod-s", run: () => (void save(), true) },
                { key: "Tab", run: indentMore, shift: indentLess },
                ...closeBracketsKeymap,
                ...searchKeymap,
                ...historyKeymap,
                ...defaultKeymap,
              ]),
              EditorState.readOnly.of(locked),
              EditorView.editable.of(!locked),
              theme,
              mode.of(live()),
              EditorView.updateListener.of((u) => {
                if (!u.docChanged || locked || u.transactions.every((tr) => tr.annotation(loaded))) return;
                dirty = true;
                if (!conflicted) (set("unsaved"), later());
              }),
              EditorView.domEventHandlers({
                blur: () => void save(),
                paste: (e, v) => {
                  const files = imagesIn(e.clipboardData);
                  if (!files.length || locked) return false;
                  e.preventDefault();
                  void insertImages(files, v.state.selection.main.head);
                  return true;
                },
                drop: (e, v) => {
                  const files = imagesIn(e.dataTransfer);
                  if (!files.length || locked) return false;
                  e.preventDefault();
                  e.stopPropagation();
                  void insertImages(files, v.posAtCoords({ x: e.clientX, y: e.clientY }) ?? v.state.selection.main.head);
                  return true;
                },
                dragover: (e) => {
                  if (imagesIn(e.dataTransfer).length || [...(e.dataTransfer?.types ?? [])].includes("Files")) e.stopPropagation();
                  return false;
                },
              }),
            ],
          }),
        });
        // For checking it in a browser while developing.
        if (import.meta.env.DEV) (window as unknown as { __noteView?: EditorView }).__noteView = view;
        set(locked ? "readonly" : "saved");
        // A note just made: its title selected, to type over.
        if (freshNotes.delete(path)) {
          const first = view.state.doc.line(1);
          const title = /^#\s+/.exec(first.text);
          view.dispatch({ selection: title ? EditorSelection.range(first.from + title[0].length, first.to) : EditorSelection.cursor(first.to) });
        }
        if (!locked) view.focus();
      })
      .catch((e: Error) => {
        setError(e.message);
        set("error");
      });

    controls.current = {
      setSource: (on) => view?.dispatch({ effects: mode.reconfigure(on ? [] : live()) }),
      retry: () => void save(),
      overwrite: () => void save(true),
      loadTheirs: () =>
        void read(path).then((fresh) => {
          replace(fresh.text);
          version = fresh.version;
          conflicted = false;
          set("saved");
        }),
      saveCopy: () =>
        void (async () => {
          if (!view) return;
          const name = path.split("/").pop()!.replace(/(\.[^.]+)?$/, " (my copy)$1");
          const free = await freeName(folder, name);
          const res = await fetch(fileUrl(folder + free), { method: "PUT", headers: { "Content-Type": "text/markdown; charset=utf-8" }, body: view.state.doc.toString() || "\n" });
          if (!res.ok) return setError(`Couldn't save the copy (${res.status})`);
          setCopied(free);
          const fresh = await read(path);
          replace(fresh.text);
          version = fresh.version;
          conflicted = false;
          set("saved");
          void refreshListing();
        })(),
    };

    const onFocus = () => void recheck();
    const onHide = () => document.visibilityState === "hidden" && void save();
    const onUnload = () => void save();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onUnload);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onUnload);
      // Leaving the note: what's unsaved goes now.
      void save();
      view?.destroy();
    };
  }, [path, locked, qc]);

  return (
    <div className={styles.note}>
      <div className={styles.bar}>
        <span className={`${styles.status} ${status === "error" || status === "conflict" ? styles.bad : ""}`} title={error ?? undefined}>
          {STATUS[status]}
        </span>
        {entry && <span className={styles.meta}>{size(entry.size)}</span>}
        <span className={styles.spacer} />
        <button
          className="btn btn-ghost"
          onClick={() => {
            controls.current?.setSource(!source);
            setSource((s) => !s);
          }}
          title={source ? "Show it rendered as you write" : "Show the Markdown as written"}
        >
          {source ? "Live preview" : "Source"}
        </button>
        <a className="btn btn-ghost" href={fileUrl(path)} download={path.split("/").pop()}>
          Download
        </a>
      </div>
      {status === "conflict" && (
        <div className={styles.banner} role="alert">
          <span>This note was changed somewhere else since you opened it.</span>
          <button className="btn" onClick={() => controls.current?.overwrite()}>
            Keep mine
          </button>
          <button className="btn" onClick={() => controls.current?.loadTheirs()}>
            Load theirs
          </button>
          <button className="btn" onClick={() => controls.current?.saveCopy()}>
            Save mine as a copy
          </button>
        </div>
      )}
      {copied && (
        <div className={styles.banner} onClick={() => setCopied(null)}>
          Your version was saved as “{copied}”; this is theirs.
        </div>
      )}
      {status === "error" && error && (
        <div className={`${styles.banner} ${styles.bad}`}>
          <span>{error}</span>
          <button className="btn" onClick={() => controls.current?.retry()}>
            Try again
          </button>
        </div>
      )}
      {locked && <div className={styles.banner}>From PLMS, kept as it is there. Copy it out of Course files to write in it.</div>}
      <div ref={host} className={styles.editor} />
    </div>
  );
}
