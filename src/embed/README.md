# The note editor, embedded

The web app's Markdown + TeX editor on its own, for the native apps (Android WebView, macOS
WKWebView) to show from files they bundle. The page reaches nothing over the network: the app
reads and writes notes (and their images) and answers the page's requests.

## Building

```sh
npm ci
npm run build:embed     # → dist/embed/embed.html + dist/embed/assets/ (≈3.3 MB, KaTeX fonts included)
```

`npm run build` (the web app) empties `dist/`, so run `build:embed` after it, or on its own.
Copy the whole `dist/embed/` directory into the app (Android: `app/src/main/assets/editor/`,
macOS: a folder reference in the bundle) and load `embed.html`:

- Android: `WebViewAssetLoader` (`https://appassets.androidplatform.net/assets/editor/embed.html`),
  JavaScript on, `addJavascriptInterface(host, "AssistantAndroid")` **before** loading.
- macOS: `loadFileURL(embedURL, allowingReadAccessTo: editorFolderURL)`, with a
  `WKScriptMessageHandlerWithReply` added as `"assistant"` (`addScriptMessageHandler(_:contentWorld: .page, name: "assistant")`).

All paths in the bundle are relative, and the script is a classic (non-module) one, so `file://` works.

## Host → page

The page puts `window.assistantEditor` in place before it says `ready`:

| Call | What it does |
| --- | --- |
| `open({ path, text, etag, readOnly?, theme? })` | Shows a note: its drive path (`Projects/…/x.md`), its text and version (ETag, or `null`). Saves what's unsaved in the note open before. |
| `setTheme("light" \| "dark" \| "system")` | `system` follows `prefers-color-scheme`. |
| `setSource(on)` | Shows the Markdown as written (`true`) or rendered as you write (`false`, the default). |
| `flush(): Promise<void>` | Saves what's unsaved now (call before the app pauses or the view goes away). |
| `reloadIfUnchanged({ text, etag })` | A newer version the app found: shown if nothing's being edited (else ignored; the next save conflicts). |
| `_reply(id, json, error?)` | Android only: the answer to request `id` (its JSON as a string), or `error` (a message) to fail it. |

From Kotlin, `webView.evaluateJavascript("assistantEditor.open(${json})", null)`.

## Page → host

Every message is `{ id?, type, payload }`. Requests carry an `id` and want an answer; notices don't.

- Android: `AssistantAndroid.postMessage(json: String)` with the message as JSON. Answer a request
  by calling `assistantEditor._reply(id, resultJson)` (or `_reply(id, null, "message")` on failure).
- WebKit: `webkit.messageHandlers.assistant.postMessage(message)`; answer with the reply handler's
  value (a dictionary), or its error string to fail it.

### Requests

| type | payload | answer |
| --- | --- | --- |
| `save` | `{ path, text, etag, force }` | `{ etag }` (the new version; `null` if unknown), or `{ conflict: true }` if the file changed since `etag` (never when `force`). Write only if the file's version is still `etag` (`If-Match`); `force` writes regardless. |
| `load` | `{ path }` | `{ text, etag }`: the note as it is now ("Load theirs", and after "Save mine as a copy"). |
| `saveCopy` | `{ path, text }` | `{ name }`: writes `text` beside the note under a free name (e.g. `x (my copy).md`, numbered if taken). |
| `uploadImage` | `{ notePath, name, mimeType, base64 }` | `{ relativePath }`: puts an image pasted or dropped into the note beside it (the web app uses `attachments/<name>`, numbered if taken); the link relative to the note's folder. |
| `readImage` | `{ path }` | `{ mimeType, base64 }`: a drive image the note shows (resolved to a drive path). |

On failure, fail the request with a short message; the page shows it ("Couldn't save: …", with Try again).

### Notices

| type | payload | |
| --- | --- | --- |
| `ready` | `{}` | The page is up; `open` the note. |
| `status` | `{ state, message? }` | `state`: `loading`, `saved`, `unsaved`, `saving`, `error` (with `message`), `conflict`, `readonly`. For the app's own title bar; the page shows the conflict and error banners itself. |
| `openLink` | `{ href, resolvedPath? }` | ⌘/Ctrl-click (or a tap, read-only) on a link: `resolvedPath` is the drive file it points to (relative links resolved), absent for web addresses. |

The TypeScript shapes are `HostRequests` and `HostNotices` in `bridge.ts`, and `EditorApi` in `main.tsx`.
