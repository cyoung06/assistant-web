import type { QueryClient } from "@tanstack/react-query";
import { createFile, fileUrl, parentOf } from "../files/api";
import { loadCore } from "./core";
import type { Loaded, NoteStore } from "./store";

async function read(path: string): Promise<Loaded> {
  const res = await fetch(fileUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't open the note (${res.status})`);
  return { text: await res.text() };
}

/** [now] as YYYYMMDDhhmmss, local time. */
function stamp(now: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/** Notes in the drive, over the API; drive links open in the app ([openPath]), web ones in a new tab. */
export function webStore(qc: QueryClient, openPath: (path: string) => void): NoteStore {
  return {
    read,

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
  };
}
