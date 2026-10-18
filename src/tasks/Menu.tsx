import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./Menu.module.css";

/** A floating panel under (or above) [anchor]; closes on Escape or a click outside. */
export function Popover({ anchor, onClose, children, width = 240 }: { anchor: HTMLElement | null; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const a = anchor.getBoundingClientRect();
    const h = ref.current.offsetHeight;
    const below = a.bottom + 4 + h <= window.innerHeight - 8;
    setPos({
      top: below ? a.bottom + 4 : Math.max(8, a.top - 4 - h),
      left: Math.min(Math.max(8, a.left), window.innerWidth - width - 8),
    });
  }, [anchor, width]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !anchor?.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      className={styles.popover}
      data-overlay
      style={{ width, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

export interface MenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
  selected?: boolean;
}

interface MenuProps {
  anchor: HTMLElement | null;
  items: MenuItem[];
  onPick: (key: string) => void;
  onClose: () => void;
  /** Several can be selected; picking toggles one and keeps the menu open. */
  multi?: boolean;
  /** The caller closes the menu itself after a pick. */
  keepOpen?: boolean;
  placeholder?: string;
  /** Offers "Create “…”" when the filter matches nothing exactly. */
  onCreate?: (name: string) => void;
  width?: number;
}

/** A filterable list: type to narrow it, ↑/↓ to move, Enter to pick. */
export function Menu({ anchor, items, onPick, onClose, multi, keepOpen, placeholder = "Filter…", onCreate, width }: MenuProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
  const canCreate = onCreate && q && !items.some((i) => i.label.toLowerCase() === q);
  const count = shown.length + (canCreate ? 1 : 0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (index: number) => {
    if (index < shown.length) {
      onPick(shown[index]!.key);
      if (!multi && !keepOpen) onClose();
    } else if (canCreate) {
      onCreate!(query.trim());
      setQuery("");
    }
  };

  return (
    <Popover anchor={anchor} onClose={onClose} width={width}>
      <input
        className={styles.filter}
        autoFocus
        value={query}
        placeholder={placeholder}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(count - 1, a + 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
          else if (e.key === "Enter") (e.preventDefault(), pick(active));
        }}
      />
      <div className={styles.list} ref={listRef} role="listbox" aria-multiselectable={multi || undefined}>
        {shown.map((item, i) => (
          <button
            key={item.key}
            type="button"
            role="option"
            aria-selected={item.selected}
            data-index={i}
            className={`${styles.item} ${i === active ? styles.active : ""}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => pick(i)}
          >
            {multi && <span className={`${styles.check} ${item.selected ? styles.checked : ""}`} aria-hidden />}
            {item.icon}
            <span className={styles.label}>{item.label}</span>
            {item.hint && <span className={styles.hint}>{item.hint}</span>}
            {!multi && item.selected && <span className={styles.tick} aria-hidden>✓</span>}
          </button>
        ))}
        {canCreate && (
          <button
            type="button"
            data-index={shown.length}
            className={`${styles.item} ${active === shown.length ? styles.active : ""}`}
            onMouseEnter={() => setActive(shown.length)}
            onClick={() => pick(shown.length)}
          >
            <span className={styles.label}>Create “{query.trim()}”</span>
          </button>
        )}
        {count === 0 && <p className={styles.empty}>No matches</p>}
      </div>
    </Popover>
  );
}
