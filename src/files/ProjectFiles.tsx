import { filesRoute, useProjectFolder } from "./api";
import styles from "./ProjectFiles.module.css";

/** A project's folder in the drive, at a glance: what's at its top, and a link into it. */
export function ProjectFiles({ projectId }: { projectId: string }) {
  const folder = useProjectFolder(projectId);
  if (!folder.data) return null;
  const entries = folder.data.entries;
  const href = "/" + filesRoute(folder.data.path);
  return (
    <div className={styles.strip}>
      <a className={styles.title} href={href}>
        Files ›
      </a>
      {entries.length === 0 && <span className={styles.empty}>Empty — drop files in the folder to keep them with the project.</span>}
      {entries.slice(0, 8).map((e) => (
        <a key={e.path} className={styles.chip} href={e.folder ? "/" + filesRoute(e.path) : `/api/v1/drive/file?path=${encodeURIComponent(e.path)}`} target={e.folder ? undefined : "_blank"} rel="noreferrer">
          {e.folder ? "📁" : "📄"} {e.name}
        </a>
      ))}
      {entries.length > 8 && (
        <a className={styles.more} href={href}>
          +{entries.length - 8} more
        </a>
      )}
    </div>
  );
}
