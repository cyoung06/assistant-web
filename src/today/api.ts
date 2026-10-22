import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../api/client";
import type { components } from "../api/schema";

export type Today = components["schemas"]["Today"];

/** The day at a glance; kept fresh while it's open (the next class moves on, tasks get done). */
export function useToday() {
  return useQuery({ queryKey: ["today"], queryFn: async () => unwrap(await api.GET("/api/v1/today")), refetchInterval: 60_000 });
}
