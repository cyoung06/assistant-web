import styles from "./TagPicker.module.css";

/** A calendar's color as a small dot. */
export function TagDot({ color }: { color?: string | null }) {
  return <span className={styles.staticDot} style={{ background: color ?? "var(--text-3)" }} aria-hidden />;
}
