import { useQuery } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { Marked } from "marked";
import { lazy, Suspense, useMemo, useState } from "react";
import { fileUrl, kind, parentOf, readOnly, size, useAnnotation, useAnnotationMutations, useFileState, writeOnOpen, type DriveEntry } from "./api";
import styles from "./FileViewer.module.css";

/** The note editor (CodeMirror and KaTeX), loaded when a note is first opened. */
const NoteEditor = lazy(() => import("../notes/NoteEditor"));
const Notebook = lazy(() => import("../notebooks/Notebook"));

/** Text files larger than this aren't previewed (download them instead). */
const TEXT_LIMIT = 2 * 1024 * 1024;

const isMarkdown = (name: string) => /\.(md|markdown)$/i.test(name);

/** Markdown as HTML (sanitized), its relative links and images pointing at the drive files beside it. */
function renderMarkdown(text: string, folder: string) {
  const resolve = (href: string) => {
    if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) return href;
    const parts = (folder + decodeURI(href)).split("/");
    const out: string[] = [];
    for (const p of parts) p === ".." ? out.pop() : p !== "." && out.push(p);
    return fileUrl(out.join("/"));
  };
  const marked = new Marked({ gfm: true, walkTokens: (t) => void ((t.type === "link" || t.type === "image") && (t.href = resolve(t.href))) });
  return DOMPurify.sanitize(marked.parse(text) as string);
}

/**
 * A file of the drive shown in the app: PDFs in the browser's viewer, images (fitted; click for
 * actual size), video, audio, text and code with line numbers, notes (Markdown) in the note
 * editor ([openPath] follows their links to drive files); anything else offered for download.
 */
export function FileViewer({ path, entry, openPath }: { path: string; entry?: DriveEntry; openPath: (path: string) => void }) {
  const name = path.split("/").pop() ?? path;
  // Notes open in the editor (rendered as they're written).
  if (isMarkdown(name) && (entry?.size ?? 0) <= TEXT_LIMIT)
    return (
      <Suspense fallback={<p className={styles.note}>Opening…</p>}>
        <NoteEditor path={path} entry={entry} openPath={openPath} />
      </Suspense>
    );
  return <Viewer path={path} entry={entry} openPath={openPath} />;
}

/** Anything but a note, shown as itself. */
function Viewer({ path, entry, openPath }: { path: string; entry?: DriveEntry; openPath: (path: string) => void }) {
  const name = path.split("/").pop() ?? path;
  const k = kind({ name });
  const url = fileUrl(path);
  const [actual, setActual] = useState(false);
  const [source, setSource] = useState(false);
  /** A PDF written on (live, with every device on it), instead of the browser's viewer. */
  const [writing, setWriting] = useState(() => writeOnOpen.delete(path));
  // A course PDF's copy to write on, or a copy's course file updated since.
  const annotation = useAnnotation(path, k === "pdf");
  const annotations = useAnnotationMutations();
  const course = readOnly(path);
  const updated = !course && annotation.data?.copy === path && annotation.data.sourceChanged;
  const annotate = () =>
    annotations.annotate.mutate(path, {
      onSuccess: (a) => {
        writeOnOpen.add(a.copy);
        openPath(a.copy);
      },
    });

  const big = (entry?.size ?? 0) > TEXT_LIMIT;
  const text = useQuery({
    queryKey: ["drive", "text", path, entry?.modified],
    enabled: k === "text" && !big,
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      return res.text();
    },
  });
  const md = isMarkdown(name) && !source;
  const html = useMemo(() => (md && text.data !== undefined ? renderMarkdown(text.data, parentOf(path)) : ""), [md, text.data, path]);

  return (
    <div className={styles.viewer}>
      <div className={styles.bar}>
        <span className={styles.meta}>{entry ? size(entry.size) : ""}</span>
        <span className={styles.spacer} />
        {isMarkdown(name) && (
          <button className="btn btn-ghost" onClick={() => setSource((s) => !s)}>
            {source ? "Rendered" : "Source"}
          </button>
        )}
        {k === "pdf" && course && (
          <button className="btn btn-primary" onClick={annotate} disabled={annotations.annotate.isPending} title="Write on a copy in the project's Notes (your writing can follow PLMS's updates to this file)">
            {annotations.annotate.isPending ? "Copying…" : annotation.data ? "Open my notes" : "Annotate"}
          </button>
        )}
        {k === "pdf" && !readOnly(path) && (
          <button className={writing ? "btn btn-primary" : "btn"} onClick={() => setWriting((w) => !w)} title={writing ? "Back to the PDF viewer" : "Write on it with a pen, live with your other devices"}>
            {writing ? "Done" : "Write on it"}
          </button>
        )}
        <a className="btn btn-ghost" href={url} target="_blank" rel="noreferrer">
          Open in tab
        </a>
        <a className="btn btn-ghost" href={url} download={name}>
          Download
        </a>
      </div>
      {updated && (
        <div className={styles.updated}>
          <span>
            <b>{annotation.data!.source.split("/").pop()}</b> was updated on PLMS. Carry your writing over to the new version? Each page goes to the new page with its text; pages taken out are kept at the end.
          </span>
          <button className="btn btn-primary" disabled={annotations.carry.isPending} onClick={() => annotations.carry.mutate(path)}>
            {annotations.carry.isPending ? "Carrying over…" : "Carry over"}
          </button>
          <button className="btn btn-ghost" disabled={annotations.dismiss.isPending} onClick={() => annotations.dismiss.mutate(path)}>
            Keep as it is
          </button>
          {annotations.carry.isError && <span className={styles.error}>{annotations.carry.error.message}</span>}
        </div>
      )}
      <div className={styles.content}>
        {k === "pdf" && writing ? (
          <Suspense fallback={<p className={styles.note}>Opening…</p>}>
            <Notebook key={path} path={path} />
          </Suspense>
        ) : k === "pdf" ? (
          <PdfFrame path={path} url={url} name={name} />
        ) : k === "image" ? (
          <div className={`${styles.imageBox} ${actual ? styles.actual : ""}`} onClick={() => setActual((a) => !a)} title={actual ? "Fit to the pane" : "Actual size"}>
            <img key={path} className={styles.image} src={url} alt={name} />
          </div>
        ) : k === "video" ? (
          <video key={path} className={styles.media} src={url} controls />
        ) : k === "audio" ? (
          <audio key={path} src={url} controls />
        ) : k === "text" && !big ? (
          text.isPending ? (
            <p className={styles.note}>Loading…</p>
          ) : text.isError ? (
            <p className={styles.note}>Couldn't open this file.</p>
          ) : md ? (
            <div className={`markdown ${styles.markdown}`} dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <Code text={text.data} />
          )
        ) : (
          <div className={styles.none}>
            <span className={styles.icon}>📎</span>
            <p>{big ? "This file is too large to preview." : "This kind of file can't be shown here."}</p>
            <a className="btn" href={url} download={name}>
              Download {entry ? `(${size(entry.size)})` : ""}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/** Text with line numbers (the numbers aren't selected with the text). */
function Code({ text }: { text: string }) {
  const lines = useMemo(() => text.replace(/\n$/, "").split("\n"), [text]);
  return (
    <div className={styles.code} style={{ ["--digits" as string]: String(lines.length).length }}>
      {lines.map((line, i) => (
        <div key={i} className={styles.line}>
          <span className={styles.number} aria-hidden>
            {i + 1}
          </span>
          <span className={styles.text}>{line || " "}</span>
        </div>
      ))}
    </div>
  );
}

/** A PDF in the browser's own viewer, opened at the page it was left at (on any device). */
function PdfFrame({ path, url, name }: { path: string; url: string; name: string }) {
  const place = useFileState(path);
  if (place.isPending) return null;
  const page = place.data?.page;
  return <iframe key={path} className={styles.frame} src={page != null ? `${url}#page=${page + 1}` : url} title={name} />;
}
