import { useEffect, useRef, useState } from "react";
import type { CreateItem, QuickAddResult } from "../api/client";
import { useItemMutations, useQuickAddParse, useTagMutations, useTags } from "../api/queries";
import { formatDay, formatTime, shortTime } from "../lib/dates";
import { usePanel } from "./panel";
import { TagDot } from "./TagPicker";
import styles from "./QuickAdd.module.css";

const NEW_TAG_COLORS = ["#2F5BE0", "#E0642F", "#1F8A4C", "#A23FD1", "#D13B6E", "#0E8C9C", "#B88A00"];

/** Free-text capture: the API's LLM turns it into an item, shown for confirmation before saving. */
export function QuickAdd() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<QuickAddResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const parse = useQuickAddParse();
  const { create } = useItemMutations();
  const tagMutations = useTagMutations();
  const tags = useTags().data ?? [];
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

  const save = async (draft: CreateItem) => {
    await create.mutateAsync(draft);
    setNotice(`Added “${draft.title}”`);
    reset();
  };

  const createTag = async (name: string) => {
    const color = NEW_TAG_COLORS[tags.length % NEW_TAG_COLORS.length]!;
    const tag = await tagMutations.create.mutateAsync({ name, color });
    setResult((r) =>
      r && {
        ...r,
        unknownTags: r.unknownTags.filter((t) => t !== name),
        draft: { ...r.draft, tagIds: [...(r.draft.tagIds ?? []), tag.id], mainTagId: r.draft.mainTagId ?? tag.id },
      },
    );
  };

  const draft = result?.draft;
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
      {parse.error && <div className={`${styles.preview} ${styles.error}`}>{parse.error.message}</div>}

      {draft && (
        <div className={styles.preview} role="dialog" aria-label="Confirm new item">
          {!result.parsed && <p className={styles.note}>Couldn’t read a date from this. It will be saved as a plain item.</p>}
          <input
            className={`input ${styles.title}`}
            value={draft.title ?? ""}
            aria-label="Title"
            onChange={(e) => setResult({ ...result, draft: { ...draft, title: e.target.value } })}
          />
          <div className={styles.facts}>
            {draft.by && (
              <span className={styles.fact}>
                <b>Due</b> {formatDay(draft.by.date)}
                {draft.by.time ? ` ${shortTime(draft.by.time)}` : ""}
              </span>
            )}
            {draft.at && (
              <span className={styles.fact}>
                <b>At</b>{" "}
                {draft.at.allDay
                  ? formatDay(draft.at.startDate!)
                  : `${formatDay(new Date(draft.at.start!))} ${formatTime(draft.at.start!)}–${formatTime(draft.at.end!)}`}
              </span>
            )}
            {!draft.by && !draft.at && <span className={styles.fact}>No date. You can sort it later.</span>}
            {(draft.tagIds ?? []).map((id) => {
              const tag = tags.find((t) => t.id === id);
              return (
                tag && (
                  <span key={id} className={styles.fact}>
                    <TagDot color={tag.color} /> {tag.name}
                  </span>
                )
              );
            })}
            {result.unknownTags.map((name) => (
              <button key={name} type="button" className={styles.newTag} onClick={() => createTag(name)}>
                + Create tag “{name}”
              </button>
            ))}
          </div>
          <div className={styles.actions}>
            <button className="btn btn-ghost" type="button" onClick={reset}>
              Cancel
            </button>
            {(draft.by || draft.at) && (
              <button className="btn" type="button" onClick={() => save({ ...draft, by: null, at: null })}>
                Save without date
              </button>
            )}
            <button
              className="btn"
              type="button"
              onClick={() => {
                openDraft(draft);
                reset();
              }}
            >
              Details
            </button>
            <button className="btn btn-primary" type="button" onClick={() => save(draft)} disabled={create.isPending}>
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
