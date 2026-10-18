import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../api/client";

/** Things to reference matching [q]; null while no @ is being typed. */
export function useRefSearch(q: string | null) {
  return useQuery({
    queryKey: ["refs", q],
    queryFn: async ({ signal }) => unwrap(await api.GET("/api/v1/refs", { params: { query: { q: q ?? "", limit: 12 } }, signal })),
    enabled: q !== null,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export async function resolveRef(url: string) {
  return unwrap(await api.GET("/api/v1/refs/resolve", { params: { query: { url } } }));
}

export function useBacklinks(url: string | null) {
  return useQuery({
    queryKey: ["backlinks", url],
    queryFn: async () => unwrap(await api.GET("/api/v1/refs/backlinks", { params: { query: { url: url! } } })),
    enabled: !!url,
  });
}
