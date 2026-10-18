import { useEffect, useRef, useState } from "react";
import type { QuickAddDraft, QuickAddResult } from "../api/client";
import { useEventMutations, useQuickAddParse, useTaskMutations } from "../api/queries";
import { formatDay, formatTime, shortTime } from "../lib/dates";
import { usePanel } from "./panel";
import styles from "./QuickAdd.module.css";

/** Free-text capture: the LLM turns it into a task or an event, shown for confirmation before saving. */
export function QuickAdd() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<QuickAddResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const parse = useQuickAddParse();
  const tasks = useTaskMutations();
  const events = useEventMutations();
  const { openDraft } = usePanel();

  // Cmd/Ctrl+K focuses quick add from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const reset = () => {
    setText("");
    setResult(null);
    parse.reset();
  };

  const submit = async () => {
    if (!text.trim()) return;
    if (result) return save(result.draft);
    setResult(await parse.mutateAsync(text));
  };

  const save = async (d: QuickAddDraft) => {
    if (d.kind === "event") {
      await events.create.mutateAsync({
        title: d.title,
        notes: d.notes,
        categories: d.categories,
        start: d.start,
        end: d.end,
        startDate: d.startDate,
        endDate: d.endDate,
      });
    } else {
      await tasks.create.mutateAsync({ title: d.title, notes: d.notes, categories: d.categories, due: d.due });
    }
    setNotice(`Added “${d.title}”`);
    reset();
  };

  const draft = result?.draft;
  const saving = tasks.create.isPending || events.create.isPending;
  const error = parse.error ?? tasks.create.error ?? events.create.error;

  return (
    <div className={styles.wrap}>
      <form
        className={styles.bar}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          id="quick-add"
          ref={inputRef}
          className={styles.input}
          value={text}
          placeholder="Add anything… “DB hw due fri 11pm”, “금요일 3시 교수님 미팅”"
          aria-label="Quick add"
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          onKeyDown={(e) => e.key === "Escape" && reset()}
        />
        <kbd className={styles.kbd}>⌘K</kbd>
      </form>

      {parse.isPending && <div className={styles.preview}>Reading…</div>}
      {error && !parse.isPending && <div className={`${styles.preview} ${styles.error}`}>{error.message}</div>}

      {draft && (
        <div className={styles.preview} role="dialog" aria-label="Confirm">
          {!result.parsed && <p className={styles.note}>Couldn’t read a date from this. It will be saved as a task without one.</p>}
          <input
            id="quick-add-title"
            className={`input ${styles.title}`}
            value={draft.title}
            aria-label="Title"
            onChange={(e) => setResult({ ...result, draft: { ...draft, title: e.target.value } })}
          />
          <div className={styles.facts}>
            <span className={styles.fact}>
              <b>{draft.kind === "event" ? "Event" : "Task"}</b>
            </span>
            {draft.due && (
              <span className={styles.fact}>
                <b>Due</b> {formatDay(draft.due.date)}
                {draft.due.time ? ` ${shortTime(draft.due.time)}` : ""}
              </span>
            )}
            {draft.kind === "event" && (
              <span className={styles.fact}>
                <b>At</b>{" "}
                {draft.startDate
                  ? formatDay(draft.startDate)
                  : `${formatDay(new Date(draft.start!))} ${formatTime(draft.start!)}–${formatTime(draft.end!)}`}
              </span>
            )}
            {draft.kind === "task" && !draft.due && <span className={styles.fact}>No date. You can sort it later.</span>}
            {draft.categories?.map((c) => (
              <span key={c} className={styles.fact}>
                {c}
              </span>
            ))}
          </div>
          <div className={styles.actions}>
            <button className="btn btn-ghost" type="button" onClick={reset}>
              Cancel
            </button>
            {draft.kind === "task" && (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  openDraft({ title: draft.title, notes: draft.notes, due: draft.due, categories: draft.categories });
                  reset();
                }}
              >
                Details
              </button>
            )}
            <button className="btn btn-primary" type="button" onClick={() => save(draft)} disabled={saving}>
              Save ↵
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className={styles.toast} role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
