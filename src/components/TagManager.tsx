import { useState } from "react";
import type { Tag } from "../api/client";
import { useTagMutations, useTags } from "../api/queries";
import styles from "./TagManager.module.css";

export function TagManager({ onClose }: { onClose: () => void }) {
  const tags = useTags().data ?? [];
  const { create } = useTagMutations();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2F5BE0");

  const add = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim(), color });
    setName("");
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} role="dialog" aria-label="Tags" onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <h2>Tags</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <p className={styles.hint}>An item's main tag sets its color on the calendar.</p>

        <ul className={styles.list}>
          {tags.map((tag) => (
            <TagRow key={tag.id} tag={tag} />
          ))}
        </ul>

        <form
          className={styles.add}
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            id="new-tag-color"
            className={styles.color}
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Color"
          />
          <input
            id="new-tag-name"
            className="input"
            placeholder="New tag, e.g. CSED123"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn btn-primary" disabled={!name.trim() || create.isPending}>
            Add
          </button>
        </form>
        {create.error && <p className={styles.error}>{create.error.message}</p>}
      </div>
    </div>
  );
}

function TagRow({ tag }: { tag: Tag }) {
  const { update, remove } = useTagMutations();
  const [name, setName] = useState(tag.name);
  const [confirming, setConfirming] = useState(false);

  return (
    <li className={styles.row}>
      <input
        className={styles.color}
        type="color"
        value={tag.color}
        aria-label={`Color of ${tag.name}`}
        onChange={(e) => update.mutate({ id: tag.id, color: e.target.value })}
      />
      <input
        className="input"
        value={name}
        aria-label="Tag name"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== tag.name && update.mutate({ id: tag.id, name: name.trim() })}
      />
      {confirming ? (
        <>
          <button className="btn btn-danger" onClick={() => remove.mutate(tag.id)}>
            Delete
          </button>
          <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
            Keep
          </button>
        </>
      ) : (
        <button className="btn btn-ghost" onClick={() => setConfirming(true)} aria-label={`Delete ${tag.name}`}>
          Delete
        </button>
      )}
      {update.error && <span className={styles.error}>{update.error.message}</span>}
    </li>
  );
}
