import { useEffect, useState } from "react";
import { ApiError, type CreateItem, type Item, type ItemPatch } from "../api/client";
import { useDescendants, useItem, useItemMutations, useTags } from "../api/queries";
import { formatDuration } from "../lib/dates";
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
  const [deleted, setDeleted] = useState(false);
  const [newChild, setNewChild] = useState("");

  if (deleted) {
    return (
      <div className={styles.body}>
        <p>Item deleted, including its sub-items.</p>
        <div className={styles.actions}>
          <button
            className="btn"
            onClick={async () => {
              await restore.mutateAsync(id);
              setDeleted(false);
            }}
          >
            Undo
          </button>
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

  const save = (change: ItemPatch) => patch.mutate({ id, patch: change, version: current.version });
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

      <ItemForm key={current.id} value={toValues(current)} tags={tags} onChange={save} />

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
            await remove.mutateAsync(id);
            setDeleted(true);
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
