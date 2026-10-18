import type { Tag } from "../api/client";
import styles from "./TagPicker.module.css";

interface Props {
  tags: Tag[];
  selected: string[];
  mainTagId: string | null;
  onChange: (tagIds: string[], mainTagId: string | null) => void;
}

/**
 * Click a tag to add or remove it. The main tag (which sets the item's color) is the filled one;
 * click a selected tag's dot to make it the main tag.
 */
export function TagPicker({ tags, selected, mainTagId, onChange }: Props) {
  if (tags.length === 0) return <p className={styles.empty}>No tags yet. Create them under Tags.</p>;

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      const rest = selected.filter((t) => t !== id);
      onChange(rest, mainTagId === id ? (rest[0] ?? null) : mainTagId);
    } else {
      // The first tag on an item becomes its main tag.
      onChange([...selected, id], mainTagId ?? id);
    }
  };

  return (
    <div className={styles.list}>
      {tags.map((tag) => {
        const isSelected = selected.includes(tag.id);
        const isMain = tag.id === mainTagId;
        return (
          <span
            key={tag.id}
            className={`${styles.chip} ${isSelected ? styles.selected : ""}`}
            style={{ "--tag": tag.color } as React.CSSProperties}
          >
            {isSelected && (
              <button
                type="button"
                className={`${styles.dot} ${isMain ? styles.main : ""}`}
                title={isMain ? "Main tag (sets the color)" : "Make this the main tag"}
                aria-label={isMain ? `${tag.name} is the main tag` : `Make ${tag.name} the main tag`}
                aria-pressed={isMain}
                onClick={() => onChange(selected, tag.id)}
              />
            )}
            <button type="button" className={styles.name} aria-pressed={isSelected} onClick={() => toggle(tag.id)}>
              {tag.name}
            </button>
          </span>
        );
      })}
    </div>
  );
}

export function TagDot({ color }: { color?: string | null }) {
  return <span className={styles.staticDot} style={{ background: color ?? "var(--text-3)" }} aria-hidden />;
}
