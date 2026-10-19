import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, type CreateEvent, type EventPatch } from "../api/client";

export function useCalendars() {
  return useQuery({ queryKey: ["calendars"], queryFn: async () => unwrap(await api.GET("/api/v1/calendars")), staleTime: 60_000 });
}

/** Occurrences for days from..to, inclusive. */
export function useEvents(from: string, to: string) {
  return useQuery({
    queryKey: ["events", from, to],
    queryFn: async () => unwrap(await api.GET("/api/v1/events", { params: { query: { from, to } } })),
    enabled: !!from,
    placeholderData: (previous) => previous,
  });
}

export function useEvent(id: string | null) {
  return useQuery({
    queryKey: ["event", id],
    queryFn: async () => unwrap(await api.GET("/api/v1/events/{id}", { params: { path: { id: id! } } })),
    enabled: !!id,
  });
}

/** A project's calendar: its repeating events summed up, every one-off event to come, and the next four weeks' skipped dates. */
export function useProjectSchedule(projectId: string) {
  return useQuery({
    queryKey: ["schedule", projectId],
    queryFn: async () => unwrap(await api.GET("/api/v1/projects/{id}/schedule", { params: { path: { id: projectId }, query: { days: 28 } } })),
  });
}

export function useEventMutations() {
  const qc = useQueryClient();
  const done = () =>
    Promise.all([qc.invalidateQueries({ queryKey: ["events"] }), qc.invalidateQueries({ queryKey: ["event"] }), qc.invalidateQueries({ queryKey: ["schedule"] })]);
  return {
    create: useMutation({
      mutationFn: async (body: CreateEvent) => unwrap(await api.POST("/api/v1/events", { body })),
      onSettled: done,
    }),
    patch: useMutation({
      mutationFn: async ({ id, patch }: { id: string; patch: EventPatch }) =>
        unwrap(await api.PATCH("/api/v1/events/{id}", { params: { path: { id } }, body: patch as never })),
      onSettled: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/events/{id}", { params: { path: { id } } })),
      onSettled: done,
    }),
  };
}
