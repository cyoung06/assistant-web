import { useState } from "react";
import { useItems, useTags, type ItemFilter } from "../api/queries";
import { ItemRow } from "../components/ItemRow";
import { usePanel } from "../components/panel";
import styles from "./ItemsPage.module.css";

const VIEWS = {
  open: { label: "Open", filter: { done: false, topLevel: true } },
  unsorted: { label: "No date", filter: { done: false, scheduled: false, topLevel: true } },
  overdue: { label: "Overdue", filter: { overdue: true } },
  done: { label: "Done", filter: { done: true, topLevel: true } },
} satisfies Record<string, { label: string; filter: ItemFilter }>;

type View = keyof typeof VIEWS;

export function ItemsPage() {
  const [view, setView] = useState<View>("open");
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");
  const tags = useTags().data ?? [];
  const { openDraft } = usePanel();

  const filter: ItemFilter = { ...VIEWS[view].filter, tag: tag || undefined, q: query.trim() || undefined };
  const items = useItems(filter);
  const list = items.data?.items ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist">
          {(Object.keys(VIEWS) as View[]).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={view === key}
              className={`${styles.tab} ${view === key ? styles.active : ""}`}
              onClick={() => setView(key)}
            >
              {VIEWS[key].label}
            </button>
          ))}
        </div>
        <div className={styles.filters}>
          <select id="items-tag" className="input" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag">
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            id="items-search"
            className="input"
            type="search"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => openDraft({ title: "" })}>
            New item
          </button>
        </div>
      </div>

      <div className={styles.list}>
        {items.isPending && <p className={styles.empty}>Loading…</p>}
        {items.error && <p className={styles.empty}>{items.error.message}</p>}
        {items.isSuccess && list.length === 0 && <p className={styles.empty}>{emptyText(view)}</p>}
        {list.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
        {items.data?.nextCursor && <p className={styles.empty}>Showing the newest 200. Narrow it down with a tag or search.</p>}
      </div>
    </div>
  );
}

function emptyText(view: View): string {
  switch (view) {
    case "open":
      return "Nothing open. Add something with the bar above (⌘K).";
    case "unsorted":
      return "Everything has a date.";
    case "overdue":
      return "Nothing overdue.";
    case "done":
      return "Nothing completed yet.";
  }
}
