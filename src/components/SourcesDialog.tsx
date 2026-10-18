import type { SourceStatus } from "../api/client";
import { useState } from "react";
import { useFeed, useRotateFeed, useSources, useSyncSource } from "../api/queries";
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
        <Devices />
        <CalendarFeed />
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
            Last sync: {r.created} new, {r.updated} changed, {r.completed} completed{r.deleted ? `, ${r.deleted} removed` : ""}
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

/** The iCal export: a private URL calendar apps (Apple Calendar on your devices) can subscribe to. */
function CalendarFeed() {
  const feed = useFeed();
  const rotate = useRotateFeed();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const url = feed.data ? `${location.origin}${feed.data.path}` : "";
  const webcal = url.replace(/^https?:/, "webcal:");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className={styles.feed}>
      <h3>Calendar feed</h3>
      <p className={styles.hint}>
        Subscribe to this URL in Apple Calendar (File → New Calendar Subscription, or tap the link on iPhone) to see your events,
        classes and open deadlines there. Works on devices on your tailnet. Keep it private.
      </p>
      {feed.error && <p className={styles.error}>{feed.error.message}</p>}
      {url && (
        <>
          <input id="feed-url" className="input" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Calendar feed URL" />
          <div className={styles.feedActions}>
            <button className="btn" onClick={copy}>
              {copied ? "Copied" : "Copy URL"}
            </button>
            <a className="btn" href={webcal}>
              Open in Calendar
            </a>
            {confirming ? (
              <>
                <button className="btn btn-danger" onClick={() => rotate.mutate(undefined, { onSettled: () => setConfirming(false) })}>
                  Replace URL
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button className="btn btn-ghost" onClick={() => setConfirming(true)}>
                New URL…
              </button>
            )}
          </div>
          {confirming && <p className={styles.hint}>Existing subscriptions stop updating; subscribe again with the new URL.</p>}
        </>
      )}
    </section>
  );
}

/** How to connect Calendar, Reminders and Android apps to the CalDAV server. */
function Devices() {
  const url = "https://dav.lonk-kelvin.ts.net";
  return (
    <section className={styles.feed}>
      <h3>Connect your apps (CalDAV)</h3>
      <p className={styles.hint}>
        Events and tasks live on your CalDAV server, so any CalDAV app shows and edits them. Server: <code>{url}</code>, user{" "}
        <code>syeyoung</code>, password from your secrets. Tailnet only.
      </p>
      <ul className={styles.steps}>
        <li>
          <b>Mac:</b> System Settings → Internet Accounts → Add Other Account → CalDAV account → Manual, with the server above. Calendar
          and Reminders then show your calendars.
        </li>
        <li>
          <b>Android:</b> install DAVx⁵ and Tasks.org, add an account in DAVx⁵ with “Login with URL and user name”, then enable the
          calendars. Your calendar app shows events; Tasks.org shows tasks with categories, sub-tasks and done.
        </li>
      </ul>
    </section>
  );
}
