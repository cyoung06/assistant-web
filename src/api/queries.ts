import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, unwrap, type AgendaEntry, type CreateEvent, type CreateTask, type Task, type TaskPatch } from "./client";

/**
 * Calendars or categories whose items stay out of the task views (Coming up, week strip, boards,
 * Tasks): things that just happen at a time, like classes and holidays. They still show in Today.
 */
export const TASK_VIEW_HIDDEN = ["class", "holiday"];

/** Everything here reads from CalDAV, so any change can affect every view. */
function invalidateAll(qc: QueryClient) {
  return Promise.all(["tasks", "task", "agenda", "calendars"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
}

// ---- calendars ------------------------------------------------------------------

export function useCalendars() {
  return useQuery({
    queryKey: ["calendars"],
    queryFn: async () => unwrap(await api.GET("/api/v1/calendars")),
    staleTime: 60_000,
  });
}

export function useCalendarMutations() {
  const qc = useQueryClient();
  const done = () => invalidateAll(qc);
  return {
    update: useMutation({
      mutationFn: async ({ id, ...body }: { id: string; name?: string; color?: string }) =>
        unwrap(await api.PATCH("/api/v1/calendars/{id}", { params: { path: { id } }, body })),
      onSuccess: done,
    }),
  };
}

// ---- tasks ----------------------------------------------------------------------

export interface TaskFilter {
  status?: "open" | "done" | "all";
  calendarId?: string;
  category?: string;
  /** Leave out tasks whose calendar or a category has one of these names. */
  hide?: string[];
  parentId?: string;
  q?: string;
}

export function useTasks(filter: TaskFilter) {
  return useQuery({
    queryKey: ["tasks", filter],
    queryFn: async () => unwrap(await api.GET("/api/v1/tasks", { params: { query: filter } })),
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: ["task", id ?? ""],
    queryFn: async () => unwrap(await api.GET("/api/v1/tasks/{id}", { params: { path: { id: id! } } })),
    enabled: id !== null,
  });
}

export function useTaskMutations() {
  const qc = useQueryClient();
  const done = () => invalidateAll(qc);
  return {
    create: useMutation({
      mutationFn: async (body: CreateTask) => unwrap(await api.POST("/api/v1/tasks", { body })),
      onSuccess: done,
    }),
    // Patches and deletes show right away; the refetch after the server answers settles the
    // details (overdue, order, filters), and a failure puts the previous data back.
    patch: useMutation({
      mutationFn: async ({ id, patch }: { id: string; patch: TaskPatch }) =>
        unwrap(await api.PATCH("/api/v1/tasks/{id}", { params: { path: { id } }, body: patch as never })),
      onMutate: ({ id, patch }) => applyLocally(qc, id, (t) => patchTask(t, patch), (e) => patchEntry(e, patch)),
      // A conflict means another app changed it; the refetch shows the latest.
      onError: (_e, _v, previous) => previous?.(),
      onSettled: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/tasks/{id}", { params: { path: { id } } })),
      onMutate: (id) => applyLocally(qc, id, () => null, () => null),
      onError: (_e, _v, previous) => previous?.(),
      onSettled: done,
    }),
  };
}

/**
 * Applies a change to task [id] in every cached task list, the task itself and the agenda
 * (null removes it). Returns a function that restores what was cached before.
 */
async function applyLocally(
  qc: QueryClient,
  id: string,
  task: (t: Task) => Task | null,
  entry: (e: AgendaEntry) => AgendaEntry | null,
) {
  const keys = [["tasks"], ["task"], ["agenda"]];
  await Promise.all(keys.map((queryKey) => qc.cancelQueries({ queryKey })));
  const previous = keys.flatMap((queryKey) => qc.getQueriesData({ queryKey }));
  // Lists the change doesn't touch keep their identity, so views like the calendar don't redraw.
  const inList = <T extends { id: string }>(list: T[] | undefined, matches: (x: T) => boolean, change: (x: T) => T | null) => {
    if (!list) return list;
    let changed = false;
    const next = list.flatMap((x) => {
      if (!matches(x)) return [x];
      const y = change(x);
      if (y !== x) changed = true;
      return y ? [y] : [];
    });
    return changed ? next : list;
  };
  qc.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (list) => inList(list, (t) => t.id === id, task));
  qc.setQueryData<Task>(["task", id], (t) => (t ? (task(t) ?? undefined) : t));
  qc.setQueriesData<AgendaEntry[]>({ queryKey: ["agenda"] }, (list) => inList(list, (e) => e.id === id && isDeadline(e), entry));
  return () => previous.forEach(([key, data]) => qc.setQueryData(key, data));
}

const isDeadline = (e: AgendaEntry) => e.kind === "deadline" || e.kind === "allDayDeadline";

function patchTask(t: Task, p: TaskPatch): Task {
  return {
    ...t,
    ...(p.title !== undefined && { title: p.title }),
    ...(p.notes !== undefined && { notes: p.notes }),
    ...(p.categories !== undefined && { categories: p.categories }),
    ...(p.due !== undefined && { due: p.due }),
    ...(p.done !== undefined && { done: p.done, overdue: p.done ? false : t.overdue }),
  };
}

// The deadline's place on the grid is left to the refetch (a drag already shows it there).
function patchEntry(e: AgendaEntry, p: TaskPatch): AgendaEntry {
  if (p.done === undefined && p.title === undefined) return e;
  return {
    ...e,
    ...(p.title !== undefined && { title: p.title }),
    ...(p.done !== undefined && { done: p.done, overdue: p.done ? false : e.overdue }),
  };
}

// ---- events and agenda ------------------------------------------------------------

export function useAgenda(from: string, to: string, hide: string[] = []) {
  return useQuery({
    queryKey: ["agenda", from, to, hide],
    queryFn: async () =>
      unwrap(await api.GET("/api/v1/agenda", { params: { query: { from, to, hide: hide.length ? hide : undefined } } })),
    placeholderData: (previous) => previous,
  });
}

export function useEventMutations() {
  const qc = useQueryClient();
  const done = () => invalidateAll(qc);
  return {
    create: useMutation({
      mutationFn: async (body: CreateEvent) => unwrap(await api.POST("/api/v1/events", { body })),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/events/{id}", { params: { path: { id } } })),
      onSuccess: done,
    }),
  };
}

// ---- sources ----------------------------------------------------------------------

export function useSources() {
  return useQuery({
    queryKey: ["sources"],
    queryFn: async () => unwrap(await api.GET("/api/v1/sources")),
    refetchInterval: 15_000,
  });
}

export function useSyncSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (type: string) => unwrap(await api.POST("/api/v1/sources/{type}/sync", { params: { path: { type } } })),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["sources"] }), invalidateAll(qc)]),
  });
}

// ---- calendar feed (iCal export) -----------------------------------------------------

export function useFeed() {
  return useQuery({ queryKey: ["feed"], queryFn: async () => unwrap(await api.GET("/api/v1/ical/feed")) });
}

export function useRotateFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await api.POST("/api/v1/ical/feed/rotate")),
    onSuccess: (feed) => qc.setQueryData(["feed"], feed),
  });
}

// ---- quick add ----------------------------------------------------------------------

export function useQuickAddParse() {
  return useMutation({
    mutationFn: async (text: string) => unwrap(await api.POST("/api/v1/quick-add/parse", { body: { text } })),
  });
}
