/**
 * The editor's side of the bridge to a native app hosting it (Android WebView, macOS WKWebView).
 * The host does all reading and writing; the page asks it (requests, answered) and tells it
 * (notices, not answered). See README.md for the whole contract.
 */

/** Requests the page makes, and what the host answers. */
export interface HostRequests {
  save: { args: { path: string; text: string; etag: string | null; force: boolean }; result: { etag: string | null } | { conflict: true } };
  load: { args: { path: string }; result: { text: string; etag: string | null } };
  saveCopy: { args: { path: string; text: string }; result: { name: string } };
  uploadImage: { args: { notePath: string; name: string; mimeType: string; base64: string }; result: { relativePath: string } };
  readImage: { args: { path: string }; result: { mimeType: string; base64: string } };
}

/** Notices the page sends (no answer). */
export interface HostNotices {
  ready: Record<string, never>;
  status: { state: string; message?: string };
  openLink: { href: string; resolvedPath?: string };
}

/** How messages reach the host: [send] a message; for WebKit its answer comes back as a promise. */
export interface Transport {
  send(message: OutgoingMessage): void | Promise<unknown>;
  /** Whether answers come back through [Bridge.reply] (Android) rather than from [send] (WebKit). */
  repliesLater: boolean;
}

export type OutgoingMessage = { id?: number; type: string; payload: unknown };

/** Requests and their answers, matched by id. */
export class Bridge {
  private next = 1;
  private waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(private readonly transport: Transport) {}

  request<K extends keyof HostRequests>(type: K, payload: HostRequests[K]["args"]): Promise<HostRequests[K]["result"]> {
    const id = this.next++;
    const message = { id, type, payload };
    if (!this.transport.repliesLater) {
      return Promise.resolve(this.transport.send(message)) as Promise<HostRequests[K]["result"]>;
    }
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
      try {
        this.transport.send(message);
      } catch (e) {
        this.waiting.delete(id);
        reject(e as Error);
      }
    });
  }

  notify<K extends keyof HostNotices>(type: K, payload: HostNotices[K]): void {
    void Promise.resolve(this.transport.send({ type, payload })).catch(() => {});
  }

  /** The host's answer to request [id]: its result (an object, or its JSON), or with [error], a failure. */
  reply(id: number, result: unknown, error?: string): void {
    const w = this.waiting.get(id);
    if (!w) return;
    this.waiting.delete(id);
    if (error) return w.reject(new Error(error));
    w.resolve(typeof result === "string" ? JSON.parse(result) : result);
  }
}

type AndroidHost = { postMessage(json: string): void };
type WebKitHost = { postMessage(message: unknown): Promise<unknown> };

/** The host's transport: Android's JavaScript interface, or WebKit's message handler (answered). */
export function hostTransport(w: Window = window): Transport | null {
  const android = (w as unknown as { AssistantAndroid?: AndroidHost }).AssistantAndroid;
  if (android) return { repliesLater: true, send: (m) => android.postMessage(JSON.stringify(m)) };
  const webkit = (w as unknown as { webkit?: { messageHandlers?: { assistant?: WebKitHost } } }).webkit?.messageHandlers?.assistant;
  if (webkit) return { repliesLater: false, send: (m) => webkit.postMessage(m) };
  return null;
}
