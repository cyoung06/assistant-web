import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, unwrap, type CreateItem, type Item, type ItemPatch } from "./client";

export const keys = {
  tags: ["tags"] as const,
  items: (filter: ItemFilter) => ["items", filter] as const,
  item: (id: string) => ["item", id] as const,
  descendants: (id: string) => ["item", id, "descendants"] as const,
  calendar: (from: string, to: string, hideTags: string[], sessions: boolean) =>
    ["calendar", from, to, hideTags, sessions] as const,
};

/** Anything that changes items can change lists, the calendar and other items' derived fields. */
function invalidateItems(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["items"] }),
    qc.invalidateQueries({ queryKey: ["item"] }),
    qc.invalidateQueries({ queryKey: ["calendar"] }),
  ]);
}

// ---- tags --------------------------------------------------------------------

export function useTags() {
  return useQuery({
    queryKey: keys.tags,
    queryFn: async () => unwrap(await api.GET("/api/v1/tags")),
    staleTime: 60_000,
  });
}

export function useTagMutations() {
  const qc = useQueryClient();
  const done = () => Promise.all([qc.invalidateQueries({ queryKey: keys.tags }), invalidateItems(qc)]);
  return {
    create: useMutation({
      mutationFn: async (body: { name: string; color: string }) => unwrap(await api.POST("/api/v1/tags", { body })),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: { id: string; name?: string; color?: string }) =>
        unwrap(await api.PATCH("/api/v1/tags/{id}", { params: { path: { id } }, body })),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/tags/{id}", { params: { path: { id } } })),
      onSuccess: done,
    }),
  };
}

// ---- items -------------------------------------------------------------------

export interface ItemFilter {
  tag?: string;
  done?: boolean;
  scheduled?: boolean;
  overdue?: boolean;
  topLevel?: boolean;
  q?: string;
}

export function useItems(filter: ItemFilter) {
  return useQuery({
    queryKey: keys.items(filter),
    queryFn: async () => unwrap(await api.GET("/api/v1/items", { params: { query: { ...filter, limit: 200 } } })),
  });
}

export function useItem(id: string | null) {
  return useQuery({
    queryKey: keys.item(id ?? ""),
    queryFn: async () => unwrap(await api.GET("/api/v1/items/{id}", { params: { path: { id: id! } } })),
    enabled: id !== null,
  });
}

export function useDescendants(id: string | null) {
  return useQuery({
    queryKey: keys.descendants(id ?? ""),
    queryFn: async () => unwrap(await api.GET("/api/v1/items/{id}/descendants", { params: { path: { id: id! } } })),
    enabled: id !== null,
  });
}

export function useCalendar(from: string, to: string, hideTags: string[], sessions: boolean) {
  return useQuery({
    queryKey: keys.calendar(from, to, hideTags, sessions),
    queryFn: async () =>
      unwrap(
        await api.GET("/api/v1/calendar", {
          params: { query: { from, to, hideTags: hideTags.length ? hideTags : undefined, sessions } },
        }),
      ),
    enabled: from !== "" && to !== "",
    placeholderData: (previous) => previous,
  });
}

export function useItemMutations() {
  const qc = useQueryClient();
  const done = () => invalidateItems(qc);
  return {
    create: useMutation({
      mutationFn: async (body: CreateItem) => unwrap(await api.POST("/api/v1/items", { body })),
      onSuccess: done,
    }),
    patch: useMutation({
      mutationFn: async ({ id, patch, version }: { id: string; patch: ItemPatch; version?: number }) =>
        unwrap(
          await api.PATCH("/api/v1/items/{id}", {
            params: { path: { id }, header: version === undefined ? undefined : { "If-Match": `"${version}"` } },
            body: patch as never,
          }),
        ),
      onSuccess: (item: Item) => {
        qc.setQueryData(keys.item(item.id), item);
        return done();
      },
      // A version conflict means the cached copy is stale; refetch it.
      onError: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/items/{id}", { params: { path: { id } } })),
      onSuccess: done,
    }),
    restore: useMutation({
      mutationFn: async (id: string) =>
        unwrap(await api.POST("/api/v1/items/{id}/restore", { params: { path: { id } } })),
      onSuccess: done,
    }),
  };
}

// ---- sources -------------------------------------------------------------------

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
    mutationFn: async (type: string) =>
      unwrap(await api.POST("/api/v1/sources/{type}/sync", { params: { path: { type } } })),
    onSuccess: () =>
      Promise.all([qc.invalidateQueries({ queryKey: ["sources"] }), qc.invalidateQueries({ queryKey: ["tags"] }), invalidateItems(qc)]),
  });
}

export function useQuickAddParse() {
  return useMutation({
    mutationFn: async (text: string) => unwrap(await api.POST("/api/v1/quick-add/parse", { body: { text } })),
  });
}
