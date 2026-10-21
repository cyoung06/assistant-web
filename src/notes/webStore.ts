import type { QueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { createFile, fileUrl, parentOf, type DriveEntry } from "../files/api";
import { loadCore } from "./core";
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

/** [now] as YYYYMMDDhhmmss, local time. */
function stamp(now: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/** Notes in the drive, over the API; drive links open in the app ([openPath]), web ones in a new tab. */
export function webStore(qc: QueryClient, openPath: (path: string) => void): NoteStore {
  const refresh = (path: string) => void qc.invalidateQueries({ queryKey: ["drive", "folder", parentOf(path)] });
  return {
    read,

    async write(path, text, version, force, closing) {
      const headers: Record<string, string> = { "Content-Type": "text/markdown; charset=utf-8" };
      if (!force && version.etag) headers["If-Match"] = strongTag(version.etag);
      // Without ETags (an older server), the folder listing's modified time tells.
      if (!force && !version.etag && version.modified) {
        const now = (await listed(path))?.modified ?? null;
        if (now && now !== version.modified) return conflict;
      }
      // An empty body may be refused by older servers; an empty note is a newline.
      // As the page closes, only a keepalive request still goes, and browsers take those up to 64 KiB
      // (in bytes); a longer note waits in its draft for the next time it's opened.
      const body = text || "\n";
      const keepalive = !!closing && new TextEncoder().encode(body).length < 60_000;
      const res = await fetch(fileUrl(path), { method: "PUT", headers, body, keepalive });
      if (res.status === 412) return conflict;
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `Failed (${res.status})`);
      const etag = res.headers.get("ETag");
      if (etag) return { version: { etag, modified: null } };
      const e = await listed(path);
      return { version: { etag: e?.etag ?? null, modified: e?.etag ? null : (e?.modified ?? null) } };
    },

    async saveCopy(path, text) {
      const name = path.split("/").pop()!.replace(/(\.[^.]+)?$/, " (my copy)$1");
      return createFile(parentOf(path), name, () => text || "\n", "text/markdown; charset=utf-8");
    },

    async uploadImage(notePath, file) {
      const core = await loadCore();
      const folder = parentOf(notePath);
      const dir = folder + "attachments/";
      const name = await createFile(dir, core.pastedName(file.name, file.type, stamp(new Date())), () => file, file.type || "application/octet-stream");
      void qc.invalidateQueries({ queryKey: ["drive", "folder", dir] });
      return core.relativeLink(folder, dir + name);
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
