import type { SourceStatus } from "../api/client";
import { useEffect, useRef, useState } from "react";
import { useChatGptAccount, useChatGptMutations, useFeed, useMailAccount, useMailMutations, usePublicTokenMutations, usePublicTokens, useRotateFeed, useSources, useSyncSource } from "../api/sources";
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
        <p className={styles.hint}>Tasks and events from these sources sync on their own. You keep control of status, priority, labels and notes.</p>
        {sources.isPending && <p className={styles.hint}>Loading…</p>}
        {sources.error && <p className={styles.error}>{sources.error.message}</p>}
        <ul className={styles.list}>
          {(sources.data ?? []).map((s) => (
            <SourceRow key={s.type} source={s} />
          ))}
        </ul>
        <ChatGpt />
        <CalendarFeed />
        <OutlookAddin />
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
      {s.type === "email" && <MailAccount onConnected={() => sync.mutate(s.type)} />}
    </li>
  );
}

/**
 * The Outlook sign-in: Microsoft's device code flow, so you sign in (with POSTECH's login) on
 * Microsoft's own page and this app only ever sees a token.
 */
function MailAccount({ onConnected }: { onConnected: () => void }) {
  const account = useMailAccount();
  const { connect, disconnect } = useMailMutations();
  const [copied, setCopied] = useState(false);
  const a = account.data;
  const wasPending = useRef(false);

  // Sync right after a sign-in completes, so flagged mail shows up without waiting.
  useEffect(() => {
    if (a?.state === "pending") wasPending.current = true;
    else if (wasPending.current && a?.state === "connected") {
      wasPending.current = false;
      onConnected();
    }
  }, [a?.state, onConnected]);

  if (!a) return null;
  const error = connect.error?.message ?? a.error;
  return (
    <div className={styles.mail}>
      {!a.configured ? (
        <p className={styles.meta}>Not set up on the server yet (Microsoft app ID and token key).</p>
      ) : a.state === "pending" ? (
        <>
          <p className={styles.meta}>
            Open{" "}
            <a href={a.verificationUri ?? "https://microsoft.com/devicelogin"} target="_blank" rel="noreferrer">
              {(a.verificationUri ?? "microsoft.com/devicelogin").replace(/^https?:\/\//, "")}
            </a>{" "}
            and enter this code, then sign in with your POSTECH account:
          </p>
          <div className={styles.codeRow}>
            <code className={styles.code}>{a.userCode}</code>
            <button
              className="btn"
              onClick={() => {
                navigator.clipboard?.writeText(a.userCode ?? "").then(() => setCopied(true), () => {});
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button className="btn btn-ghost" onClick={() => disconnect.mutate()}>
              Cancel
            </button>
          </div>
          <p className={styles.meta}>Waiting for you to sign in…</p>
        </>
      ) : a.state === "connected" ? (
        <div className={styles.codeRow}>
          <span className={styles.meta}>
            Connected as <strong>{a.email}</strong>. Flag a mail in Outlook to add it to Tasks; reply or unflag to finish it.
          </span>
          <button className="btn btn-ghost" onClick={() => disconnect.mutate()}>
            Disconnect
          </button>
        </div>
      ) : (
        <>
          {error && <p className={styles.error}>{error}</p>}
          <p className={styles.meta}>Reply later: flag a mail in Outlook and it shows up in Tasks, labeled “reply”.</p>
          <div>
            <button className="btn btn-primary" onClick={() => connect.mutate()} disabled={connect.isPending}>
              {a.state === "error" ? "Reconnect POSTECH mail" : "Connect POSTECH mail"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The model behind Analyze, through a ChatGPT sign-in (it uses the account's Codex quota). OpenAI
 * only sends the sign-in back to a localhost address, so the user pastes that address here.
 */
function ChatGpt() {
  const account = useChatGptAccount();
  const { connect, complete, disconnect } = useChatGptMutations();
  const [link, setLink] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const a = account.data;
  if (!a) return null;
  const error = connect.error?.message ?? complete.error?.message ?? a.error;

  const start = () =>
    connect.mutate(undefined, {
      onSuccess: (r) => {
        setLink(r.authorizeUrl);
        window.open(r.authorizeUrl, "_blank", "noopener");
      },
    });

  return (
    <section className={styles.feed}>
      <h3>ChatGPT</h3>
      <p className={styles.hint}>The model that reads screenshots and mail when you press Analyze. It runs only then, on your Codex quota.</p>
      {error && <p className={styles.error}>{error}</p>}
      {!a.configured ? (
        <p className={styles.meta}>Not set up on the server yet (token key).</p>
      ) : a.state === "connected" ? (
        <>
          <div className={styles.codeRow}>
            <span className={styles.meta}>
              Connected as <strong>{a.email}</strong>
              {a.plan && <> ({a.plan})</>} · model {a.model}
            </span>
            <button className="btn btn-ghost" onClick={() => disconnect.mutate()}>
              Disconnect
            </button>
          </div>
          {(a.quota ?? []).length > 0 && (
            <p className={styles.meta}>
              Codex quota:{" "}
              {(a.quota ?? [])
                .map((q) => `${q.name} ${Math.round(q.usedPercent)}% used${q.resetsAt ? `, resets ${new Date(q.resetsAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : ""}`)
                .join(" · ")}
            </p>
          )}
        </>
      ) : link || a.state === "pending" ? (
        <>
          <ol className={styles.steps}>
            <li>
              Sign in to ChatGPT in the tab that opened{link && (<> (or <a href={link} target="_blank" rel="noreferrer">open it again</a>)</>)}.
            </li>
            <li>
              It ends on a <code>localhost:1455</code> page that doesn’t load. That’s expected: copy that page’s address.
            </li>
            <li>Paste it here.</li>
          </ol>
          <form
            className={styles.feedActions}
            onSubmit={(e) => {
              e.preventDefault();
              complete.mutate(pasted.trim(), { onSuccess: () => { setLink(null); setPasted(""); } });
            }}
          >
            <input
              id="chatgpt-redirect"
              className="input"
              placeholder="http://localhost:1455/auth/callback?code=…"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              aria-label="Address after signing in"
            />
            <button className="btn btn-primary" disabled={!pasted.trim() || complete.isPending}>
              {complete.isPending ? "Connecting…" : "Connect"}
            </button>
          </form>
          {!link && (
            <div>
              <button className="btn btn-ghost" onClick={start}>
                Make a new sign-in link
              </button>
            </div>
          )}
        </>
      ) : (
        <div>
          <button className="btn btn-primary" onClick={start} disabled={connect.isPending}>
            {a.state === "error" ? "Reconnect ChatGPT" : "Connect ChatGPT"}
          </button>
        </div>
      )}
    </section>
  );
}

const MANIFEST = "https://assistant.syeyoung.dev/outlook/manifest.xml";

/**
 * The Outlook add-in: install it from its manifest, then paste a token (made here) into it. The
 * add-in reaches only Assistant's few public endpoints, with that token.
 */
function OutlookAddin() {
  const tokens = usePublicTokens();
  const { create, revoke } = usePublicTokenMutations();
  const [created, setCreated] = useState<string | null>(null);

  return (
    <section className={styles.feed}>
      <h3>Outlook add-in</h3>
      <p className={styles.hint}>
        Adds an “Add to Assistant” button to mails in Outlook (web, Mac, phone): reply later, or have the model read the mail. In Outlook: Get
        Add-ins → My add-ins → Add a custom add-in → From URL, with <code>{MANIFEST}</code>. Then paste a token from here into the add-in.
      </p>
      {created ? (
        <div className={styles.feedActions}>
          <input id="addin-token" className="input" readOnly value={created} onFocus={(e) => e.target.select()} aria-label="New token" />
          <button className="btn" onClick={() => navigator.clipboard?.writeText(created)}>
            Copy
          </button>
        </div>
      ) : (
        <div>
          <button className="btn" disabled={create.isPending} onClick={() => create.mutate("Outlook add-in", { onSuccess: (t) => setCreated(t.token) })}>
            Create token
          </button>
        </div>
      )}
      {created && <p className={styles.hint}>Shown only now. Paste it into the add-in.</p>}
      {(tokens.data ?? []).map((t) => (
        <div key={t.id} className={styles.feedActions}>
          <span className={styles.meta}>
            {t.name} · made {new Date(t.createdAt).toLocaleDateString()} · {t.lastUsed ? `used ${ago(t.lastUsed)}` : "not used yet"}
          </span>
          <button className="btn btn-ghost" onClick={() => revoke.mutate(t.id)}>
            Revoke
          </button>
        </div>
      ))}
    </section>
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
        One read-only feed with every calendar: events, classes, tasks and a “Due:” entry for each open deadline. You act here;
        your devices show it. Works on your tailnet. Keep the URL private.
      </p>
      <ul className={styles.steps}>
        <li>
          <b>Mac:</b> Calendar → File → New Calendar Subscription, paste the URL, set auto-refresh to every 5 minutes.
        </li>
        <li>
          <b>Android:</b> install ICSx⁵, add a subscription with the URL; your calendar app then shows it.
        </li>
      </ul>
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
