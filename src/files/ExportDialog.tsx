import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api, unwrap } from "../api/client";
import { useFolder, type DriveEntry } from "./api";
import styles from "./ExportDialog.module.css";

const isPdf = (name: string) => /\.pdf$/i.test(name);
const isNote = (name: string) => /\.(md|markdown)$/i.test(name);

/** "1-3, 5" as page indices (from 0); empty: all. Throws on what isn't pages. */
export function parsePages(text: string): number[] | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const pages: number[] = [];
  for (const part of t.split(/[,\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) throw new Error(`“${part}” isn't a page or a range`);
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (from < 1 || to < from) throw new Error(`“${part}” isn't a page or a range`);
    for (let p = from; p <= to; p++) pages.push(p - 1);
  }
  return pages;
}

/** Remembered for the next export (just this browser). */
const AUTHOR = "assistant:export-author";
const remembered = () => {
  try {
    return localStorage.getItem(AUTHOR) ?? "";
  } catch {
    return "";
  }
};

type Row = { entry: DriveEntry; on: boolean; pages: string };

/**
 * Notebooks, PDFs and notes in [folder] made into one PDF to hand in: which, in what order, which
 * pages, and a cover page; downloaded, or saved in the folder ([onSaved] with where).
 */
export function ExportDialog({ folder, first, onClose, onSaved }: { folder: string; first?: string; onClose: () => void; onSaved: (path: string) => void }) {
  const listing = useFolder(folder);
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const parts = folder.split("/").filter(Boolean);
  const [cover, setCover] = useState(true);
  const [title, setTitle] = useState(parts[parts.length - 1] ?? "Export");
  const [subtitle, setSubtitle] = useState((parts[0] === "Projects" && parts.length > 2 ? parts[1] : undefined) ?? "");
  const [author, setAuthor] = useState(remembered);
  const [date, setDate] = useState(() => new Date().toLocaleDateString("sv-SE"));
  const [busy, setBusy] = useState<"download" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The folder's PDFs and notes; the one it was opened on first and picked (or all, if none).
  useEffect(() => {
    if (rows || !listing.data) return;
    const files = listing.data.entries.filter((e) => !e.folder && (isPdf(e.name) || isNote(e.name)));
    const ordered = first ? [...files.filter((e) => e.path === first), ...files.filter((e) => e.path !== first)] : files;
    setRows(ordered.map((entry) => ({ entry, on: first ? entry.path === first : true, pages: "" })));
  }, [listing.data, rows, first]);

  const picked = useMemo(() => (rows ?? []).filter((r) => r.on), [rows]);

  const request = () => {
    const items = picked.map((r) => ({ path: r.entry.path, pages: isPdf(r.entry.name) ? parsePages(r.pages) : undefined }));
    if (!items.length) throw new Error("Pick something to export");
    try {
      localStorage.setItem(AUTHOR, author);
    } catch {
      // Not remembered: no matter.
    }
    return { items, cover: cover ? { title: title.trim() || "Export", subtitle: subtitle.trim() || undefined, author: author.trim() || undefined, date: date.trim() || undefined } : undefined };
  };
  const fileName = `${(cover && title.trim()) || picked[0]?.entry.name.replace(/\.[^.]+$/, "") || "Export"}.pdf`;

  const download = async () => {
    setError(null);
    setBusy("download");
    try {
      const res = await fetch("/api/v1/drive/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request()) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { detail?: string }).detail ?? `Failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/[/\\]/g, " ");
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setError(null);
    setBusy("save");
    try {
      const saved = unwrap(await api.POST("/api/v1/drive/export/save", { params: { query: { to: folder + fileName.replace(/[/\\]/g, " ") } }, body: request() }));
      await qc.invalidateQueries({ queryKey: ["drive", "folder", folder] });
      onSaved(saved.path);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const move = (i: number, by: number) =>
    setRows((rs) => {
      if (!rs || i + by < 0 || i + by >= rs.length) return rs;
      const next = [...rs];
      next.splice(i + by, 0, ...next.splice(i, 1));
      return next;
    });
  const change = (i: number, row: Partial<Row>) => setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...row } : r)));

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} role="dialog" aria-label="Export as PDF" onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <h2>Export as PDF</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <p className={styles.hint}>One PDF to hand in: notebooks with their writing, PDFs, and notes typeset as they show here, in this order.</p>
        {listing.isPending && <p className={styles.hint}>Loading…</p>}
        {rows && rows.length === 0 && <p className={styles.hint}>No PDFs or notes in this folder.</p>}
        <ul className={styles.list}>
          {(rows ?? []).map((r, i) => (
            <li key={r.entry.path} className={`${styles.row} ${r.on ? "" : styles.off}`}>
              <input type="checkbox" checked={r.on} onChange={(e) => change(i, { on: e.target.checked })} aria-label={`Include ${r.entry.name}`} />
              <span className={styles.name} title={r.entry.path}>
                {r.entry.name}
              </span>
              {isPdf(r.entry.name) ? (
                <input className={styles.pages} placeholder="All pages" value={r.pages} disabled={!r.on} onChange={(e) => change(i, { pages: e.target.value })} title="Pages, e.g. 1-3, 5 (empty: all)" />
              ) : (
                <span className={styles.kind}>Note</span>
              )}
              <button className="btn btn-ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Earlier">
                ↑
              </button>
              <button className="btn btn-ghost" onClick={() => move(i, 1)} disabled={i === rows!.length - 1} aria-label="Later">
                ↓
              </button>
            </li>
          ))}
        </ul>
        <label className={styles.check}>
          <input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} /> Cover page
        </label>
        {cover && (
          <div className={styles.cover}>
            <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
            <input placeholder="Course" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} aria-label="Course" />
            <input placeholder="Name, student ID" value={author} onChange={(e) => setAuthor(e.target.value)} aria-label="Name" />
            <input placeholder="Date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          </div>
        )}
        {error && <p className={styles.error}>{error}</p>}
        <footer className={styles.foot}>
          <button className="btn" onClick={() => void save()} disabled={busy !== null || picked.length === 0} title={`Save as ${folder}${fileName}`}>
            {busy === "save" ? "Saving…" : "Save in this folder"}
          </button>
          <button className="btn btn-primary" onClick={() => void download()} disabled={busy !== null || picked.length === 0}>
            {busy === "download" ? "Making it…" : "Download"}
          </button>
        </footer>
      </div>
    </div>
  );
}
