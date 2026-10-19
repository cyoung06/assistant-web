/**
 * Where a note is read from and written to: the drive over the API (the web app), or a native
 * app's own (the editor embedded in Android and macOS). Versions are the store's own: an ETag, or
 * whatever it uses to tell that the file changed elsewhere.
 */
export interface NoteStore {
  /** The note as it's written now. */
  read(path: string): Promise<Loaded>;
  /** Writes the note, unless it changed since [version]; with [force], over whatever is there. */
  write(path: string, text: string, version: Version, force: boolean): Promise<{ version: Version } | { conflict: true }>;
  /** Writes [text] beside the note as a copy (a name that's free); the copy's name. */
  saveCopy(path: string, text: string): Promise<string>;
  /** Puts an image (pasted or dropped into the note) beside it; the link to it, relative to the note's folder. */
  uploadImage(notePath: string, file: File): Promise<string>;
  /** What an <img> shows for a drive image. */
  imageSrc(path: string): string | Promise<string>;
  /** Opens a link: a web address, or (with [path]) a drive file. */
  openLink(href: string, path: string | null): void;
  /** What's there now if the note changed since [version] (asked on coming back to the page); null if not. */
  changed?(path: string, version: Version): Promise<Loaded | null>;
  /** Newer versions told by the host (instead of asking): shown if nothing's being edited. Returns an unsubscribe. */
  watch?(onNewer: (loaded: Loaded) => void): () => void;
  /** How saving is going, for the host's own display. */
  status?(state: NoteStatus, message?: string): void;
  /** After a write (the web app refreshes its folder listing). */
  saved?(path: string): void;
}

export type Version = { etag: string | null; modified: string | null };
export type Loaded = { text: string; version: Version };

export type NoteStatus = "loading" | "saved" | "unsaved" | "saving" | "error" | "conflict" | "readonly";

/** An ETag as the file's own: a compressing proxy on the way marks them weak ("W/"). */
export const strongTag = (etag: string) => etag.replace(/^W\//, "");
