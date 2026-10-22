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

/** A preview of a PDF's first page ([modified] keeps it fresh when the file changes). */
export const thumbUrl = (path: string, modified?: string | null, width = 240) =>
  `/api/v1/drive/thumb?path=${encodeURIComponent(path)}&version=${encodeURIComponent(modified ?? "")}&width=${width}`;

export function useDriveMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["drive"] });
  const check = async (res: Response) => {
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `Failed (${res.status})`);
  };
  return {
    /** Files into [folder], each numbered if its name is taken (never replacing what's there); their names. */
    upload: useMutation({
      mutationFn: async ({ folder, files }: { folder: string; files: File[] }) => {
        const names: string[] = [];
        for (const f of files) names.push(await createFile(folder, f.name, () => f, f.type || "application/octet-stream"));
        return names;
      },
      onSettled: refresh,
    }),
    /** A new file (numbered if its name is taken); its name. */
    create: useMutation({
      mutationFn: ({ folder, name, body, type }: { folder: string; name: string; body: (name: string) => BodyInit; type: string }) => createFile(folder, name, body, type),
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
    copy: useMutation({
      mutationFn: async ({ from, to }: { from: string; to: string }) => {
        const res = await fetch(`/api/v1/drive/copy?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { method: "POST" });
        await check(res);
        return (await res.json()) as { path: string };
      },
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

/** The app address of a drive folder or file: files/<segments, each encoded> (folders end with "/"). */
export const filesRoute = (path: string) =>
  "files/" + path.split("/").filter(Boolean).map(encodeURIComponent).join("/") + (path.endsWith("/") ? "/" : "");

/** The drive path an app address (after "files/") stands for: a folder (ending with "/"), or a file to show. */
export const pathOfRoute = (rest: string) => {
  const parts = rest.split("/").filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  return parts.length === 0 ? "" : parts.join("/") + (rest.endsWith("/") ? "/" : "");
};

/** The folder a drive path is in (a folder's own parent). */
export const parentOf = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  return parts.length <= 1 ? "" : parts.slice(0, -1).join("/") + "/";
};

/** The kind of file, for its icon and how it's shown. */
export function kind(e: { name: string; folder?: boolean }): "folder" | "pdf" | "image" | "video" | "audio" | "text" | "file" {
  if (e.folder) return "folder";
  const n = e.name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(n)) return "image";
  if (/\.(mp4|mov|webm|m4v)$/.test(n)) return "video";
  if (/\.(mp3|m4a|wav|ogg|flac|aac)$/.test(n)) return "audio";
  if (/\.(txt|md|markdown|csv|tsv|json|ya?ml|toml|xml|html?|css|log|tex|bib|sh|py|ipynb|c|h|cc|cpp|hpp|java|kt|kts|js|jsx|ts|tsx|rs|go|rb|swift|sql|m|r|ini|conf)$/.test(n)) return "text";
  return "file";
}

/** What a drag of a drive entry carries (within the app). */
export const DRIVE_DRAG = "application/x-assistant-drive";

/** The last thing copied or cut, to paste into another folder (kept across folders and pages). */
export type Clip = { path: string; name: string; folder: boolean; cut: boolean };

/** In a project's Course files (what PLMS has, kept as it is there; copy one out to change it), or that folder itself. */
export const readOnly = (path: string) => {
  const parts = path.split("/");
  return parts.length >= 3 && parts[0] === "Projects" && parts[2] === "Course files";
};

/** Projects/ and each project's own folder: they follow the projects (renamed by renaming the project). */
export const isFixed = (path: string) => path === "Projects/" || (path.startsWith("Projects/") && path.split("/").filter(Boolean).length <= 2);

/** A folder new things can go into: not the drive's top, Projects/ itself, or Course files. */
export const writable = (folder: string) => folder !== "" && folder !== "Projects/" && !readOnly(folder);

/** The app's own address of a drive path (a folder shown in Files, or a file in its viewer). */
export const appUrl = (path: string) => "/" + filesRoute(path.startsWith("Projects/") ? path.slice("Projects/".length) : path);

/** A folder as an entry, for folders known only by path (the top of a tree, the folder shown). */
export const folderEntry = (path: string, name?: string): DriveEntry => ({
  path,
  name: name ?? path.split("/").filter(Boolean).pop() ?? "",
  folder: true,
  size: 0,
});

/**
 * Makes a new file in [folder] called [name], or "name (2).ext" and so on if that's taken: written
 * with If-None-Match: *, so it never replaces a file that's there (a 412 tries the next name).
 * [body] is its contents, given the name it gets. Its name.
 */
export async function createFile(folder: string, name: string, body: (name: string) => BodyInit, type: string): Promise<string> {
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 1; n <= 100; n++) {
    const at = n === 1 ? name : `${stem} (${n})${ext}`;
    const res = await fetch(fileUrl(folder + at), { method: "PUT", headers: { "Content-Type": type, "If-None-Match": "*" }, body: body(at) });
    if (res.status === 412) continue;
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `Couldn't make ${at} (${res.status})`);
    return at;
  }
  throw new Error(`No free name for ${name}`);
}

/** [name] in [folder], numbered ("Notes (2)") if something there is already called that (for folders; files use [createFile]). */
export async function freeName(folder: string, name: string) {
  const res = await api.GET("/api/v1/drive/folder", { params: { query: { path: folder } } });
  const taken = new Set((res.data?.entries ?? []).map((e) => e.name));
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let n = 2;
  let free = name;
  while (taken.has(free)) free = `${stem} (${n++})${ext}`;
  return free;
}

export type Trashed = components["schemas"]["Trashed"];

/** What's in the drive's trash (deleted things, kept 30 days), latest first. */
export function useTrash() {
  return useQuery({ queryKey: ["drive", "trash"], queryFn: async () => unwrap(await api.GET("/api/v1/drive/trash")) });
}

export function useTrashMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["drive"] });
  return {
    /** Puts [id] back where it was; where it went. */
    restore: useMutation({
      mutationFn: async (id: string) => unwrap(await api.POST("/api/v1/drive/trash/{id}/restore", { params: { path: { id } } })).path,
      onSettled: refresh,
    }),
    /** Deletes [id] for good. */
    purge: useMutation({
      mutationFn: async (id: string) => void (await api.DELETE("/api/v1/drive/trash/{id}", { params: { path: { id } } })),
      onSettled: refresh,
    }),
    /** Deletes everything in the trash for good. */
    empty: useMutation({
      mutationFn: async () => void (await api.DELETE("/api/v1/drive/trash")),
      onSettled: refresh,
    }),
  };
}

export type FileState = components["schemas"]["FileState"];

/** What [path] is part of: a copy of a course file and that file (updated since?), or a course file and its copy. Null: neither. */
export function useAnnotation(path: string, enabled = true) {
  return useQuery({
    queryKey: ["drive", "annotation", path],
    enabled,
    queryFn: async () => unwrap(await api.GET("/api/v1/drive/annotation", { params: { query: { path } } })) ?? null,
  });
}

/** Making a course PDF's copy to write on, and carrying writing over to its course file's new version (or not). */
export function useAnnotationMutations() {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ["drive", "annotation"] });
  return {
    annotate: useMutation({ mutationFn: async (path: string) => unwrap(await api.POST("/api/v1/drive/annotate", { params: { query: { path } } })), onSettled: done }),
    carry: useMutation({ mutationFn: async (path: string) => unwrap(await api.POST("/api/v1/drive/annotation/carry", { params: { query: { path } } })), onSettled: done }),
    dismiss: useMutation({ mutationFn: async (path: string) => unwrap(await api.POST("/api/v1/drive/annotation/dismiss", { params: { query: { path } } })), onSettled: done }),
  };
}

/** Copies just made to write on: they open ready to write. */
export const writeOnOpen = new Set<string>();

/** The starred files and folders. */
export function useStarred() {
  return useQuery({ queryKey: ["drive", "starred"], queryFn: async () => unwrap(await api.GET("/api/v1/drive/starred")) });
}

/** The files opened most recently, latest first. */
export function useRecent(limit = 8) {
  return useQuery({ queryKey: ["drive", "recent", limit], queryFn: async () => unwrap(await api.GET("/api/v1/drive/recent", { params: { query: { limit } } })) });
}

/** What's kept about files: starring one, and noting one was opened. */
export function useFileStateMutations() {
  const qc = useQueryClient();
  const change = useMutation({
    mutationFn: async ({ path, ...body }: { path: string; starred?: boolean; opened?: boolean; page?: number; zoom?: number; tool?: string }) =>
      unwrap(await api.PATCH("/api/v1/drive/state", { params: { query: { path } }, body })),
    onSettled: (_d, _e, v) => {
      if (v.starred !== undefined) void qc.invalidateQueries({ queryKey: ["drive", "starred"] });
      if (v.opened) void qc.invalidateQueries({ queryKey: ["drive", "recent"] });
    },
  });
  return {
    star: (path: string, on: boolean) => change.mutate({ path, starred: on }),
    opened: (path: string) => change.mutate({ path, opened: true }),
  };
}

/** A path known only by itself (a starred or recent one) as an entry. */
export const entryOf = (path: string): DriveEntry =>
  path.endsWith("/") ? folderEntry(path) : { path, name: path.split("/").pop() ?? path, folder: false, size: 0 };

/** What's kept about [path] (where a PDF was left: page from 0, zoom, tool). */
export function useFileState(path: string, enabled = true) {
  return useQuery({ queryKey: ["drive", "state", path], enabled, staleTime: 0, queryFn: async () => unwrap(await api.GET("/api/v1/drive/state", { params: { query: { path } } })) });
}

/** Keeps where [path] was left (page, tool), quietly. */
export const keepPlace = (path: string, place: { page?: number; tool?: string }) =>
  void api.PATCH("/api/v1/drive/state", { params: { query: { path } }, body: place });
