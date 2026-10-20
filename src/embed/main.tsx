import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Note, type NoteControls } from "../notes/NoteEditor";
import { pastedName } from "../notes/md";
import type { Loaded, NoteStore } from "../notes/store";
import { Bridge, hostTransport } from "./bridge";
import "../styles/global.css";
import "./embed.css";

/**
 * The note editor alone, for a native app to show in a web view from its own files. The app does
 * all reading and writing (see README.md); this page only edits.
 */

export type Theme = "light" | "dark" | "system";
export type OpenArgs = { path: string; text: string; etag: string | null; readOnly?: boolean; theme?: Theme };

/** What the host calls, as window.assistantEditor. */
export interface EditorApi {
  open(args: OpenArgs): void;
  setTheme(theme: Theme): void;
  setSource(on: boolean): void;
  /** Saves what's unsaved now (e.g. before the app goes to the background); true once it's all written (else it's kept as a draft here). */
  flush(): Promise<boolean>;
  /** A newer version the host found: shown if the note isn't being edited. */
  reloadIfUnchanged(args: { text: string; etag: string | null }): void;
  /** Android: the answer to request [id] (its JSON), or with [error], its failure. */
  _reply(id: number, json: string | null, error?: string): void;
}

const transport = hostTransport();
if (!transport) document.body.textContent = "This page is the note editor for the Assistant apps; it needs to be opened by one.";
const bridge = new Bridge(transport ?? { repliesLater: false, send: () => Promise.reject(new Error("no host")) });

const base64Of = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error ?? new Error("Couldn't read the image"));
    r.readAsDataURL(file);
  });

let onNewer: ((loaded: Loaded) => void) | null = null;
const images = new Map<string, Promise<string>>();

/** Notes through the host. */
const store: NoteStore = {
  async read(path) {
    const r = await bridge.request("load", { path });
    return { text: r.text, version: { etag: r.etag, modified: null } };
  },
  async write(path, text, version, force) {
    const r = await bridge.request("save", { path, text, etag: version.etag, force });
    return "conflict" in r ? { conflict: true } : { version: { etag: r.etag, modified: null } };
  },
  async saveCopy(path, text) {
    return (await bridge.request("saveCopy", { path, text })).name;
  },
  async uploadImage(notePath, file) {
    const r = await bridge.request("uploadImage", { notePath, name: pastedName(file), mimeType: file.type || "application/octet-stream", base64: await base64Of(file) });
    return r.relativePath;
  },
  imageSrc(path) {
    let src = images.get(path);
    if (!src) {
      src = bridge.request("readImage", { path }).then((r) => `data:${r.mimeType};base64,${r.base64}`);
      src.catch(() => images.delete(path));
      images.set(path, src);
    }
    return src;
  },
  openLink(href, path) {
    bridge.notify("openLink", path === null ? { href } : { href, resolvedPath: path });
  },
  watch(f) {
    onNewer = f;
    return () => void (onNewer === f && (onNewer = null));
  },
  status(state, message) {
    bridge.notify("status", message === undefined ? { state } : { state, message });
  },
};

function setTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

let controls: NoteControls | null = null;
/** The note to show (kept for the page if it's asked before the page is up). */
let opened: OpenArgs | null = null;
let show: (args: OpenArgs) => void = (args) => void (opened = args);

function Embed() {
  const [open, setOpen] = useState<OpenArgs | null>(opened);
  useEffect(() => {
    show = (args) => setOpen((opened = args));
    if (opened) setOpen(opened);
  }, []);
  if (!open) return null;
  return (
    <Note
      key={open.path + "\n" + (open.etag ?? "")}
      path={open.path}
      store={store}
      locked={!!open.readOnly}
      embedded
      initial={{ text: open.text, version: { etag: open.etag, modified: null } }}
      onControls={(c) => (controls = c)}
    />
  );
}

const api: EditorApi = {
  open(args) {
    if (args.theme) setTheme(args.theme);
    images.clear();
    // What's unsaved in the note open now goes first.
    // (If it can't be written now, it's kept as a draft and offered when that note is opened again.)
    void (controls?.flush() ?? Promise.resolve(true)).finally(() => {
      controls = null;
      show(args);
    });
  },
  setTheme,
  setSource: (on) => controls?.setSource(on),
  flush: () => controls?.flush() ?? Promise.resolve(true),
  reloadIfUnchanged: ({ text, etag }) => onNewer?.({ text, version: { etag, modified: null } }),
  _reply: (id, json, error) => bridge.reply(id, json, error),
};
(window as unknown as { assistantEditor: EditorApi }).assistantEditor = api;

if (transport) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Embed />
    </StrictMode>,
  );
  bridge.notify("ready", {});
}
