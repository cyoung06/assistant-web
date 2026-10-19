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

// ---- mail account (Microsoft sign-in) ------------------------------------------------

/** Polls while a sign-in is waiting for the user. */
export function useMailAccount() {
  return useQuery({
    queryKey: ["mail-account"],
    queryFn: async () => unwrap(await api.GET("/api/v1/mail/account")),
    refetchInterval: (q) => (q.state.data?.state === "pending" ? 3000 : false),
  });
}

export function useMailMutations() {
  const qc = useQueryClient();
  const done = () => Promise.all([qc.invalidateQueries({ queryKey: ["mail-account"] }), qc.invalidateQueries({ queryKey: ["sources"] })]);
  return {
    connect: useMutation({
      mutationFn: async () => unwrap(await api.POST("/api/v1/mail/connect")),
      onSuccess: (status) => qc.setQueryData(["mail-account"], status),
    }),
    disconnect: useMutation({
      mutationFn: async () => unwrap(await api.DELETE("/api/v1/mail/account")),
      onSettled: done,
    }),
  };
}

// ---- ChatGPT account (the model behind Analyze, on the Codex quota) -------------------

export function useChatGptAccount() {
  return useQuery({ queryKey: ["chatgpt-account"], queryFn: async () => unwrap(await api.GET("/api/v1/chatgpt/account")) });
}

export function useChatGptMutations() {
  const qc = useQueryClient();
  return {
    connect: useMutation({
      mutationFn: async () => unwrap(await api.POST("/api/v1/chatgpt/connect")),
      onSettled: () => qc.invalidateQueries({ queryKey: ["chatgpt-account"] }),
    }),
    complete: useMutation({
      mutationFn: async (redirectUrl: string) => unwrap(await api.POST("/api/v1/chatgpt/complete", { body: { redirectUrl } })),
      onSuccess: (status) => qc.setQueryData(["chatgpt-account"], status),
    }),
    disconnect: useMutation({
      mutationFn: async () => unwrap(await api.DELETE("/api/v1/chatgpt/account")),
      onSettled: () => qc.invalidateQueries({ queryKey: ["chatgpt-account"] }),
    }),
  };
}

// ---- tokens for the Outlook add-in (the public endpoints) ----------------------------

export function usePublicTokens() {
  return useQuery({ queryKey: ["public-tokens"], queryFn: async () => unwrap(await api.GET("/api/v1/public-tokens")) });
}

export function usePublicTokenMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["public-tokens"] });
  return {
    create: useMutation({ mutationFn: async (name: string) => unwrap(await api.POST("/api/v1/public-tokens", { body: { name } })), onSettled: done }),
    revoke: useMutation({
      mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/public-tokens/{id}", { params: { path: { id } } })),
      onSettled: done,
    }),
  };
}
