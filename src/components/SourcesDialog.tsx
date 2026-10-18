import type { SourceStatus } from "../api/client";
import { useSources, useSyncSource } from "../api/queries";
import styles from "./SourcesDialog.module.css";

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

/** Data sources (PLMS, …): whether they're working, what the last sync changed, and Sync now. */
export function SourcesDialog({ onClose }: { onClose: () => void }) {
  const sources = useSources();

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} role="dialog" aria-label="Sources" onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <h2>Sources</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <p className={styles.hint}>Items from these sources sync on their own. You keep control of done, tags and notes.</p>
        {sources.isPending && <p className={styles.hint}>Loading…</p>}
        {sources.error && <p className={styles.error}>{sources.error.message}</p>}
        <ul className={styles.list}>
          {(sources.data ?? []).map((s) => (
            <SourceRow key={s.type} source={s} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function SourceRow({ source: s }: { source: SourceStatus }) {
  const sync = useSyncSource();
  const failing = s.lastError != null;
  const r = s.lastReport;
  const busy = s.syncing || sync.isPending;

  return (
    <li className={styles.row}>
      <span className={`${styles.state} ${!s.enabled ? styles.off : failing ? styles.bad : styles.ok}`} aria-hidden />
      <div className={styles.body}>
        <strong>{s.displayName}</strong>
        <span className={styles.meta}>
          {!s.enabled
            ? "Not set up"
            : failing
              ? `Failed ${ago(s.lastSyncAt)}`
              : `Synced ${ago(s.lastSuccessAt)} · every ${s.intervalMinutes} min`}
        </span>
        {failing && <span className={styles.error}>{s.lastError}</span>}
        {r && !failing && (
          <span className={styles.meta}>
            Last sync: {r.created} new, {r.updated} changed, {r.completed} completed
          </span>
        )}
      </div>
      {s.enabled && (
        <button className="btn" onClick={() => sync.mutate(s.type)} disabled={busy}>
          {busy ? "Syncing…" : "Sync now"}
        </button>
      )}
    </li>
  );
}
