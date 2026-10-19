import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../api/client";
import type { components } from "../api/schema";

export type TriageInput = components["schemas"]["TriageInputResponse"];
export type TriageItem = components["schemas"]["TriageItemResponse"];
export type Proposal = components["schemas"]["Proposal"];

const TRIAGE = ["triage"];

/** Inputs of the last two weeks with their suggestions; polled while the model is still reading some. */
export function useTriage() {
  return useQuery({
    queryKey: TRIAGE,
    queryFn: async () => unwrap(await api.GET("/api/v1/triage")),
    refetchInterval: (q) => (q.state.data?.some((i) => i.status === "pending") ? 5_000 : 60_000),
  });
}

/** Suggestions waiting for a decision, plus inputs the model hasn't read yet: the sidebar's count. */
export const waitingCount = (inputs: TriageInput[] | undefined) =>
  (inputs ?? []).reduce((n, i) => n + (i.status === "pending" ? 1 : i.items.filter((x) => x.status === "pending").length), 0);

/** Uploads a file (a screenshot) to keep with what's sent; returns its id. */
export async function upload(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file, file.name || "screenshot.png");
  const res = await fetch("/api/v1/attachments", { method: "POST", body });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return ((await res.json()) as { id: string }).id;
}

export function useTriageMutations() {
  const qc = useQueryClient();
  const done = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: TRIAGE }),
      qc.invalidateQueries({ queryKey: ["tasks"] }),
      qc.invalidateQueries({ queryKey: ["events"] }),
      qc.invalidateQueries({ queryKey: ["projects"] }),
    ]);
  return {
    submit: useMutation({
      mutationFn: async (body: { text: string; attachmentIds: string[] }) =>
        unwrap(await api.POST("/api/v1/triage/inputs", { body: { source: "capture", text: body.text, attachmentIds: body.attachmentIds } })),
      onSettled: done,
    }),
    accept: useMutation({
      mutationFn: async ({ id, proposal }: { id: string; proposal?: Proposal }) =>
        unwrap(await api.POST("/api/v1/triage/items/{id}/accept", { params: { path: { id } }, body: proposal })),
      onSettled: done,
    }),
    decline: useMutation({
      mutationFn: async (id: string) => unwrap(await api.POST("/api/v1/triage/items/{id}/decline", { params: { path: { id } } })),
      onSettled: done,
    }),
    retry: useMutation({
      mutationFn: async (id: string) => unwrap(await api.POST("/api/v1/triage/inputs/{id}/retry", { params: { path: { id } } })),
      onSettled: done,
    }),
    dismiss: useMutation({
      mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/triage/inputs/{id}", { params: { path: { id } } })),
      onSettled: done,
    }),
  };
}
