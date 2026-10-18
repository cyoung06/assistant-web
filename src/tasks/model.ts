// What tasks mean on screen: status and priority names, due buckets, grouping and ordering.

import type { CreateTask, Due, Label, Priority, Project, Task, TaskStatus } from "../api/client";
import { addDays, formatDay, parseDate, shortTime } from "../lib/dates";

export const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "canceled", label: "Canceled" },
];

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "none", label: "No priority" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const statusLabel = (s: TaskStatus) => STATUSES.find((x) => x.value === s)!.label;
export const priorityLabel = (p: Priority) => PRIORITIES.find((x) => x.value === p)!.label;

export const isClosed = (s: TaskStatus) => s === "done" || s === "canceled";

/** Urgent first, no priority last. */
const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
/** Linear's order for status groups. */
const STATUS_RANK: Record<TaskStatus, number> = { in_progress: 0, todo: 1, backlog: 2, done: 3, canceled: 4 };

export type Grouping = "due" | "status" | "priority" | "project" | "label";
export type Ordering = "priority" | "due" | "created";

export const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: "due", label: "Due date" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "project", label: "Project" },
  { value: "label", label: "Label" },
];

export const ORDERINGS: { value: Ordering; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "due", label: "Due date" },
  { value: "created", label: "Newest" },
];

export interface Group {
  key: string;
  label: string;
  tasks: Task[];
  /** What a task created in this group starts with. */
  defaults: Partial<CreateTask>;
  color?: string;
  tone?: "danger";
}

// ---- due dates --------------------------------------------------------------------

/** The last day of the week (Saturday; weeks start on Sunday) containing [today]. */
export const weekEnd = (today: string) => addDays(today, 6 - parseDate(today).getDay());

export type DueBucket = "overdue" | "today" | "week" | "later" | "none";

export function dueBucket(t: Task, today: string): DueBucket {
  if (!t.due) return "none";
  if (t.overdue) return "overdue";
  if (t.due.date <= today) return "today";
  if (t.due.date <= weekEnd(today)) return "week";
  return "later";
}

/** "Today", "Tomorrow", "Fri", "Oct 30", with the time when there is one. */
export function dueText(due: Due, today: string): string {
  const day =
    due.date === today ? "Today"
    : due.date === addDays(today, 1) ? "Tomorrow"
    : due.date === addDays(today, -1) ? "Yesterday"
    : due.date > today && due.date <= addDays(today, 6) ? new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(parseDate(due.date))
    : formatDay(due.date).replace(/^\w+, /, "");
  return due.time ? `${day} ${shortTime(due.time)}` : day;
}

export function dueTone(t: Task, today: string): "overdue" | "soon" | undefined {
  if (!t.due || isClosed(t.status)) return undefined;
  if (t.overdue) return "overdue";
  if (t.due.date <= addDays(today, 1)) return "soon";
  return undefined;
}

/** The quick choices of the due menu; days that coincide keep the first name. */
export function dueChoices(today: string): { label: string; date: string }[] {
  const weekday = parseDate(today).getDay();
  const next = (day: number) => addDays(today, (day - weekday + 7) % 7 || 7);
  const all = [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: "End of week", date: next(5) },
    { label: "Next week", date: next(1) },
  ];
  return all.filter((c, i) => all.findIndex((x) => x.date === c.date) === i);
}

// ---- grouping and ordering ----------------------------------------------------------

function dueKey(t: Task): string {
  return t.due ? `${t.due.date}T${t.due.time ?? "24:00"}` : "~";
}

export function sortTasks(tasks: Task[], ordering: Ordering): Task[] {
  const byDue = (a: Task, b: Task) => (dueKey(a) < dueKey(b) ? -1 : dueKey(a) > dueKey(b) ? 1 : 0);
  const byPriority = (a: Task, b: Task) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  const newest = (a: Task, b: Task) => b.number - a.number;
  const order = ordering === "priority" ? [byPriority, byDue, newest] : ordering === "due" ? [byDue, byPriority, newest] : [newest];
  return [...tasks].sort((a, b) => {
    for (const f of order) {
      const c = f(a, b);
      if (c) return c;
    }
    return 0;
  });
}

interface Context {
  today: string;
  projects: Project[];
  labels: Label[];
}

/** Groups of open tasks, in display order; empty groups are left out. Closed tasks go in [closedGroup]. */
export function groupTasks(tasks: Task[], grouping: Grouping, ordering: Ordering, ctx: Context): Group[] {
  const open = tasks.filter((t) => !isClosed(t.status));
  const groups: Group[] = (() => {
    switch (grouping) {
      case "due": {
        const by = (b: DueBucket) => open.filter((t) => dueBucket(t, ctx.today) === b);
        return [
          { key: "overdue", label: "Overdue", tasks: by("overdue"), defaults: {}, tone: "danger" as const },
          { key: "today", label: "Today", tasks: by("today"), defaults: { due: { date: ctx.today } } },
          { key: "week", label: "This week", tasks: by("week"), defaults: { due: { date: weekEnd(ctx.today) } } },
          { key: "later", label: "Later", tasks: by("later"), defaults: {} },
          { key: "none", label: "No due date", tasks: by("none"), defaults: {} },
        ];
      }
      case "status":
        return STATUSES.filter((s) => !isClosed(s.value))
          .sort((a, b) => STATUS_RANK[a.value] - STATUS_RANK[b.value])
          .map((s) => ({ key: s.value, label: s.label, tasks: open.filter((t) => t.status === s.value), defaults: { status: s.value } }));
      case "priority":
        return [...PRIORITIES.slice(1), PRIORITIES[0]!].map((p) => ({
          key: p.value, label: p.label, tasks: open.filter((t) => t.priority === p.value), defaults: { priority: p.value },
        }));
      case "project":
        return [
          ...ctx.projects.map((p) => ({ key: p.id, label: p.name, color: p.color, tasks: open.filter((t) => t.projectId === p.id), defaults: { projectId: p.id } })),
          { key: "none", label: "No project", tasks: open.filter((t) => !t.projectId || !ctx.projects.some((p) => p.id === t.projectId)), defaults: {} },
        ];
      case "label":
        // A task with several labels shows in each of their groups.
        return [
          ...ctx.labels.map((l) => ({ key: l.id, label: l.name, color: l.color, tasks: open.filter((t) => t.labelIds.includes(l.id)), defaults: { labelIds: [l.id] } })),
          { key: "none", label: "No label", tasks: open.filter((t) => t.labelIds.length === 0), defaults: {} },
        ];
    }
  })();
  return groups.filter((g) => g.tasks.length > 0).map((g) => ({ ...g, tasks: sortTasks(g.tasks, ordering) }));
}

/** Done and canceled tasks, most recently closed first. */
export function closedGroup(tasks: Task[]): Group {
  const closed = tasks.filter((t) => isClosed(t.status)).sort((a, b) => ((b.closedAt ?? "") > (a.closedAt ?? "") ? 1 : -1));
  return { key: "closed", label: "Closed", tasks: closed, defaults: { status: "done" } };
}
