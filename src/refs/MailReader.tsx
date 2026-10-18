import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../api/client";
import styles from "./MailReader.module.css";

/**
 * One mail, read-only, fetched from the mail server when opened (nothing is stored). HTML mail is
 * shown in a sandboxed frame: no scripts, no remote images or styles.
 */
export function MailReader({ messageId, back }: { messageId: string; back: () => void }) {
  const message = useQuery({
    queryKey: ["mail-message", messageId],
    queryFn: async () => unwrap(await api.GET("/api/v1/mail/message", { params: { query: { id: messageId } } })),
    retry: false,
  });
  const m = message.data;
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'">`;

  return (
    <div className={styles.page}>
      <div className={styles.bar}>
        <button className="btn btn-ghost" onClick={back}>
          ← Back
        </button>
      </div>
      {message.isPending && <p className={styles.note}>Loading the mail…</p>}
      {message.error && <p className={styles.note}>{message.error.message}</p>}
      {m && (
        <article className={styles.mail}>
          <h1>{m.subject || "(no subject)"}</h1>
          <dl className={styles.head}>
            <dt>From</dt>
            <dd>{m.from}</dd>
            {m.to.length > 0 && (
              <>
                <dt>To</dt>
                <dd>{m.to.join(", ")}</dd>
              </>
            )}
            {m.received && (
              <>
                <dt>Date</dt>
                <dd>{new Date(m.received).toLocaleString()}</dd>
              </>
            )}
          </dl>
          {m.html ? (
            <iframe className={styles.frame} title="Mail" sandbox="" srcDoc={csp + m.html} />
          ) : (
            <pre className={styles.text}>{m.text ?? ""}</pre>
          )}
        </article>
      )}
    </div>
  );
}
