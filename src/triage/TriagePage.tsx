import { useEffect, useMemo, useState, type ClipboardEvent, type DragEvent, type ReactNode } from "react";
import { today } from "../lib/dates";
import { useProjects, useTasks } from "../tasks/api";
import { shortcutsBlocked } from "../tasks/context";
import { dueText } from "../tasks/model";
import { kindOf } from "../refs/kinds";
import { upload, useTriage, useTriageMutations, type Proposal, type TriageInput, type TriageItem } from "./api";
import styles from "./TriagePage.module.css";

const SOURCE: Record<string, string> = { share: "Shared", capture: "Captured", addin: "From Outlook", mail: "Mail" };

const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)}h ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
};

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/** When a suggestion is for: a task's due date, or an event's time. */
function when(p: Proposal): string {
  if (p.kind === "event") {
    if (p.startDate) return new Date(`${p.startDate}T00:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    if (p.start) {
      const day = new Date(p.start).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
      return `${day} ${time(p.start)}${p.end ? `–${time(p.end)}` : ""}`;
    }
    return "";
  }
  return p.due ? `Due ${dueText(p.due, today())}` : "No due date";
}

/**
 * Triage, as in Linear: what was shared or sent in, read by the model in the background, with its
 * suggestions to accept (a task or event is made) or decline. Screenshots and text can also be
 * pasted or dropped here.
 */
export function TriagePage() {
  const triage = useTriage();
  const inputs = triage.data ?? [];
  const { accept, decline } = useTriageMutations();
  const [selected, setSelected] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<Proposal>>>({});

  const open = inputs.filter((i) => i.items.some((x) => x.status === "pending"));
  const reading = inputs.filter((i) => i.status === "pending");
  const failed = inputs.filter((i) => i.status === "failed");
  const nothing = inputs.filter((i) => i.status === "done" && i.items.length === 0);
  const handled = inputs.filter((i) => i.status === "done" && i.items.length > 0 && i.items.every((x) => x.status !== "pending"));
  const pendingItems = useMemo(() => open.flatMap((i) => i.items.filter((x) => x.status === "pending")), [open]);

  const proposalOf = (item: TriageItem): Proposal => ({ ...item.proposal, ...edits[item.id] });
  const act = (item: TriageItem, yes: boolean) => {
    const i = pendingItems.findIndex((x) => x.id === item.id);
    setSelected(pendingItems[i + 1]?.id ?? pendingItems[i - 1]?.id ?? null);
    if (yes) accept.mutate({ id: item.id, proposal: proposalOf(item) });
    else decline.mutate(item.id);
  };

  // Linear's keys: j/k to move, 1 to accept, 3 to decline.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutsBlocked(e) || pendingItems.length === 0) return;
      const i = Math.max(0, pendingItems.findIndex((x) => x.id === selected));
      const current = pendingItems.find((x) => x.id === selected) ?? pendingItems[0]!;
      if (e.key === "j") setSelected(pendingItems[Math.min(i + 1, pendingItems.length - 1)]!.id);
      else if (e.key === "k") setSelected(pendingItems[Math.max(i - 1, 0)]!.id);
      else if (e.key === "1") act(current, true);
      else if (e.key === "3") act(current, false);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Triage</h1>
      <Composer />
      <div className={styles.scroll}>
        {triage.isPending && <p className={styles.note}>Loading…</p>}
        {triage.error && <p className={styles.error}>{triage.error.message}</p>}
        {triage.isSuccess && open.length === 0 && reading.length === 0 && failed.length === 0 && (
          <p className={styles.note}>All clear. Share a screenshot from your phone or Mac, or paste one above: the model reads it and suggests tasks here.</p>
        )}
        {reading.map((i) => (
          <InputCard key={i.id} input={i}>
            <p className={styles.status}>{i.error ? `Waiting: ${i.error}` : "Reading…"}</p>
          </InputCard>
        ))}
        {open.map((i) => (
          <InputCard key={i.id} input={i}>
            {i.items.map((item) =>
              item.status === "pending" ? (
                <Suggestion
                  key={item.id}
                  item={item}
                  proposal={proposalOf(item)}
                  selected={item.id === (selected ?? pendingItems[0]?.id)}
                  onSelect={() => setSelected(item.id)}
                  onEdit={(p) => setEdits((e) => ({ ...e, [item.id]: { ...e[item.id], ...p } }))}
                  onAccept={() => act(item, true)}
                  onDecline={() => act(item, false)}
                />
              ) : (
                <Decided key={item.id} item={item} />
              ),
            )}
          </InputCard>
        ))}
        {failed.map((i) => (
          <InputCard key={i.id} input={i}>
            <p className={styles.error}>Couldn't read this: {i.error}</p>
          </InputCard>
        ))}
        <Folded label="Nothing to do" inputs={nothing} />
        <Folded label="Handled" inputs={handled} />
      </div>
    </div>
  );
}

/** Paste or drop screenshots, or type text, and send it to Triage. */
function Composer() {
  const { submit } = useTriageMutations();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const add = (list: FileList | File[]) => setFiles((f) => [...f, ...Array.from(list).filter((x) => x.type.startsWith("image/"))]);
  const send = async () => {
    if (!text.trim() && files.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const attachmentIds = await Promise.all(files.map(upload));
      await submit.mutateAsync({ text, attachmentIds });
      setText("");
      setFiles([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={styles.composer}
      onDragOver={(e: DragEvent) => e.preventDefault()}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        add(e.dataTransfer.files);
      }}
    >
      <textarea
        id="triage-text"
        className="input"
        rows={2}
        placeholder="Paste a screenshot or text, or drop images here…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e: ClipboardEvent) => {
          if (e.clipboardData.files.length) {
            e.preventDefault();
            add(e.clipboardData.files);
          }
        }}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && send()}
      />
      <div className={styles.composerBar}>
        {files.map((f, i) => (
          <span key={i} className={styles.file}>
            <img src={URL.createObjectURL(f)} alt="" />
            <button aria-label="Remove" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>
              ✕
            </button>
          </span>
        ))}
        {error && <span className={styles.error}>{error}</span>}
        <span className={styles.spacer} />
        <button className="btn btn-primary" disabled={sending || (!text.trim() && files.length === 0)} onClick={send}>
          {sending ? "Sending…" : "Send to Triage"}
        </button>
      </div>
    </div>
  );
}

function InputCard({ input: i, children }: { input: TriageInput; children: ReactNode }) {
  const { retry, dismiss } = useTriageMutations();
  return (
    <section className={styles.card}>
      <header className={styles.cardHead}>
        <span className={styles.source}>{SOURCE[i.source] ?? i.source}</span>
        {i.link ? (
          <a className="ref" data-kind={kindOf(i.link)} href={i.link}>
            {i.title}
          </a>
        ) : (
          <span className={styles.inputTitle}>{i.title}</span>
        )}
        <span className={styles.when}>{ago(i.createdAt)}</span>
        <span className={styles.spacer} />
        {i.status !== "pending" && (
          <button className="btn btn-ghost" onClick={() => retry.mutate(i.id)} title="Have the model read it again">
            Read again
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => dismiss.mutate(i.id)} title="Remove this input and its suggestions">
          Dismiss
        </button>
      </header>
      {i.attachments.length > 0 && (
        <div className={styles.shots}>
          {i.attachments.map((a) => (
            <a key={a.id} href={`/api/v1/attachments/${a.id}`} target="_blank" rel="noreferrer">
              <img src={`/api/v1/attachments/${a.id}`} alt={a.filename} />
            </a>
          ))}
        </div>
      )}
      {i.text && i.text.trim() !== i.title && i.attachments.length === 0 && i.items.length === 0 && <p className={styles.text}>{i.text.slice(0, 280)}</p>}
      {children}
    </section>
  );
}

function Suggestion(props: {
  item: TriageItem;
  proposal: Proposal;
  selected: boolean;
  onSelect: () => void;
  onEdit: (p: Partial<Proposal>) => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { item, proposal: p, selected } = props;
  const projects = (useProjects().data ?? []).filter((x) => x.state !== "completed" && x.state !== "canceled");
  const same = useTasks().data?.find((t) => t.number === item.sameAs);
  return (
    <div className={`${styles.item} ${selected ? styles.selected : ""}`} onClick={props.onSelect}>
      <span className={styles.kind}>{p.kind === "event" ? "Event" : "Task"}</span>
      <div className={styles.main}>
        <input className={styles.itemTitle} aria-label="Title" value={p.title} onChange={(e) => props.onEdit({ title: e.target.value })} />
        <div className={styles.meta}>
          <span>{when(p)}</span>
          <select className={styles.project} aria-label="Project" value={p.projectId ?? ""} onChange={(e) => props.onEdit({ projectId: e.target.value || undefined })}>
            <option value="">No project</option>
            {projects.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          {same && (
            <a className={styles.same} href={`/task/${same.id}`}>
              Looks like #{same.number}
            </a>
          )}
        </div>
        {p.description && <p className={styles.desc}>{p.description}</p>}
      </div>
      <div className={styles.actions}>
        <button className="btn btn-primary" onClick={props.onAccept} title="Accept (1)">
          Accept
        </button>
        <button className="btn btn-ghost" onClick={props.onDecline} title={same ? "Decline: it's already a task (3)" : "Decline (3)"}>
          Decline
        </button>
      </div>
    </div>
  );
}

function Decided({ item }: { item: TriageItem }) {
  return (
    <div className={`${styles.item} ${styles.decided}`}>
      <span className={styles.kind}>{item.proposal.kind === "event" ? "Event" : "Task"}</span>
      <span className={styles.main}>{item.proposal.title}</span>
      {item.status === "accepted" && item.result ? <a href={item.result}>Accepted ↗</a> : <span>Declined</span>}
    </div>
  );
}

function Folded({ label, inputs }: { label: string; inputs: TriageInput[] }) {
  const [open, setOpen] = useState(false);
  if (inputs.length === 0) return null;
  return (
    <section className={styles.folded}>
      <button className={styles.foldHead} onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {label} <span className={styles.when}>{inputs.length}</span>
      </button>
      {open &&
        inputs.map((i) => (
          <InputCard key={i.id} input={i}>
            {i.items.map((item) => (
              <Decided key={item.id} item={item} />
            ))}
          </InputCard>
        ))}
    </section>
  );
}
