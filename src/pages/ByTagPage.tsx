import { useState } from "react";
import type { Item } from "../api/client";
import { useItems, useTags } from "../api/queries";
import { ItemRow } from "../components/ItemRow";
import { TagDot } from "../components/TagPicker";
import { sortItems } from "../lib/items";
import styles from "./ByTagPage.module.css";

/** A column per tag, plus one for untagged items. An item with several tags shows in each column. */
export function ByTagPage() {
  const [showDone, setShowDone] = useState(false);
  const tags = useTags().data ?? [];
  const items = useItems({ done: showDone ? undefined : false, topLevel: true, repeating: false });
  const all = sortItems(items.data?.items ?? [], "next", true);

  const columns = [
    ...tags.map((t) => ({ key: t.id, name: t.name, color: t.color as string | null, items: all.filter((i) => i.tagIds.includes(t.id)) })),
    { key: "none", name: "No tag", color: null, items: all.filter((i: Item) => i.tagIds.length === 0) },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <label className={styles.check}>
          <input id="by-tag-done" className="checkbox" type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Show done
        </label>
        {items.isPending && <span className={styles.note}>Loading…</span>}
        {items.error && <span className={styles.note}>{items.error.message}</span>}
      </div>
      <div className={styles.columns}>
        {columns.map((c) => (
          <section key={c.key} className={styles.column}>
            <h2>
              <TagDot color={c.color} />
              {c.name}
              <span className={styles.count}>{c.items.length}</span>
            </h2>
            <div className={styles.list}>
              {c.items.length === 0 && <p className={styles.note}>Nothing here.</p>}
              {c.items.map((item) => (
                <ItemRow key={item.id} item={item} compact />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
