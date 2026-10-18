import { useState } from "react";
import type { Item, Tag } from "../api/client";
import { useItemMutations, useItems, useTags, type ItemFilter } from "../api/queries";
import { usePanel } from "../components/panel";
import { TagDot } from "../components/TagPicker";
import { formatDay, formatDuration, formatTime, shortTime } from "../lib/dates";
import { sortItems, type SortField } from "../lib/items";
import styles from "./ItemsPage.module.css";

type Status = "open" | "done" | "all";

const COLUMNS: { field: SortField | null; label: string; className?: string }[] = [
  { field: null, label: "" },
  { field: "title", label: "Title" },
  { field: "due", label: "Due" },
  { field: "at", label: "Scheduled" },
  { field: null, label: "Tags", className: "tags" },
  { field: "sub", label: "Sub-items", className: "num" },
  { field: "time", label: "Time", className: "num" },
];

/** Every item in one dense, sortable table. */
export function ItemsPage() {
  const [status, setStatus] = useState<Status>("open");
  const [topLevel, setTopLevel] = useState(true);
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ field: SortField; asc: boolean }>({ field: "next", asc: true });
  const tags = useTags().data ?? [];
  const { openDraft } = usePanel();

  const filter: ItemFilter = {
    done: status === "all" ? undefined : status === "done",
    topLevel: topLevel || undefined,
    tag: tag || undefined,
    q: query.trim() || undefined,
  };
  const items = useItems(filter);
  const rows = sortItems(items.data?.items ?? [], sort.field, sort.asc);
  const tagById = new Map(tags.map((t) => [t.id, t]));

  const toggleSort = (field: SortField) =>
    setSort((s) => (s.field === field ? { field, asc: !s.asc } : { field, asc: true }));

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.segment} role="radiogroup" aria-label="Status">
          {(["open", "done", "all"] as Status[]).map((s) => (
            <button key={s} role="radio" aria-checked={status === s} className={status === s ? styles.on : ""} onClick={() => setStatus(s)}>
              {s === "open" ? "Open" : s === "done" ? "Done" : "All"}
            </button>
          ))}
        </div>
        <label className={styles.check}>
          <input id="items-top-level" className="checkbox" type="checkbox" checked={topLevel} onChange={(e) => setTopLevel(e.target.checked)} />
          Top level only
        </label>
        <select id="items-tag" className="input" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag">
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input id="items-search" className="input" type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className={styles.total}>{rows.length} items</span>
        <button className="btn btn-primary" onClick={() => openDraft({ title: "" })}>
          New item
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {COLUMNS.map((c, i) => (
                <th key={i} className={c.className ? styles[c.className] : undefined} aria-sort={c.field && sort.field === c.field ? (sort.asc ? "ascending" : "descending") : undefined}>
                  {c.field ? (
                    <button onClick={() => toggleSort(c.field!)}>
                      {c.label}
                      {sort.field === c.field && <span aria-hidden> {sort.asc ? "↑" : "↓"}</span>}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <Row key={item.id} item={item} tagById={tagById} />
            ))}
          </tbody>
        </table>
        {items.isPending && <p className={styles.empty}>Loading…</p>}
        {items.error && <p className={styles.empty}>{items.error.message}</p>}
        {items.isSuccess && rows.length === 0 && <p className={styles.empty}>No items match. Add one with the bar above (⌘K).</p>}
        {items.data?.nextCursor && <p className={styles.empty}>Showing the newest 200. Narrow it down with a tag or search.</p>}
      </div>
    </div>
  );
}

function Row({ item, tagById }: { item: Item; tagById: Map<string, Tag> }) {
  const { openItem } = usePanel();
  const { patch } = useItemMutations();
  const done = item.doneAt != null;
  const d = item.derived;

  return (
    <tr className={`${done ? styles.done : ""}`} onClick={() => openItem(item.id)}>
      <td onClick={(e) => e.stopPropagation()}>
        <input
          className="checkbox"
          type="checkbox"
          checked={done}
          aria-label={done ? "Mark not done" : "Mark done"}
          onChange={(e) => patch.mutate({ id: item.id, patch: { doneAt: e.target.checked ? new Date().toISOString() : null }, version: item.version })}
        />
      </td>
      <td className={styles.title}>
        <TagDot color={d.color} />
        <span>{d.displayTitle || "Untitled"}</span>
        {item.parentId && <span className={styles.subMark} title="Sub-item">↳</span>}
      </td>
      <td className={d.overdue ? styles.late : undefined}>
        {item.by ? `${formatDay(item.by.date)}${item.by.time ? ` ${shortTime(item.by.time)}` : ""}` : ""}
      </td>
      <td>
        {item.at
          ? item.at.allDay
            ? item.at.startDate === item.at.endDate
              ? formatDay(item.at.startDate!)
              : `${formatDay(item.at.startDate!)} – ${formatDay(item.at.endDate!)}`
            : `${formatDay(new Date(item.at.start!))} ${formatTime(item.at.start!)}`
          : ""}
      </td>
      <td className={styles.tags}>
        {item.tagIds.map((id) => {
          const t = tagById.get(id);
          return t ? (
            <span key={id} className={styles.chip} style={{ "--tag": t.color } as React.CSSProperties}>
              {t.name}
            </span>
          ) : null;
        })}
      </td>
      <td className={styles.num}>{d.subItems ? `${d.subItemsDone}/${d.subItems}` : ""}</td>
      <td className={styles.num}>
        {d.timeSpentMinutes || d.timePlannedMinutes
          ? `${formatDuration(d.timeSpentMinutes)} / ${formatDuration(d.timeSpentMinutes + d.timePlannedMinutes)}`
          : ""}
      </td>
    </tr>
  );
}
