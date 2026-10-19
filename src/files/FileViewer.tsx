import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fileUrl, kind, size, type DriveEntry } from "./api";
import styles from "./FileViewer.module.css";

/** Text files larger than this aren't previewed (download them instead). */
const TEXT_LIMIT = 2 * 1024 * 1024;

/**
 * A file of the drive shown in the app: PDFs in the browser's viewer, images, video, audio and
 * text as themselves, anything else offered for download. ← and → go through the folder's files;
 * Escape goes back to the folder.
 */
export function FileViewer({ path, entry, files, go, close }: { path: string; entry?: DriveEntry; files: DriveEntry[]; go: (path: string) => void; close: () => void }) {
  const name = path.split("/").pop() ?? path;
  const k = kind({ name });
  const at = files.findIndex((f) => f.path === path);
  const prev = at > 0 ? files[at - 1] : undefined;
  const next = at >= 0 && at < files.length - 1 ? files[at + 1] : undefined;
  const url = fileUrl(path);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft" && prev) go(prev.path);
      else if (e.key === "ArrowRight" && next) go(next.path);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, go, prev, next]);

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

  return (
    <div className={styles.viewer} role="dialog" aria-label={name}>
      <div className={styles.bar}>
        <button className="btn btn-ghost" onClick={close} title="Back to the folder (Esc)">
          ‹ Back
        </button>
        <span className={styles.name} title={name}>
          {name}
        </span>
        {entry && <span className={styles.meta}>{size(entry.size)}</span>}
        <span className={styles.spacer} />
        {files.length > 1 && at >= 0 && (
          <span className={styles.nav}>
            <button className="btn btn-ghost" disabled={!prev} onClick={() => prev && go(prev.path)} title={prev ? `${prev.name} (←)` : undefined} aria-label="Previous file">
              ←
            </button>
            <span className={styles.meta}>
              {at + 1} / {files.length}
            </span>
            <button className="btn btn-ghost" disabled={!next} onClick={() => next && go(next.path)} title={next ? `${next.name} (→)` : undefined} aria-label="Next file">
              →
            </button>
          </span>
        )}
        <a className="btn btn-ghost" href={url} target="_blank" rel="noreferrer">
          Open in tab
        </a>
        <a className="btn" href={url} download={name}>
          Download
        </a>
      </div>
      <div className={styles.content}>
        {k === "pdf" ? (
          <iframe key={path} className={styles.frame} src={url} title={name} />
        ) : k === "image" ? (
          <img key={path} className={styles.image} src={url} alt={name} />
        ) : k === "video" ? (
          <video key={path} className={styles.media} src={url} controls autoPlay />
        ) : k === "audio" ? (
          <audio key={path} src={url} controls autoPlay />
        ) : k === "text" && !big ? (
          text.isPending ? (
            <p className={styles.note}>Loading…</p>
          ) : text.isError ? (
            <p className={styles.note}>Couldn't open this file.</p>
          ) : (
            <pre className={styles.text}>{text.data}</pre>
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
