import { useEffect, useState } from "react";
import { ApiError, type At, type CreateItem, type Item, type ItemPatch } from "../api/client";
import { useChangeRepeat, useDescendants, useItem, useItemMutations, useSeries, useTags } from "../api/queries";
import { formatDuration, toDateString } from "../lib/dates";
import { describeRepeat, touchesSeries, type RepeatRule } from "../lib/repeat";
import { RepeatEditor } from "./RepeatEditor";
import { useAskScope } from "./ScopePrompt";
import { ItemForm, type ItemValues } from "./ItemForm";
import { ItemRow } from "./ItemRow";
import { usePanel, type PanelTarget } from "./panel";
import styles from "./ItemPanel.module.css";

export function ItemPanel({ target }: { target: PanelTarget }) {
  const { close } = usePanel();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  if (!target) return null;
  return (
    <aside className={styles.panel} aria-label="Item details">
      <button className={`btn btn-ghost ${styles.close}`} onClick={close} aria-label="Close">
        ✕
      </button>
      {target.kind === "item" ? <ExistingItem id={target.id} /> : <NewItem key={JSON.stringify(target.draft)} draft={target.draft} />}
    </aside>
  );
}

/** The local date an event starts on, or null for items without a scheduled time. */
function atDate(at: At | null | undefined): string | null {
  if (!at) return null;
  return at.allDay ? at.startDate! : toDateString(new Date(at.start!));
}

function toValues(src: CreateItem | Item): ItemValues {
  return {
    title: src.title ?? "",
    notes: src.notes ?? "",
    by: src.by ?? null,
    at: src.at ?? null,
    tagIds: src.tagIds ?? [],
    mainTagId: src.mainTagId ?? null,
  };
}

function NewItem({ draft }: { draft: CreateItem }) {
  const { openItem } = usePanel();
  const tags = useTags().data ?? [];
  const { create } = useItemMutations();
  const [values, setValues] = useState<CreateItem>(draft);

  const save = async () => {
    const item = await create.mutateAsync(values);
    openItem(item.id);
  };

  return (
    <div className={styles.body}>
      <p className="label">{draft.parentId ? "New sub-item" : "New item"}</p>
      <ItemForm
        value={toValues(values)}
        tags={tags}
        autoFocusTitle
        onChange={(patch) => setValues((v) => ({ ...v, ...(patch as Partial<CreateItem>) }))}
      />
      {atDate(values.at) && !values.by && !values.parentId && (
        <section className={styles.repeat}>
          <span className="label">Repeat</span>
          <RepeatEditor value={values.repeat ?? null} startDate={atDate(values.at)!} onChange={(repeat) => setValues((v) => ({ ...v, repeat }))} />
        </section>
      )}
      {create.error && <p className={styles.error}>{create.error.message}</p>}
      <div className={styles.actions}>
        <button className="btn btn-primary" onClick={save} disabled={create.isPending}>
          Create
        </button>
      </div>
    </div>
  );
}

function ExistingItem({ id }: { id: string }) {
  const { openItem, openDraft, close } = usePanel();
  const item = useItem(id);
  const descendants = useDescendants(id);
  const tags = useTags().data ?? [];
  const { patch, create, remove, restore } = useItemMutations();
  const askScope = useAskScope();
  const [deleted, setDeleted] = useState<"undoable" | "series" | null>(null);
  const [newChild, setNewChild] = useState("");
  // Bumped to reset the form when a change is cancelled at the scope prompt.
  const [formKey, setFormKey] = useState(0);

  if (deleted) {
    return (
      <div className={styles.body}>
        <p>{deleted === "series" ? "Repeating events deleted." : "Item deleted, including its sub-items."}</p>
        <div className={styles.actions}>
          {deleted === "undoable" && (
            <button
              className="btn"
              onClick={async () => {
                await restore.mutateAsync(id);
                setDeleted(null);
              }}
            >
              Undo
            </button>
          )}
          <button className="btn btn-ghost" onClick={close}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if (item.isPending) return <div className={styles.body}>Loading…</div>;
  if (item.error) return <div className={styles.body}>{item.error.message}</div>;
  const current = item.data;

  const save = async (change: ItemPatch) => {
    let scope: "this" | "following" | "all" | undefined;
    if (current.series && touchesSeries(change)) {
      // Moving an occurrence to another day can only apply to that occurrence.
      const sameDay = !("at" in change) || atDate(change.at) === current.series.occurrenceDate;
      const answer = await askScope({ action: "edit", seriesWide: sameDay });
      if (!answer) return setFormKey((k) => k + 1);
      scope = answer;
    }
    patch.mutate({ id, patch: change, version: current.version, scope });
  };
  const conflict = patch.error instanceof ApiError && patch.error.status === 412;

  const addChild = async () => {
    const title = newChild.trim();
    if (!title) return;
    await create.mutateAsync({ title, parentId: id });
    setNewChild("");
  };

  const scheduleSession = () => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    openDraft({
      parentId: id,
      title: "",
      at: { allDay: false, start: start.toISOString(), end: new Date(start.getTime() + 3_600_000).toISOString() },
    });
  };

  const d = current.derived;
  return (
    <div className={styles.body}>
      <label className={styles.done}>
        <input
          className="checkbox"
          type="checkbox"
          checked={current.doneAt != null}
          onChange={(e) => save({ doneAt: e.target.checked ? new Date().toISOString() : null })}
        />
        {current.doneAt ? "Done" : "Mark done"}
        {d.overdue && <span className={styles.overdue}>Overdue</span>}
      </label>

      {conflict && <p className={styles.error}>This item was changed somewhere else. It has been reloaded; try again.</p>}
      {patch.error && !conflict && <p className={styles.error}>{patch.error.message}</p>}

      {current.parentId && (
        <button className={styles.parentLink} onClick={() => openItem(current.parentId!)}>
          ↑ Part of a larger item
        </button>
      )}

      <ItemForm key={`${current.id}:${formKey}`} value={toValues(current)} tags={tags} onChange={save} />

      <RepeatSection item={current} />

      {current.source.url && (
        <a className={styles.source} href={current.source.url} target="_blank" rel="noreferrer">
          Open source ({current.source.type})
        </a>
      )}

      <section className={styles.children}>
        <div className={styles.childrenHead}>
          <span className="label">Sub-items</span>
          {(d.timeSpentMinutes > 0 || d.timePlannedMinutes > 0) && (
            <span className={styles.time}>
              {formatDuration(d.timeSpentMinutes)} spent · {formatDuration(d.timePlannedMinutes)} planned
            </span>
          )}
        </div>
        {(descendants.data ?? []).map((child) => (
          <ItemRow key={child.id} item={child} compact />
        ))}
        <div className={styles.addChild}>
          <input
            className="input"
            placeholder="Add a sub-item"
            value={newChild}
            onChange={(e) => setNewChild(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addChild()}
          />
          <button className="btn" onClick={scheduleSession}>
            Schedule work
          </button>
        </div>
      </section>

      <div className={styles.actions}>
        <button
          className="btn btn-danger"
          onClick={async () => {
            if (current.series) {
              const scope = await askScope({ action: "delete", seriesWide: true });
              if (!scope) return;
              await remove.mutateAsync({ id, scope });
              setDeleted(scope === "this" ? "undoable" : "series");
            } else {
              await remove.mutateAsync({ id });
              setDeleted("undoable");
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/** How the item repeats, with a way to start or change it. Only events (no deadline, not a sub-item) repeat. */
function RepeatSection({ item }: { item: Item }) {
  const series = useSeries(item.series?.id ?? null);
  const { repeat } = useItemMutations();
  const changeRepeat = useChangeRepeat();
  const [draft, setDraft] = useState<RepeatRule | null>(null);
  const [editing, setEditing] = useState(false);

  const start = item.series ? series.data?.startDate : atDate(item.at);
  if (!start || (!item.series && (item.by || item.parentId))) return null;

  const current = series.data?.repeat ?? null;
  const save = async () => {
    if (!draft) return;
    if (item.series) await changeRepeat.mutateAsync({ id: item.series.id, rule: draft });
    else await repeat.mutateAsync({ id: item.id, rule: draft });
    setEditing(false);
  };
  const error = repeat.error ?? changeRepeat.error;

  return (
    <section className={styles.repeat}>
      <span className="label">Repeat</span>
      {!editing ? (
        <div className={styles.repeatSummary}>
          <span>{current ? `↻ ${describeRepeat(current, start)}` : "Doesn't repeat"}</span>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setDraft(current ?? { freq: "weekly", interval: 1, weekdays: [], until: null, count: null });
              setEditing(true);
            }}
          >
            {current ? "Change" : "Repeat…"}
          </button>
        </div>
      ) : (
        <>
          <RepeatEditor value={draft} startDate={start} onChange={setDraft} />
          {item.series && <p className={styles.hint}>Applies to the whole series. Changed or done occurrences are kept.</p>}
          <div className={styles.actions}>
            <button className="btn btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={!draft || repeat.isPending || changeRepeat.isPending} onClick={save}>
              {item.series ? "Save repeat" : "Start repeating"}
            </button>
          </div>
        </>
      )}
      {error && <p className={styles.error}>{error.message}</p>}
    </section>
  );
}
