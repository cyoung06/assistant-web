import { useEffect, useState } from "react";
import { Markdown } from "./Markdown";
import { MentionField } from "./MentionField";
import styles from "./EditableMarkdown.module.css";

interface Props {
  value: string;
  onCommit: (value: string) => void;
  /** A description (several lines) rather than a title. */
  multiline?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}

/**
 * Shows Markdown with reference chips; a click (not on a chip) switches to editing, where `@`
 * references things. Commits on blur, and on Enter for a title.
 */
export function EditableMarkdown({ value, onCommit, multiline, placeholder, readOnly, className }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => {
    if (!editing) setText(value);
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    if (text !== value && (multiline || text.trim())) onCommit(multiline ? text : text.trim());
    else setText(value);
  };

  if (editing && !readOnly) {
    return (
      <MentionField
        value={text}
        onChange={setText}
        multiline={multiline}
        autoFocus
        className={`${styles.field} ${multiline ? styles.area : styles.line} ${className ?? ""}`}
        placeholder={placeholder}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") (e.stopPropagation(), setText(value), setEditing(false));
          else if (!multiline && e.key === "Enter") (e.preventDefault(), e.currentTarget.blur());
        }}
      />
    );
  }
  return (
    <div
      className={`${styles.view} ${multiline ? styles.areaView : ""} ${readOnly ? styles.readOnly : ""} ${className ?? ""}`}
      role={readOnly ? undefined : "button"}
      tabIndex={readOnly ? undefined : 0}
      onClick={(e) => {
        if (readOnly || (e.target as HTMLElement).closest("a")) return;
        setEditing(true);
      }}
      onKeyDown={(e) => !readOnly && e.key === "Enter" && e.target === e.currentTarget && (e.preventDefault(), setEditing(true))}
    >
      {value ? <Markdown text={value} inline={!multiline} /> : <span className={styles.placeholder}>{placeholder}</span>}
    </div>
  );
}
