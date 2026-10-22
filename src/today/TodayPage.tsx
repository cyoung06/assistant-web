import { useRef } from "react";
import { filesRoute } from "../files/api";
import { formatDay, shortTime, toTimeString } from "../lib/dates";
import { useTasksUi } from "../tasks/context";
import { dueText } from "../tasks/model";
import { useToday, type Today } from "./api";
import styles from "./TodayPage.module.css";

type Event = Today["events"][number];

/** "12:30–13:45", or "All day". */
function when(e: Event) {
  if (!e.start || !e.end) return "All day";
  return `${shortTime(toTimeString(new Date(e.start)))}–${shortTime(toTimeString(new Date(e.end)))}`;
}

/** When the next class is, against now: "Now, until 13:45", "In 25 min", "Mon 12:30–13:45". */
function nextWhen(e: Event, now: Date) {
  const start = new Date(e.start!);
  const end = new Date(e.end!);
  if (start <= now) return `Now, until ${shortTime(toTimeString(end))}`;
  const minutes = Math.round((start.getTime() - now.getTime()) / 60_000);
  if (minutes < 60) return `In ${minutes} min`;
  const sameDay = start.toDateString() === now.toDateString();
  return `${sameDay ? "Today" : new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(start)} ${when(e)}`;
}

/** One screen of the day: the next class (room, newest files), today's events, what's due soon, Triage. */
/** Sends a photo (from the camera, on a phone) for the class on now into its project's folder; where it went. */
export async function sendClassPhoto(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file, file.name || "photo.jpg");
  const res = await fetch("/api/v1/drive/photo", { method: "POST", body });
  if (!res.ok) throw new Error(`Couldn't save the photo (${res.status})`);
  return ((await res.json()) as { paths: string[] }).paths[0]!;
}

export function TodayPage({ go, quickNote }: { go: (route: string) => void; quickNote: () => void }) {
  const today = useToday();
  const { openTask, notify } = useTasksUi();
  const photo = useRef<HTMLInputElement>(null);
  const t = today.data;
  const now = new Date();

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Today</h1>
        {t && <span className={styles.date}>{formatDay(t.date)}</span>}
        <span className={styles.spacer} />
        <button className="btn" onClick={quickNote} title="A note for the class on now (Q)">
          Quick note
        </button>
        <button className="btn" onClick={() => photo.current?.click()} title="A photo (a whiteboard, a handout) into the class's folder">
          Class photo
        </button>
        <input
          ref={photo}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) sendClassPhoto(file).then((p) => notify(`Saved to ${p.split("/")[1] ?? "the drive"}`), (err: Error) => notify(err.message));
          }}
        />
      </header>
      {today.isPending && <p className={styles.hint}>Loading…</p>}
      {today.error && <p className={styles.error}>{today.error.message}</p>}
      {t && (
        <div className={styles.grid}>
          <section className={`${styles.card} ${styles.next}`}>
            <h2>Next class</h2>
            {t.next ? (
              <>
                <button className={styles.title} onClick={() => go(`event/${encodeURIComponent(t.next!.event.id)}`)}>
                  {t.next.event.title}
                </button>
                <p className={styles.meta}>
                  <span className={styles.strong}>{nextWhen(t.next.event, now)}</span>
                  {t.next.event.location && <span> · {t.next.event.location}</span>}
                  {t.next.projectName && <span> · {t.next.projectName}</span>}
                </p>
                {t.next.files.length > 0 && (
                  <ul className={styles.files}>
                    {t.next.files.map((f) => (
                      <li key={f.path}>
                        <button onClick={() => go(filesRoute(f.path.replace(/^Projects\//, "")))}>{f.name}</button>
                        {f.modified && <span className={styles.meta}>{formatDay(f.modified.slice(0, 10)).replace(/^\w+, /, "")}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {t.next.folder && (
                  <button className="btn btn-ghost" onClick={() => go(filesRoute(t.next!.folder!.replace(/^Projects\//, "")))}>
                    All files
                  </button>
                )}
              </>
            ) : (
              <p className={styles.hint}>No classes this week. A lecture shows here once its event is linked to the course's project.</p>
            )}
          </section>

          <section className={styles.card}>
            <h2>Due soon</h2>
            {t.due.length === 0 && <p className={styles.hint}>Nothing due in the next two days.</p>}
            <ul className={styles.list}>
              {t.due.map((task) => (
                <li key={task.id}>
                  <button onClick={() => openTask(task.id)}>
                    <span className={styles.itemTitle}>{task.title}</span>
                    {task.due && <span className={task.overdue ? styles.overdue : styles.meta}>{dueText(task.due, t.date)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.card}>
            <h2>Today's events</h2>
            {t.events.length === 0 && <p className={styles.hint}>Nothing on the calendar today.</p>}
            <ul className={styles.list}>
              {t.events.map((e) => (
                <li key={`${e.id}|${e.start ?? e.startDate}`}>
                  <button onClick={() => go(`event/${encodeURIComponent(e.id)}`)}>
                    <span className={styles.dot} style={{ background: e.color ?? "var(--accent)" }} />
                    <span className={styles.itemTitle}>{e.title}</span>
                    <span className={styles.meta}>
                      {when(e)}
                      {e.location ? ` · ${e.location}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {t.triage > 0 && (
            <button className={`${styles.card} ${styles.triage}`} onClick={() => go("triage")}>
              <span className={styles.count}>{t.triage}</span> waiting in Triage
            </button>
          )}
        </div>
      )}
    </div>
  );
}
