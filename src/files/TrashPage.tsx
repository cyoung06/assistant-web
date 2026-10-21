import { useState } from "react";
import { appUrl, parentOf, size, useTrash, useTrashMutations } from "./api";
import styles from "./TrashPage.module.css";

/**
 * The drive's trash: what was deleted (here, in the apps, or in Finder), kept 30 days. Each can be
 * put back where it was, or deleted for good; or the whole trash emptied.
 */
export function TrashPage() {
  const trash = useTrash();
  const { restore, purge, empty } = useTrashMutations();
  const [confirm, setConfirm] = useState<string | "all" | null>(null);
  const [done, setDone] = useState<{ name: string; path: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = trash.data ?? [];
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1>Trash</h1>
        <span className={styles.note}>Deleted things are kept 30 days, then let go.</span>
        <span className={styles.spacer} />
        {items.length > 0 &&
          (confirm === "all" ? (
            <span className={styles.ask}>
              Delete all {items.length} for good?
              <button className="btn btn-danger" onClick={() => (setConfirm(null), empty.mutateAsync().catch(fail))}>
                Empty Trash
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirm(null)}>
                Keep
              </button>
            </span>
          ) : (
            <button className="btn" onClick={() => setConfirm("all")}>
              Empty Trash
            </button>
          ))}
      </div>
      {error && (
        <p className={styles.error} onClick={() => setError(null)}>
          {error}
        </p>
      )}
      {done && (
        <p className={styles.done}>
          “{done.name}” is back in <a href={appUrl(parentOf(done.path))}>{parentOf(done.path).replace(/^Projects\//, "") || "the drive"}</a>.
        </p>
      )}
      {trash.isPending ? (
        <p className={styles.note}>Loading…</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>The trash is empty.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((t) => (
            <li key={t.id} className={styles.item}>
              <span className={styles.icon} aria-hidden>
                {t.folder ? "📁" : "📄"}
              </span>
              <span className={styles.what}>
                <span className={styles.name}>{t.name}</span>
                <span className={styles.from}>
                  from {parentOf(t.path).replace(/^Projects\//, "") || "the drive"} · {new Date(t.deletedAt).toLocaleString()}
                  {!t.folder && ` · ${size(t.size)}`}
                </span>
              </span>
              {confirm === t.id ? (
                <span className={styles.ask}>
                  Delete for good?
                  <button className="btn btn-danger" onClick={() => (setConfirm(null), purge.mutateAsync(t.id).catch(fail))}>
                    Delete
                  </button>
                  <button className="btn btn-ghost" onClick={() => setConfirm(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <>
                  <button
                    className="btn"
                    onClick={() =>
                      restore
                        .mutateAsync(t.id)
                        .then((path) => setDone({ name: t.name, path }))
                        .catch(fail)
                    }
                  >
                    Put Back
                  </button>
                  <button className="btn btn-ghost" onClick={() => setConfirm(t.id)}>
                    Delete for good…
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
