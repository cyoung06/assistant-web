import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import styles from "./ContextMenu.module.css";

/** A menu entry ("-" draws a line between groups). */
export type MenuAction = { label: string; hint?: string; danger?: boolean; run: () => void } | "-";

/**
 * A right-click menu at a point (kept on screen). Closes on Escape, a click or scroll elsewhere,
 * or once an entry is chosen; ↑/↓ and Enter choose from the keyboard.
 */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuAction[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  // No lines at the ends or twice in a row (groups that came out empty).
  const shown = items.filter((it, i, all) => it !== "-" || (i > 0 && i < all.length - 1 && all[i - 1] !== "-"));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - el.offsetWidth - 8)), top: Math.max(8, Math.min(y, window.innerHeight - el.offsetHeight - 8)) });
    el.querySelector<HTMLButtonElement>("button")?.focus();
  }, [x, y]);

  useEffect(() => {
    const away = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (e.stopPropagation(), onClose());
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const buttons = [...(ref.current?.querySelectorAll("button") ?? [])];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(at + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      }
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("scroll", onClose, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("scroll", onClose, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  return createPortal(
    <div ref={ref} className={styles.menu} role="menu" data-overlay style={pos} onContextMenu={(e) => e.preventDefault()}>
      {shown.map((it, i) =>
        it === "-" ? (
          <hr key={i} className={styles.line} />
        ) : (
          <button key={i} role="menuitem" className={`${styles.item} ${it.danger ? styles.danger : ""}`} onClick={() => (onClose(), it.run())}>
            <span className={styles.label}>{it.label}</span>
            {it.hint && <span className={styles.hint}>{it.hint}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

/**
 * Touch and pen long-press as a right click (tablets don't send one): after a still half-second
 * hold, [onLong] gets the point, and the click that would follow is dropped.
 */
export function useLongPress(onLong: (x: number, y: number) => void) {
  const timer = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType === "mouse") return;
      const { clientX: x, clientY: y } = e;
      start.current = { x, y };
      cancel();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        const drop = (ev: Event) => (ev.preventDefault(), ev.stopPropagation());
        window.addEventListener("click", drop, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", drop, { capture: true }), 800);
        onLong(x, y);
      }, 500);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (timer.current !== null && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
  };
}

/** Asks for a name (a new folder or file), or to confirm something (a delete) when there's no [initial]. */
export function Ask({ title, initial, confirm, danger, onDone }: { title: string; initial?: string; confirm: string; danger?: boolean; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(initial ?? "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus();
    // The name without its extension, ready to type over.
    const dot = el.value.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onDone(null));
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onDone]);
  const done = () => onDone(initial === undefined ? "" : value.trim().replace(/\//g, " ") || null);
  return createPortal(
    <div className={styles.scrim} data-overlay onPointerDown={(e) => e.target === e.currentTarget && onDone(null)}>
      <form className={styles.dialog} onSubmit={(e) => (e.preventDefault(), done())}>
        <h2 className={styles.title}>{title}</h2>
        {initial !== undefined && <input ref={input} className="input" value={value} onChange={(e) => setValue(e.target.value)} />}
        <div className={styles.buttons}>
          <button type="button" className="btn btn-ghost" onClick={() => onDone(null)}>
            Cancel
          </button>
          <button type="submit" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} autoFocus={initial === undefined}>
            {confirm}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
