import { autocompletion, closeBrackets, closeBracketsKeymap, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { defaultKeymap, indentLess, indentMore } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder, type Command } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { fileUrl, parentOf, readOnly, size, type DriveEntry } from "../files/api";
import { loadCore, type Core, type Edit, type SlashItem } from "./core";
import { freshNotes } from "./fresh";
import { keepEpoch, openKept } from "../sync/kept";
import { darkChanged, livePreview } from "./livePreview";
import styles from "./NoteEditor.module.css";
import type { NoteStatus as Status, NoteStore } from "./store";
import { webStore } from "./webStore";

const STATUS: Record<Status, string> = {
  loading: "Opening…",
  live: "Live",
  connecting: "Connecting…",
  offline: "Offline (edits kept)",
  error: "Couldn't open",
  readonly: "Read-only",
};

/** Code's typeface (the one the apps bundle), then the text's for what it hasn't (Hangul). */
const MONO = `"JetBrains Mono", "Pretendard Variable", Pretendard, monospace`;

/** Code and Markdown colours, from the app's own (so light and dark both work). */
const highlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "var(--text-3)" },
  { tag: t.monospace, fontFamily: MONO, fontSize: "0.9em" },
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
  (core: Core, mark: string): Command =>
  (view) => {
    if (view.state.readOnly) return false;
    const doc = view.state.doc.toString();
    view.dispatch(
      view.state.changeByRange((r) => {
        const w = core.toggleWrap(doc, r.from, r.to, mark) as Edit;
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
const slashMenu = (items: SlashItem[]) => (ctx: CompletionContext) => {
  const m = ctx.matchBefore(/(?:^|\s)\/[\w ]*$/);
  if (!m) return null;
  const slash = m.text.lastIndexOf("/") + m.from;
  const options: Completion[] = items.map((item) => ({
    label: item.label,
    detail: item.text.split("\n")[0]!.trim() || undefined,
    type: "text",
    boost: 0,
    apply: (view, _c, _from, to) => {
      view.dispatch({ changes: { from: slash, to, insert: item.text }, selection: { anchor: slash + item.cursor } });
    },
  }));
  return { from: slash + 1, options, validFor: /^[\w ]*$/, filter: true };
};


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
  ".cm-md-em": { fontStyle: "italic" },
  ".cm-md-strong": { fontWeight: "700" },
  ".cm-md-strike": { textDecoration: "line-through", color: "var(--text-3)" },
  // Its size is the highlighting's (monospace), or in a table's cells, its own.
  ".cm-md-inlineCode": { fontFamily: MONO },
  ".cm-md-tableView .cm-md-inlineCode": { fontSize: "0.9em" },
  ".cm-md-link": { color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: "2px", cursor: "pointer" },
  ".cm-md-bullet": { color: "var(--text-2)", display: "inline-block", width: "0.9em", textAlign: "center", fontWeight: "700" },
  ".cm-md-task": { margin: "0 0.45em 0 0", width: "1.05em", height: "1.05em", verticalAlign: "-0.15em", accentColor: "var(--accent)", cursor: "pointer" },
  ".cm-md-done": { color: "var(--text-3)", textDecoration: "line-through" },
  ".cm-md-quote": { borderLeft: "3px solid var(--line-strong)", paddingLeft: "14px !important", color: "var(--text-2)" },
  ".cm-md-hr": { display: "inline-block", width: "100%", height: "0", borderTop: "1px solid var(--line-strong)", verticalAlign: "middle" },
  ".cm-md-code": {
    fontFamily: MONO,
    fontSize: "0.88em",
    backgroundColor: "var(--surface-2)",
    padding: "0 14px !important",
  },
  ".cm-md-codeFirst": { borderTopLeftRadius: "8px", borderTopRightRadius: "8px", paddingTop: "4px !important" },
  ".cm-md-codeLast": { borderBottomLeftRadius: "8px", borderBottomRightRadius: "8px", paddingBottom: "4px !important" },
  ".cm-md-fence": { color: "var(--text-3)", fontSize: "0.75em" },
  ".cm-md-table": { fontFamily: MONO, fontSize: "0.88em", whiteSpace: "pre" },
  ".cm-md-tableHead": { fontWeight: "700" },
  ".cm-md-tableView": { padding: "6px 0", overflowX: "auto", cursor: "text" },
  ".cm-md-tableView table": { borderCollapse: "collapse", fontSize: "0.95em" },
  ".cm-md-tableView th, .cm-md-tableView td": { border: "1px solid var(--line-strong)", padding: "5px 12px", textAlign: "left" },
  ".cm-md-tableView th": { backgroundColor: "var(--surface-2)", fontWeight: "600" },
  ".cm-md-math": { cursor: "text" },
  ".cm-md-mathBlock": { display: "block", textAlign: "center", padding: "6px 0", overflowX: "auto" },
  ".cm-md-mathError": { color: "var(--danger)", fontFamily: MONO, fontSize: "0.9em" },
  ".cm-md-diagram": { display: "block", padding: "6px 0", overflowX: "auto", cursor: "text" },
  ".cm-md-diagram svg": { maxWidth: "100%", height: "auto" },
  ".cm-md-mathSource": { fontFamily: MONO, fontSize: "0.9em", color: "var(--accent)" },
  ".cm-tooltip.cm-md-mathTip, .cm-md-mathTip": {
    padding: "8px 12px",
    border: "1px solid var(--line)",
    borderRadius: "8px",
    backgroundColor: "var(--surface)",
    boxShadow: "var(--shadow)",
    maxWidth: "min(640px, 90vw)",
    overflowX: "auto",
  },
  ".cm-md-mathTipError": { color: "var(--danger)", fontFamily: MONO, fontSize: "13px", whiteSpace: "pre-wrap" },
  ".cm-md-mathTipEmpty": { color: "var(--text-3)", fontSize: "13px" },
  ".cm-md-image": { maxWidth: "100%", maxHeight: "60vh", borderRadius: "6px", display: "inline-block", verticalAlign: "top", cursor: "text" },
  ".cm-tooltip.cm-tooltip-autocomplete": { border: "1px solid var(--line)", borderRadius: "8px", backgroundColor: "var(--surface)", boxShadow: "var(--shadow)", overflow: "hidden" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "5px 12px !important", fontFamily: "var(--font-ui)", fontSize: "14px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--accent-soft)", color: "var(--text)" },
  ".cm-completionDetail": { color: "var(--text-3)", fontStyle: "normal", marginLeft: "12px", fontFamily: MONO, fontSize: "12px" },
  ".cm-panels": { backgroundColor: "var(--surface-2)", color: "var(--text)", borderColor: "var(--line)" },
  ".cm-searchMatch": { backgroundColor: "var(--warn)", opacity: "0.6" },
  ".cm-placeholder": { color: "var(--text-3)" },
});

/** Whether the page shows dark (the app's theme, or the system's when it follows that). */
function pageIsDark() {
  const theme = document.documentElement.dataset.theme;
  return theme === "dark" || (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

/** Calls [changed] whenever the page turns light or dark; returns a stop. */
function watchDark(changed: (dark: boolean) => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const tell = () => changed(pageIsDark());
  const attr = new MutationObserver(tell);
  attr.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  media.addEventListener("change", tell);
  return () => {
    attr.disconnect();
    media.removeEventListener("change", tell);
  };
}

/** Where notes are edited live (the API's y-websocket endpoint; the note is the `doc` parameter). */
const syncUrl = () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/v1`;

/**
 * A Markdown note (with $…$ and $$…$$ math, and Mermaid diagrams) from the drive. It opens to read,
 * rendered; Edit to write in it, where it reads as rendered except where the cursor is. It's edited
 * live: every device with it open shows the others' edits as they're typed (Yjs), and the server
 * writes the file a second after edits stop. Course files only read.
 */
export default function NoteEditor({ path, entry, openPath }: { path: string; entry?: DriveEntry; openPath: (path: string) => void }) {
  const qc = useQueryClient();
  const openRef = useRef(openPath);
  openRef.current = openPath;
  const store = useMemo(() => webStore(qc, (p) => openRef.current(p)), [qc]);
  return <Note path={path} store={store} locked={readOnly(path)} entry={entry} />;
}

/** A note: edited live, or (course files) only read through [store]. */
function Note({ path, store, locked, entry }: { path: string; store: NoteStore; locked: boolean; entry?: DriveEntry }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  /** Opened (there's a note to edit). */
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState(false);
  const controls = useRef<{ setEditing: (on: boolean) => void; setSource: (on: boolean) => void } | null>(null);

  useEffect(() => {
    let alive = true;
    let view: EditorView | null = null;
    let core: Core | null = null;
    let source = false;
    const folder = parentOf(path);
    /** Reading (rendered, nothing to type into) or writing. */
    const access = new Compartment();
    /** The live preview, or (Source) none. */
    const mode = new Compartment();
    const set = (s: Status) => alive && setStatus(s);

    /** Uploads images (pasted or dropped) next to the note, in attachments/, and links them at [at]. */
    const insertImages = async (files: File[], at: number) => {
      if (!view || locked) return;
      const links: string[] = [];
      for (const f of files) {
        try {
          links.push(`![](${await store.uploadImage(path, f)})`);
        } catch (e) {
          setError((e as Error).message);
        }
      }
      if (!links.length || !view) return;
      const pos = Math.min(at, view.state.doc.length);
      const lineStart = view.state.doc.lineAt(pos).from === pos;
      const insert = (lineStart ? "" : "\n") + links.join("\n") + "\n";
      view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + insert.length } });
    };
    const imagesIn = (data: DataTransfer | null) => [...(data?.files ?? [])].filter((f) => f.type.startsWith("image/"));

    const live = (): Extension => (source || !core ? [] : livePreview(core, folder, (href, p) => store.openLink(href, p), (p) => store.imageSrc(p), pageIsDark()));
    const writable = (on: boolean): Extension => [EditorState.readOnly.of(!on), EditorView.editable.of(on)];

    /** Reading or writing. */
    const edit = (on: boolean) => {
      if (!view || (on && locked)) return;
      view.dispatch({ effects: access.reconfigure(writable(on)) });
      if (alive) setEditing(on);
      if (on) view.focus();
    };

    /** The editor, on [text] (and, edited live, bound to [shared]). */
    const show = (c: Core, text: string, shared: Extension, fresh: boolean) => {
      if (!alive || !host.current) return;
      core = c;
      view = new EditorView({
        parent: host.current,
        state: EditorState.create({
          doc: text,
          extensions: [
            drawSelection(),
            EditorView.lineWrapping,
            markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
            markdownLanguage.data.of({ closeBrackets: { brackets: ["(", "[", "{", "$", "`"] } }),
            closeBrackets(),
            syntaxHighlighting(highlight),
            search({ top: true }),
            highlightSelectionMatches(),
            autocompletion({ override: [slashMenu(c.slashItems() as SlashItem[])], icons: false, defaultKeymap: true }),
            placeholder("Write, or type / for blocks…"),
            shared,
            keymap.of([
              { key: "Mod-b", run: wrap(c, "**") },
              { key: "Mod-i", run: wrap(c, "*") },
              { key: "Mod-k", run: link },
              { key: "Tab", run: indentMore, shift: indentLess },
              ...closeBracketsKeymap,
              ...searchKeymap,
              ...defaultKeymap,
            ]),
            access.of(writable(fresh)),
            theme,
            mode.of(live()),
            EditorView.domEventHandlers({
              paste: (e, v) => {
                const files = imagesIn(e.clipboardData);
                if (!files.length || v.state.readOnly) return false;
                e.preventDefault();
                void insertImages(files, v.state.selection.main.head);
                return true;
              },
              drop: (e, v) => {
                const files = imagesIn(e.dataTransfer);
                if (!files.length || v.state.readOnly) return false;
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
      setReady(true);
      if (fresh) {
        setEditing(true);
        const first = view.state.doc.line(1);
        const title = /^#\s+/.exec(first.text);
        view.dispatch({ selection: title ? EditorSelection.range(first.from + title[0].length, first.to) : EditorSelection.cursor(first.to) });
        view.focus();
      }
    };

    let provider: WebsocketProvider | null = null;
    let local: IndexeddbPersistence | null = null;
    const ydoc = new Y.Doc();
    if (locked) {
      // Course files: read as they are, nothing to sync.
      Promise.all([store.read(path), loadCore()])
        .then(([{ text }, c]) => {
          set("readonly");
          show(c, text, [], false);
        })
        .catch((e: Error) => (setError(e.message), set("error")));
    } else {
      const ytext = ydoc.getText("note");
      const undo = new Y.UndoManager(ytext);
      // As this browser last had it (shown at once, offline too); what's changed since comes from the server.
      void openKept(path, ydoc).then((l) => {
        if (!alive) return void l.destroy();
        local = l;
        provider = new WebsocketProvider(syncUrl(), "sync", ydoc, { params: { doc: path } });
        const p = provider;
        // Who this is, beside its cursor on the other devices.
        p.awareness.setLocalStateField("user", { name: "Web", color: "#7d9cff", colorLight: "#7d9cff33" });
        p.on("status", ({ status: s }: { status: string }) => {
          if (view) set(s === "connected" ? "live" : s === "connecting" ? "connecting" : "offline");
        });
        p.on("connection-close", (e: CloseEvent | null) => {
          // Refused (not a note that can be edited live, or gone): no point trying again.
          if (e?.code === 1008) {
            p.disconnect();
            // Moved or deleted: what's kept here is no one's now.
            void l.clearData();
            setError(e.reason || "This note can't be opened");
            set("error");
          }
        });
        // The editor once the note is here: kept in this browser, or come from the server (an empty one
        // until then would look like an empty note).
        let showing = false;
        const synced = (isSynced: boolean) => {
          if (!isSynced || view || showing) return;
          showing = true;
          p.off("sync", synced);
          void loadCore()
            .then((c) => {
              show(c, ytext.toString(), [yCollab(ytext, p.awareness, { undoManager: undo }), keymap.of(yUndoManagerKeymap)], freshNotes.delete(path));
              set(p.wsconnected ? "live" : "offline");
            })
            .catch((e: Error) => (setError(e.message), set("error")));
        };
        p.on("sync", synced);
        p.on("sync", (isSynced: boolean) => isSynced && void keepEpoch(path, l));
        void l.whenSynced.then(() => {
          if (ytext.length > 0) synced(true);
        });
      });
    }
    const unwatchDark = watchDark((dark) => view?.dispatch({ effects: darkChanged.of(dark) }));

    controls.current = {
      setEditing: edit,
      setSource: (on) => {
        source = on;
        view?.dispatch({ effects: mode.reconfigure(live()) });
      },
    };

    return () => {
      alive = false;
      unwatchDark();
      provider?.destroy();
      void local?.destroy();
      ydoc.destroy();
      view?.destroy();
    };
  }, [path, locked, store]);

  return (
    <div className={styles.note}>
      <div className={styles.bar}>
        <span className={`${styles.status} ${status === "error" || status === "offline" ? styles.bad : ""}`} title={error ?? undefined}>
          {STATUS[status]}
        </span>
        {entry && <span className={styles.meta}>{size(entry.size)}</span>}
        <span className={styles.spacer} />
        {editing && (
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
        )}
        <a className="btn btn-ghost" href={fileUrl(path)} download={path.split("/").pop()}>
          Download
        </a>
        {!locked && ready && (
          <button className={editing ? "btn btn-primary" : "btn"} onClick={() => controls.current?.setEditing(!editing)}>
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>
      {status === "error" && error && <div className={`${styles.banner} ${styles.bad}`}>{error}</div>}
      {locked && <div className={styles.banner}>From PLMS, kept as it is there. Copy it out of Course files to write in it.</div>}
      <div ref={host} className={styles.editor} />
    </div>
  );
}
