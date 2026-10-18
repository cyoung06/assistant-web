import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, unwrap, type CreateEvent, type CreateTask, type TaskPatch } from "./client";

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
    create: useMutation({
      mutationFn: async (body: { name: string; color: string }) => unwrap(await api.POST("/api/v1/calendars", { body })),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: { id: string; name?: string; color?: string }) =>
        unwrap(await api.PATCH("/api/v1/calendars/{id}", { params: { path: { id } }, body })),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/calendars/{id}", { params: { path: { id } } })),
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
    patch: useMutation({
      mutationFn: async ({ id, patch }: { id: string; patch: TaskPatch }) =>
        unwrap(await api.PATCH("/api/v1/tasks/{id}", { params: { path: { id } }, body: patch as never })),
      onSuccess: done,
      // A conflict means another app changed it; refetch so the latest shows.
      onError: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/tasks/{id}", { params: { path: { id } } })),
      onSuccess: done,
    }),
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
