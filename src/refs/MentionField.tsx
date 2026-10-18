import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type Ref as ReactRef } from "react";
import { formatDay } from "../lib/dates";
import { resolveRef, useRefSearch } from "./api";
import { KIND_LABEL, refMarkdown, type Ref } from "./kinds";
import styles from "./MentionField.module.css";

type Field = HTMLInputElement | HTMLTextAreaElement;

interface Props {
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  /** Called for keys the mention menu doesn't take (e.g. Enter to save, ⌘↵ to create). */
  onKeyDown?: (e: KeyboardEvent<Field>) => void;
  fieldRef?: ReactRef<Field>;
}

/** `@` and up to two more words before the caret, at the start or after a space. */
const MENTION = /(?:^|\s)@([^\s@[\]()]*(?: [^\s@[\]()]+){0,2})$/;
const URL_ONLY = /^https?:\/\/\S+$/;

/**
 * A text field where `@` searches everything that can be referenced and inserts it as a Markdown
 * link, and a pasted link becomes `[its title](url)` (or wraps the selected text).
 */
export function MentionField({ value, onChange, multiline, id, className, placeholder, autoFocus, onBlur, onKeyDown, fieldRef }: Props) {
  const own = useRef<Field | null>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const query = useDebounced(mention?.query ?? null, 150);
  const results = useRefSearch(query);
  const items = mention ? (results.data ?? []) : [];
  const open = !!mention && (items.length > 0 || (!mention.query.includes(" ") && (results.isFetching || query !== mention.query)));

  useEffect(() => setActive(0), [query]);

  const setRef = (el: Field | null) => {
    own.current = el;
    if (typeof fieldRef === "function") fieldRef(el);
    else if (fieldRef) (fieldRef as { current: Field | null }).current = el;
  };

  /** Finds an @mention being typed at the caret. */
  const track = (text: string, caret: number) => {
    const m = MENTION.exec(text.slice(0, caret));
    setMention(m ? { start: caret - m[1]!.length - 1, query: m[1]! } : null);
  };

  const replaceRange = (start: number, end: number, insert: string) => {
    const next = value.slice(0, start) + insert + value.slice(end);
    onChange(next);
    const caret = start + insert.length;
    requestAnimationFrame(() => own.current?.setSelectionRange(caret, caret));
  };

  const pick = (ref: Ref) => {
    if (!mention) return;
    const caret = own.current?.selectionStart ?? mention.start + mention.query.length + 1;
    replaceRange(mention.start, caret, `${refMarkdown(ref.title, ref.url)} `);
    setMention(null);
  };

  const onPaste = async (e: ClipboardEvent<Field>) => {
    const text = e.clipboardData.getData("text/plain").trim();
    if (!URL_ONLY.test(text)) return;
    e.preventDefault();
    const el = e.currentTarget;
    const [start, end] = [el.selectionStart ?? value.length, el.selectionEnd ?? value.length];
    const selected = value.slice(start, end);
    // Selected text becomes the link's text; otherwise the link is named after what it points to.
    if (selected) return replaceRange(start, end, refMarkdown(selected, text));
    replaceRange(start, end, text);
    const ref = await resolveRef(text).catch(() => null);
    if (!ref) return;
    const current = own.current?.value ?? "";
    const at = current.indexOf(text, Math.max(0, start - 1));
    if (at < 0) return;
    onChange(current.slice(0, at) + refMarkdown(ref.title, ref.url) + current.slice(at + text.length));
  };

  const keyDown = (e: KeyboardEvent<Field>) => {
    if (open && items.length) {
      if (e.key === "ArrowDown") return (e.preventDefault(), setActive((a) => (a + 1) % items.length));
      if (e.key === "ArrowUp") return (e.preventDefault(), setActive((a) => (a - 1 + items.length) % items.length));
      if (e.key === "Enter" || e.key === "Tab") return (e.preventDefault(), e.stopPropagation(), pick(items[active]!));
    }
    if (mention && e.key === "Escape") return (e.preventDefault(), e.stopPropagation(), setMention(null));
    onKeyDown?.(e);
  };

  const shared = {
    id,
    ref: setRef,
    className,
    value,
    placeholder,
    autoFocus,
    onChange: (e: { target: Field }) => {
      onChange(e.target.value);
      track(e.target.value, e.target.selectionStart ?? e.target.value.length);
    },
    onSelect: (e: { currentTarget: Field }) => track(e.currentTarget.value, e.currentTarget.selectionStart ?? 0),
    onKeyDown: keyDown,
    onPaste,
    onBlur: () => {
      // Let a click on the menu land first.
      setTimeout(() => setMention(null), 150);
      onBlur?.();
    },
  };

  return (
    <div className={styles.wrap}>
      {multiline ? <textarea {...shared} /> : <input {...shared} />}
      {open && (
        <div className={styles.menu} role="listbox" data-overlay onMouseDown={(e) => e.preventDefault()}>
          {items.length === 0 && <p className={styles.empty}>Searching…</p>}
          {items.map((r, i) => (
            <button
              key={r.url}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`${styles.item} ${i === active ? styles.active : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(r)}
            >
              <span className="ref" data-kind={r.kind}>
                {r.title}
              </span>
              <span className={styles.meta}>
                {[KIND_LABEL[r.kind], r.context, r.date ? formatDay(new Date(r.date)) : null].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (value === null) return setV(value);
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
