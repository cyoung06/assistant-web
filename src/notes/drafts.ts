import type { Version } from "./store";

/**
 * Unsaved notes, kept in this browser (or app web view) until they're written: what was typed and
 * the version it was based on. Leaving a note, closing the page, a failed save or a crash loses
 * nothing; the note opens with it again (as a conflict if the note changed meanwhile).
 */
export type Draft = { text: string; base: Version; at: number };

const key = (path: string) => `note-draft:${path}`;

export const drafts = {
  get(path: string): Draft | null {
    try {
      const s = localStorage.getItem(key(path));
      return s ? (JSON.parse(s) as Draft) : null;
    } catch {
      return null;
    }
  },
  put(path: string, draft: Draft) {
    try {
      localStorage.setItem(key(path), JSON.stringify(draft));
    } catch {
      // Storage full or off: the note is still saved to the drive as usual.
    }
  },
  clear(path: string) {
    try {
      localStorage.removeItem(key(path));
    } catch {
      // Nothing kept, nothing to clear.
    }
  },
  /** Every draft at [prefix] (a note, or a folder ending in "/"), for when it's deleted. */
  clearUnder(prefix: string) {
    try {
      const gone = Object.keys(localStorage).filter((k) => k === key(prefix) || (prefix.endsWith("/") && k.startsWith(key(prefix))));
      for (const k of gone) localStorage.removeItem(k);
    } catch {
      // Nothing kept, nothing to clear.
    }
  },
};
