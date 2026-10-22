import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

/** Which document the path's live state is now (null: none); undefined if the server can't be asked quickly. */
async function epochOf(path: string): Promise<string | null | undefined> {
  try {
    const r = await fetch(`/api/v1/sync/epoch?doc=${encodeURIComponent(path)}`, { signal: AbortSignal.timeout(3000) });
    return r.ok ? ((await r.json()) as { epoch: string | null }).epoch : undefined;
  } catch {
    return undefined;
  }
}

/**
 * This browser's copy of [path]'s live document, opened into [doc]: used only while it's still that
 * path's document there (not one deleted since and made again), let go of if not. Offline, what's
 * kept is all there is, so it's used.
 */
export async function openKept(path: string, doc: Y.Doc): Promise<IndexeddbPersistence> {
  const name = `assistant:${path}`;
  const now = epochOf(path);
  const looked = new Y.Doc();
  const probe = new IndexeddbPersistence(name, looked);
  await probe.whenSynced;
  const kept = (await probe.get("epoch")) as string | undefined;
  const has = Y.encodeStateVector(looked).length > 1;
  const current = await now;
  const stale = kept ? current !== undefined && current !== kept : has;
  await (stale ? probe.clearData() : probe.destroy());
  looked.destroy();
  return new IndexeddbPersistence(name, doc);
}

/** Notes which document what's kept is, once the server's is here. */
export async function keepEpoch(path: string, local: IndexeddbPersistence) {
  const now = await epochOf(path);
  if (now) await local.set("epoch", now).catch(() => {});
}
