/** Where a note's images and links go, and (for the ones only read) where it's read from: the drive, over the API. */
export interface NoteStore {
  /** The note as it's written now (notes only read; the others come live, see NoteEditor). */
  read(path: string): Promise<Loaded>;
  /** Puts an image (pasted or dropped into the note) beside it; the link to it, relative to the note's folder. */
  uploadImage(notePath: string, file: File): Promise<string>;
  /** What an <img> shows for a drive image. */
  imageSrc(path: string): string | Promise<string>;
  /** Opens a link: a web address, or (with [path]) a drive file. */
  openLink(href: string, path: string | null): void;
  /** Opens what a mention (`@Name`) in the note at [notePath] means. */
  openMention(name: string, notePath: string): void;
}

export type Loaded = { text: string };

export type NoteStatus = "loading" | "live" | "connecting" | "offline" | "error" | "readonly";
