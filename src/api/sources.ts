import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client";

// ---- sources ----------------------------------------------------------------------

export function useSources() {
  return useQuery({
    queryKey: ["sources"],
    queryFn: async () => unwrap(await api.GET("/api/v1/sources")),
    refetchInterval: 15_000,
  });
}

/** A sync can change tasks and events, so everything is refetched after it. */
export function useSyncSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (type: string) => unwrap(await api.POST("/api/v1/sources/{type}/sync", { params: { path: { type } } })),
    onSuccess: () => qc.invalidateQueries(),
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
