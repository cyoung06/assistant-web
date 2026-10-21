import * as pdfjs from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useMemo, useRef, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import styles from "./Notebook.module.css";

pdfjs.GlobalWorkerOptions.workerSrc = worker;

/**
 * A notebook (a PDF written on with a pen) edited live with every device on it: the same Yjs
 * document as the apps' (see the core's notebook.rs for what's in it), over the API's y-websocket
 * endpoint; the server writes the PDF. Pages are drawn from the base PDF (pdf.js) or as blank
 * pages; everyone's ink from its outline. Here: a simple pen (its width following the pressure
 * where there is one), a highlighter, and an eraser that takes strokes whole, as the tablet's does;
 * blank pages added and pages deleted (with what's on them), and pages bookmarked.
 */

type Page = { id: string; base: number; style: string; width: number; height: number };
type Stroke = { page: string; tool: string; color: number; width: number; points?: Uint8Array; outline?: Uint8Array[]; ink?: Uint8Array; transform?: number[] };
type Picture = { page: string; rect: number[]; crop: number[]; blob: string; mime: string };
type Tool = "pen" | "highlighter" | "eraser";
/** A blank page's look, as the core draws it (see blank_page). */
type Style = "plain" | "lines" | "grid" | "dots";
const STYLES: [Style, string][] = [["plain", "Plain"], ["lines", "Lines"], ["grid", "Grid"], ["dots", "Dots"]];

/** The tablet's colours (ARGB): pens, then highlighters. */
const PENS = [0xff1b1b1f, 0xff1e5bd8, 0xffd93025, 0xff188038];
const HIGHLIGHTERS = [0x66ffd600, 0x6634c759, 0x66ff7eb6, 0x6640a9ff];

const syncUrl = () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/v1`;
const blobUrl = (hash: string) => `/api/v1/sync/blobs/${hash}`;
const floats = (b?: Uint8Array) => (b ? new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) : new Float32Array());
const bytes = (f: number[]) => new Uint8Array(new Float32Array(f).buffer);
const rgba = (argb: number) => `rgba(${(argb >>> 16) & 255}, ${(argb >>> 8) & 255}, ${argb & 255}, ${((argb >>> 24) & 255) / 255})`;

/** The filled shape of a stroke through [pts] (x, y, pressure): its sides [width] apart (by pressure for a pen), round at the ends. */
function outlineOf(pts: number[], width: number, pen: boolean): number[] {
  const n = pts.length / 3;
  const half = (i: number) => (pen ? (width / 2) * (0.4 + 1.2 * pts[i * 3 + 2]!) : width / 2);
  if (n === 1) {
    const r = half(0);
    return Array.from({ length: 12 }, (_, k) => [pts[0]! + r * Math.cos((k * Math.PI) / 6), pts[1]! + r * Math.sin((k * Math.PI) / 6)]).flat();
  }
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let dx = pts[b * 3]! - pts[a * 3]!;
    let dy = pts[b * 3 + 1]! - pts[a * 3 + 1]!;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const h = half(i);
    left.push(pts[i * 3]! - dy * h, pts[i * 3 + 1]! + dx * h);
    right.push(pts[i * 3]! + dy * h, pts[i * 3 + 1]! - dx * h);
  }
  // Round ends: half circles around the first and last points.
  const cap = (i: number, from: number) => {
    const out: number[] = [];
    const h = half(i);
    for (let k = 1; k < 6; k++) out.push(pts[i * 3]! + h * Math.cos(from + (k * Math.PI) / 6), pts[i * 3 + 1]! + h * Math.sin(from + (k * Math.PI) / 6));
    return out;
  };
  const dir = (i: number, j: number) => Math.atan2(pts[j * 3 + 1]! - pts[i * 3 + 1]!, pts[j * 3]! - pts[i * 3]!);
  const reversed: number[] = [];
  for (let i = right.length - 2; i >= 0; i -= 2) reversed.push(right[i]!, right[i + 1]!);
  return [...left, ...cap(n - 1, dir(n - 2, n - 1) - Math.PI / 2), ...reversed, ...cap(0, dir(1, 0) - Math.PI / 2)];
}

/** Whether a circle of [r] at ([x], [y]) touches stroke [s] (its centre line, moved as it was). */
function hits(s: Stroke, x: number, y: number, r: number) {
  const p = floats(s.points);
  const t = s.transform;
  const at = (i: number): [number, number] => {
    const px = p[i * 3]!;
    const py = p[i * 3 + 1]!;
    return t ? [t[0]! * px + t[2]! * py + t[4]!, t[1]! * px + t[3]! * py + t[5]!] : [px, py];
  };
  const reach = r + s.width / 2;
  for (let i = 0; i < p.length / 3; i++) {
    const [ax, ay] = at(i);
    if (i === 0 && Math.hypot(ax - x, ay - y) <= reach) return true;
    if (i > 0) {
      const [bx, by] = at(i - 1);
      const dx = ax - bx;
      const dy = ay - by;
      const len = dx * dx + dy * dy;
      const u = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - bx) * dx + (y - by) * dy) / len));
      if (Math.hypot(bx + u * dx - x, by + u * dy - y) <= reach) return true;
    }
  }
  return false;
}

export default function Notebook({ path }: { path: string }) {
  const [status, setStatus] = useState("Opening…");
  const [version, setVersion] = useState(0);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(0);
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [style, setStyle] = useState<Style>("plain");
  /** The page in view (its index), where a new page goes after. */
  const [current, setCurrent] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sheets = useRef(new Map<string, HTMLDivElement>());
  const yref = useRef<{ doc: Y.Doc; pages: Y.Array<Page>; strokes: Y.Map<Stroke>; images: Y.Map<Picture>; bookmarks: Y.Map<boolean>; meta: Y.Map<string> } | null>(null);

  useEffect(() => {
    const doc = new Y.Doc();
    const pages = doc.getArray<Page>("pages");
    const strokes = doc.getMap<Stroke>("strokes");
    const images = doc.getMap<Picture>("images");
    const bookmarks = doc.getMap<boolean>("bookmarks");
    const meta = doc.getMap<string>("meta");
    yref.current = { doc, pages, strokes, images, bookmarks, meta };
    const bump = () => setVersion((v) => v + 1);
    doc.on("update", bump);
    const provider = new WebsocketProvider(syncUrl(), "sync", doc, { params: { doc: path } });
    provider.awareness.setLocalStateField("user", { name: "Web" });
    provider.on("status", ({ status: s }: { status: string }) => setStatus(s === "connected" ? "Live" : s === "connecting" ? "Connecting…" : "Offline (kept)"));
    provider.on("connection-close", (e: CloseEvent | null) => {
      if (e?.code === 1008) {
        provider.disconnect();
        setStatus(e.reason || "This can't be opened");
      }
    });
    return () => {
      provider.destroy();
      doc.destroy();
      yref.current = null;
    };
  }, [path]);

  // The base PDF, once its hash is known.
  const base = yref.current?.meta.get("base") ?? "";
  useEffect(() => {
    if (!base) return;
    let alive = true;
    const task = pdfjs.getDocument({ url: blobUrl(base) });
    void task.promise.then((d) => alive && setPdf(d)).catch(() => setStatus("Couldn't load the PDF"));
    return () => {
      alive = false;
      void task.destroy();
    };
  }, [base]);

  const y = yref.current;
  const pages = useMemo(() => y?.pages.toArray() ?? [], [y, version]);
  const byPage = useMemo(() => {
    const out = new Map<string, [string, Stroke][]>();
    y?.strokes.forEach((s, id) => out.set(s.page, [...(out.get(s.page) ?? []), [id, s]]));
    return out;
  }, [y, version]);
  const picturesByPage = useMemo(() => {
    const out = new Map<string, [string, Picture][]>();
    y?.images.forEach((p, id) => out.set(p.page, [...(out.get(p.page) ?? []), [id, p]]));
    return out;
  }, [y, version]);

  const palette = tool === "highlighter" ? HIGHLIGHTERS : PENS;
  const put = (page: string, points: number[]) => {
    if (!y || points.length < 3) return;
    const pen = tool === "pen";
    const width = pen ? 0.6 : 9;
    const argb = palette[color % palette.length]!;
    y.strokes.set(crypto.randomUUID(), { page, tool, color: argb, width, points: bytes(points), outline: [bytes(outlineOf(points, width, pen))] });
  };
  const marked = useMemo(() => new Set(y ? [...y.bookmarks.keys()] : []), [y, version]);

  /** A blank page in [style] after the page in view, its size. */
  const addPage = () => {
    if (!y) return;
    const at = Math.min(current, pages.length - 1);
    const ref = pages[at];
    const page: Page = { id: crypto.randomUUID(), base: -1, style, width: ref?.width ?? 595, height: ref?.height ?? 842 };
    y.pages.insert(at + 1, [page]);
    requestAnimationFrame(() => sheets.current.get(page.id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  /** Page [id] gone, with what's on it (as the core's RemovePage). */
  const deletePage = (id: string) => {
    if (!y) return;
    y.doc.transact(() => {
      const i = y.pages.toArray().findIndex((p) => p.id === id);
      if (i >= 0) y.pages.delete(i, 1);
      y.strokes.forEach((s, k) => s.page === id && y.strokes.delete(k));
      y.images.forEach((p, k) => p.page === id && y.images.delete(k));
      y.bookmarks.delete(id);
    });
    setDeleting(null);
  };
  const bookmark = (id: string, on: boolean) => {
    if (!y) return;
    if (on) y.bookmarks.set(id, true);
    else y.bookmarks.delete(id);
  };
  const jump = (id: string) => sheets.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  // The page in view: the last whose top is above the middle of the pane.
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const middle = el.getBoundingClientRect().top + el.clientHeight / 2;
    let at = 0;
    pages.forEach((p, i) => {
      const s = sheets.current.get(p.id);
      if (s && s.getBoundingClientRect().top <= middle) at = i;
    });
    setCurrent(at);
  };

  const erase = (page: string, at: [number, number][], r: number) => {
    if (!y) return;
    const hit = (byPage.get(page) ?? []).filter(([, s]) => at.some(([x, yy]) => hits(s, x, yy, r))).map(([id]) => id);
    if (hit.length) y.doc.transact(() => hit.forEach((id) => y.strokes.delete(id)));
  };

  return (
    <div className={styles.notebook}>
      <div className={styles.bar}>
        <span className={styles.status}>{status}</span>
        <span className={styles.spacer} />
        {marked.size > 0 && (
          <select className={styles.select} value="" onChange={(e) => jump(e.target.value)} aria-label="Bookmarks">
            <option value="" disabled>
              Bookmarks
            </option>
            {pages.map((p, i) => marked.has(p.id) && <option key={p.id} value={p.id}>{`Page ${i + 1}`}</option>)}
          </select>
        )}
        <select className={styles.select} value={style} onChange={(e) => setStyle(e.target.value as Style)} aria-label="New page's look">
          {STYLES.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <button className="btn btn-ghost" onClick={addPage} disabled={!y || !pages.length} title="A blank page after the one in view">
          Add page
        </button>
        <span className={styles.divider} />
        {(["pen", "highlighter", "eraser"] as Tool[]).map((t) => (
          <button key={t} className={`btn btn-ghost ${tool === t ? styles.on : ""}`} onClick={() => setTool(t)}>
            {t === "pen" ? "Pen" : t === "highlighter" ? "Highlighter" : "Eraser"}
          </button>
        ))}
        {tool !== "eraser" &&
          palette.map((c, i) => <button key={c} className={`${styles.swatch} ${color === i ? styles.on : ""}`} style={{ background: rgba(c | 0xff000000) }} onClick={() => setColor(i)} aria-label={`Colour ${i + 1}`} />)}
      </div>
      <div ref={scroller} className={styles.pages} onScroll={onScroll}>
        {pages.map((p, i) => (
          <div
            key={p.id}
            className={styles.sheet}
            ref={(el) => {
              if (el) sheets.current.set(p.id, el);
              else sheets.current.delete(p.id);
            }}
          >
            <PageView page={p} pdf={pdf} strokes={byPage.get(p.id) ?? []} pictures={picturesByPage.get(p.id) ?? []} tool={tool} onStroke={(pts) => put(p.id, pts)} onErase={(at, r) => erase(p.id, at, r)} />
            <div className={styles.footer}>
              <button className={`btn btn-ghost ${styles.star}`} onClick={() => bookmark(p.id, !marked.has(p.id))} aria-pressed={marked.has(p.id)} title={marked.has(p.id) ? "Remove the bookmark" : "Bookmark this page"}>
                {marked.has(p.id) ? "★" : "☆"}
              </button>
              <span>
                Page {i + 1} of {pages.length}
              </span>
              <span className={styles.spacer} />
              {deleting === p.id ? (
                <>
                  <span>Delete this page and what's on it?</span>
                  <button className="btn btn-danger" onClick={() => deletePage(p.id)}>
                    Delete
                  </button>
                  <button className="btn btn-ghost" onClick={() => setDeleting(null)}>
                    Keep
                  </button>
                </>
              ) : (
                <button className="btn btn-ghost" onClick={() => setDeleting(p.id)} disabled={pages.length <= 1}>
                  Delete page
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A page: its drawing (the base PDF's page, or a blank one), and the ink and pictures on it. */
function PageView({
  page,
  pdf,
  strokes,
  pictures,
  tool,
  onStroke,
  onErase,
}: {
  page: Page;
  pdf: pdfjs.PDFDocumentProxy | null;
  strokes: [string, Stroke][];
  pictures: [string, Picture][];
  tool: Tool;
  onStroke: (points: number[]) => void;
  /** The eraser went over [at]; what's within [r] of it goes. */
  onErase: (at: [number, number][], r: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [wet, setWet] = useState<number[]>([]);
  const drawing = useRef<number[] | null>(null);
  /** Where the eraser last was: it takes what it passed over since, not just where events land. */
  const rubbed = useRef<[number, number] | null>(null);
  const rub = (x: number, y: number) => {
    const [fx, fy] = rubbed.current ?? [x, y];
    const steps = Math.max(1, Math.ceil(Math.hypot(x - fx, y - fy) / 3));
    onErase(Array.from({ length: steps + 1 }, (_, i): [number, number] => [fx + ((x - fx) * i) / steps, fy + ((y - fy) * i) / steps]), 6);
    rubbed.current = [x, y];
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The page's drawing, at this width (sharp at the screen's density).
  useEffect(() => {
    const c = canvas.current;
    if (!c || !width) return;
    const scale = (width / page.width) * (window.devicePixelRatio || 1);
    c.width = Math.round(page.width * scale);
    c.height = Math.round(page.height * scale);
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    if (page.base >= 0) {
      if (!pdf) return;
      let task: pdfjs.RenderTask | null = null;
      void pdf.getPage(page.base + 1).then((pg) => {
        const vp = pg.getViewport({ scale: scale * (page.width / pg.getViewport({ scale: 1 }).width) });
        task = pg.render({ canvasContext: g, viewport: vp, canvas: c });
        return task.promise.catch(() => {});
      });
      return () => task?.cancel();
    }
    drawBlank(g, page, scale);
  }, [pdf, page, width]);

  const point = (e: React.PointerEvent<SVGSVGElement>): [number, number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * page.width, ((e.clientY - r.top) / r.height) * page.height, e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5];
  };
  // A finger scrolls; the pen (or a mouse) writes.
  const writes = (e: React.PointerEvent) => e.pointerType !== "touch";

  return (
    <div ref={box} className={styles.page} style={{ aspectRatio: `${page.width} / ${page.height}` }}>
      <canvas ref={canvas} className={styles.canvas} />
      <svg
        className={styles.ink}
        viewBox={`0 0 ${page.width} ${page.height}`}
        onPointerDown={(e) => {
          if (!writes(e)) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const [x, y, p] = point(e);
          rubbed.current = null;
          if (tool === "eraser") return rub(x, y);
          drawing.current = [x, y, p];
          setWet([...drawing.current]);
        }}
        onPointerMove={(e) => {
          if (!writes(e) || (e.buttons & 1) === 0) return;
          const [x, y, p] = point(e);
          if (tool === "eraser") return rub(x, y);
          if (!drawing.current) return;
          drawing.current.push(x, y, p);
          setWet([...drawing.current]);
        }}
        onPointerUp={() => {
          if (drawing.current) onStroke(drawing.current);
          drawing.current = null;
          setWet([]);
        }}
      >
        {pictures.map(([id, pic]) => {
          const [x, yy, w, h] = pic.rect as [number, number, number, number];
          const [cl, ct, cr, cb] = (pic.crop.length === 4 ? pic.crop : [0, 0, 1, 1]) as [number, number, number, number];
          const fw = w / (cr - cl);
          const fh = h / (cb - ct);
          return (
            <g key={id}>
              <clipPath id={`clip-${id}`}>
                <rect x={x} y={yy} width={w} height={h} />
              </clipPath>
              <image href={blobUrl(pic.blob)} x={x - cl * fw} y={yy - ct * fh} width={fw} height={fh} clipPath={`url(#clip-${id})`} preserveAspectRatio="none" />
            </g>
          );
        })}
        {strokes.map(([id, s]) => (
          <path
            key={id}
            d={(s.outline ?? []).map((poly) => pathOf(floats(poly))).join(" ")}
            fill={rgba(s.color)}
            transform={s.transform ? `matrix(${s.transform.join(" ")})` : undefined}
            style={s.tool === "highlighter" ? { mixBlendMode: "multiply" } : undefined}
          />
        ))}
        {wet.length >= 3 && <path d={pathOf(new Float32Array(outlineOf(wet, tool === "pen" ? 0.6 : 9, tool === "pen")))} fill="rgba(80, 80, 90, 0.6)" />}
      </svg>
    </div>
  );
}

const pathOf = (pts: Float32Array) => {
  let d = "";
  for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? "L" : "M"}${pts[i]!.toFixed(2)} ${pts[i + 1]!.toFixed(2)}`;
  return d + "Z";
};

/** A blank page's lines, grid or dots, as the core draws them (17pt apart from a 28pt margin; lines 22pt). */
function drawBlank(g: CanvasRenderingContext2D, page: Page, scale: number) {
  const STEP = 17;
  const MARGIN = 28;
  g.save();
  // PDF coordinates (from the bottom left), as the core's drawing is.
  g.setTransform(scale, 0, 0, -scale, 0, page.height * scale);
  if (page.style === "grid") {
    g.strokeStyle = "rgb(217, 217, 224)";
    g.lineWidth = 0.4;
    const cols = Math.floor((page.width - 2 * MARGIN) / STEP);
    const rows = Math.floor((page.height - 2 * MARGIN) / STEP);
    g.beginPath();
    for (let c = 0; c <= cols; c++) (g.moveTo(MARGIN + c * STEP, MARGIN), g.lineTo(MARGIN + c * STEP, MARGIN + rows * STEP));
    for (let r = 0; r <= rows; r++) (g.moveTo(MARGIN, MARGIN + r * STEP), g.lineTo(MARGIN + cols * STEP, MARGIN + r * STEP));
    g.stroke();
  } else if (page.style === "lines") {
    g.strokeStyle = "rgb(204, 209, 224)";
    g.lineWidth = 0.5;
    g.beginPath();
    for (let y = page.height - MARGIN * 2.2; y > MARGIN; y -= 22) (g.moveTo(MARGIN, y), g.lineTo(page.width - MARGIN, y));
    g.stroke();
  } else if (page.style === "dots") {
    g.fillStyle = "rgb(191, 191, 199)";
    for (let y = MARGIN; y <= page.height - MARGIN + 0.01; y += STEP) for (let x = MARGIN; x <= page.width - MARGIN + 0.01; x += STEP) (g.beginPath(), g.arc(x, y, 0.7, 0, Math.PI * 2), g.fill());
  }
  g.restore();
}
