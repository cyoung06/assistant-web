/**
 * The notes open now, by path (kept apart from the editor, so the file browser can reach them
 * without loading it): each one's flush, and its stop (for a note being deleted).
 */
export const openNotes = new Map<string, { flush: () => Promise<boolean>; stop: (stopped: boolean) => void }>();
const under = (prefix: string) => [...openNotes].filter(([p]) => p === prefix || (prefix.endsWith("/") && p.startsWith(prefix))).map(([, n]) => n);

/** Writes what's unsaved in the open notes at [prefix] (a note, or a folder ending in "/"); true if it's all written. */
export async function flushNotes(prefix: string): Promise<boolean> {
  return (await Promise.all(under(prefix).map((n) => n.flush()))).every(Boolean);
}

/**
 * [prefix] (a note, or a folder ending in "/") is being deleted: its open notes write nothing back
 * (which would make them again). Returns the undo, for when the delete fails.
 */
export function stopNotes(prefix: string): () => void {
  const notes = under(prefix);
  for (const n of notes) n.stop(true);
  return () => notes.forEach((n) => n.stop(false));
}
