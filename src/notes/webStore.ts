import type { QueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { fileUrl, freeName, parentOf, type DriveEntry } from "../files/api";
import { pastedName, relativeTo } from "./md";
import { strongTag, type Loaded, type NoteStore } from "./store";

async function listed(path: string): Promise<(DriveEntry & { etag?: string | null }) | undefined> {
  const res = await api.GET("/api/v1/drive/folder", { params: { query: { path: parentOf(path) } } });
  return res.data?.entries.find((e) => e.path === path);
}

async function read(path: string): Promise<Loaded> {
  const res = await fetch(fileUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't open the note (${res.status})`);
  const text = await res.text();
  const etag = res.headers.get("ETag");
  return { text, version: { etag, modified: etag ? null : ((await listed(path))?.modified ?? null) } };
}

const conflict = { conflict: true } as const;

/** Notes in the drive, over the API; drive links open in the app ([openPath]), web ones in a new tab. */
export function webStore(qc: QueryClient, openPath: (path: string) => void): NoteStore {
  const refresh = (path: string) => void qc.invalidateQueries({ queryKey: ["drive", "folder", parentOf(path)] });
  return {
    read,

    async write(path, text, version, force) {
      const headers: Record<string, string> = { "Content-Type": "text/markdown; charset=utf-8" };
      if (!force && version.etag) headers["If-Match"] = strongTag(version.etag);
      // Without ETags (an older server), the folder listing's modified time tells.
      if (!force && !version.etag && version.modified) {
        const now = (await listed(path))?.modified ?? null;
        if (now && now !== version.modified) return conflict;
      }
      // An empty body may be refused by older servers; an empty note is a newline.
      const res = await fetch(fileUrl(path), { method: "PUT", headers, body: text || "\n", keepalive: text.length < 60_000 });
      if (res.status === 412) return conflict;
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `Failed (${res.status})`);
      const etag = res.headers.get("ETag");
      if (etag) return { version: { etag, modified: null } };
      const e = await listed(path);
      return { version: { etag: e?.etag ?? null, modified: e?.etag ? null : (e?.modified ?? null) } };
    },

    async saveCopy(path, text) {
      const folder = parentOf(path);
      const name = await freeName(folder, path.split("/").pop()!.replace(/(\.[^.]+)?$/, " (my copy)$1"));
      const res = await fetch(fileUrl(folder + name), { method: "PUT", headers: { "Content-Type": "text/markdown; charset=utf-8" }, body: text || "\n" });
      if (!res.ok) throw new Error(`Couldn't save the copy (${res.status})`);
      return name;
    },

    async uploadImage(notePath, file) {
      const folder = parentOf(notePath);
      const dir = folder + "attachments/";
      const name = await freeName(dir, pastedName(file));
      const res = await fetch(fileUrl(dir + name), { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!res.ok) throw new Error(`Couldn't upload ${name} (${res.status})`);
      void qc.invalidateQueries({ queryKey: ["drive", "folder", dir] });
      return relativeTo(folder, dir + name);
    },

    imageSrc: fileUrl,

    openLink(href, path) {
      if (path === null) window.open(href, "_blank", "noopener");
      else openPath(path);
    },

    async changed(path, version) {
      if (version.etag) {
        const res = await fetch(fileUrl(path), { cache: "no-store", headers: { "If-None-Match": strongTag(version.etag) } });
        if (res.status === 304 || !res.ok) return null;
        const etag = res.headers.get("ETag");
        if (etag && strongTag(etag) === strongTag(version.etag)) return null;
        return { text: await res.text(), version: { etag, modified: null } };
      }
      if (version.modified) {
        const now = (await listed(path))?.modified ?? null;
        if (!now || now === version.modified) return null;
        return read(path);
      }
      return null;
    },

    saved: refresh,
  };
}
