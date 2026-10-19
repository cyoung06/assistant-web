import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../api/client";
import type { components } from "../api/schema";

export type DriveEntry = components["schemas"]["DriveEntry"];
export type DriveFolder = components["schemas"]["DriveFolder"];

/** Where devices connect to the drive (Finder's Connect to Server). */
export function useDriveInfo() {
  return useQuery({ queryKey: ["drive"], queryFn: async () => unwrap(await api.GET("/api/v1/drive")), staleTime: Infinity });
}

/** A folder of the drive ("" for its top), folders first. */
export function useFolder(path: string, enabled = true) {
  return useQuery({ queryKey: ["drive", "folder", path], enabled, queryFn: async () => unwrap(await api.GET("/api/v1/drive/folder", { params: { query: { path } } })) });
}

/** A project's folder (made if needed): its path, and what's in it. */
export function useProjectFolder(projectId: string) {
  return useQuery({ queryKey: ["drive", "project", projectId], queryFn: async () => unwrap(await api.GET("/api/v1/drive/projects/{id}", { params: { path: { id: projectId } } })) });
}

/** Where a file can be opened (the browser shows PDFs and images, downloads the rest). */
export const fileUrl = (path: string) => `/api/v1/drive/file?path=${encodeURIComponent(path)}`;

export function useDriveMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["drive"] });
  const check = async (res: Response) => {
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `Failed (${res.status})`);
  };
  return {
    upload: useMutation({
      mutationFn: async ({ folder, files }: { folder: string; files: File[] }) => {
        for (const f of files) await check(await fetch(fileUrl(folder + f.name), { method: "PUT", body: f, headers: { "Content-Type": f.type || "application/octet-stream" } }));
      },
      onSettled: refresh,
    }),
    makeFolder: useMutation({
      mutationFn: async (path: string) => check(await fetch(`/api/v1/drive/folder?path=${encodeURIComponent(path)}`, { method: "POST" })),
      onSettled: refresh,
    }),
    move: useMutation({
      mutationFn: async ({ from, to }: { from: string; to: string }) =>
        check(await fetch(`/api/v1/drive/move?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { method: "POST" })),
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: async (path: string) => check(await fetch(fileUrl(path), { method: "DELETE" })),
      onSettled: refresh,
    }),
  };
}

/** Sizes as people read them. */
export function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) (n /= 1024), i++;
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

/** The app address of a drive folder: files/<segments, each encoded>. */
export const filesRoute = (path: string) => "files/" + path.split("/").filter(Boolean).map(encodeURIComponent).join("/") + (path ? "/" : "");

/** The drive folder an app address (after "files/") stands for. */
export const folderOfRoute = (rest: string) => {
  const parts = rest.split("/").filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  return parts.length ? parts.join("/") + "/" : "";
};
