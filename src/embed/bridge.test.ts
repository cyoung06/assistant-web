import { describe, expect, it } from "vitest";
import { Bridge, hostTransport, type OutgoingMessage } from "./bridge";

describe("bridge", () => {
  it("matches the host's later answers to their requests, in any order", async () => {
    const sent: OutgoingMessage[] = [];
    const bridge = new Bridge({ repliesLater: true, send: (m) => void sent.push(m) });
    const a = bridge.request("load", { path: "a.md" });
    const b = bridge.request("save", { path: "b.md", text: "x", etag: '"1"', force: false });
    expect(sent.map((m) => [m.type, m.id])).toEqual([
      ["load", 1],
      ["save", 2],
    ]);
    bridge.reply(2, JSON.stringify({ etag: '"2"' }));
    bridge.reply(1, { text: "hello", etag: null });
    await expect(b).resolves.toEqual({ etag: '"2"' });
    await expect(a).resolves.toEqual({ text: "hello", etag: null });
  });

  it("fails a request the host answers with an error, and ignores unknown answers", async () => {
    const bridge = new Bridge({ repliesLater: true, send: () => {} });
    const r = bridge.request("readImage", { path: "x.png" });
    bridge.reply(99, {});
    bridge.reply(1, null, "not found");
    await expect(r).rejects.toThrow("not found");
    // Answered once only.
    expect(() => bridge.reply(1, {})).not.toThrow();
  });

  it("takes WebKit's answers from the message handler's promise", async () => {
    const bridge = new Bridge({ repliesLater: false, send: (m) => Promise.resolve({ echoed: m.type }) });
    await expect(bridge.request("saveCopy", { path: "a.md", text: "" })).resolves.toEqual({ echoed: "saveCopy" });
  });

  it("sends notices without ids", () => {
    const sent: OutgoingMessage[] = [];
    new Bridge({ repliesLater: true, send: (m) => void sent.push(m) }).notify("status", { state: "saved" });
    expect(sent).toEqual([{ type: "status", payload: { state: "saved" } }]);
  });

  it("finds the host: Android's interface (JSON strings) or WebKit's handler", () => {
    const got: unknown[] = [];
    const android = hostTransport({ AssistantAndroid: { postMessage: (s: string) => got.push(s) } } as unknown as Window)!;
    expect(android.repliesLater).toBe(true);
    android.send({ id: 1, type: "load", payload: { path: "a" } });
    expect(got).toEqual(['{"id":1,"type":"load","payload":{"path":"a"}}']);
    const webkit = hostTransport({ webkit: { messageHandlers: { assistant: { postMessage: async () => 1 } } } } as unknown as Window)!;
    expect(webkit.repliesLater).toBe(false);
    expect(hostTransport({} as Window)).toBeNull();
  });
});
