import init, * as core from "../../generated/assistant_core.js";
import wasm from "../../generated/assistant_core_bg.wasm?url";
import codeFont from "../../core/fonts/JetBrainsMono-Regular.ttf?url";
import textFont from "../../core/fonts/Pretendard-Regular.otf?url";

/**
 * The shared core (core/, built by build-core.sh): notes' Markdown, math and diagrams as the
 * Android and macOS apps have them. Loaded once, with the fonts its drawings are measured and drawn
 * in (the text font first: it's the one diagrams and math's non-TeX text use).
 */
export type Core = typeof core;

let loading: Promise<Core> | null = null;

export function loadCore(): Promise<Core> {
  loading ??= (async () => {
    const fonts = Promise.all([textFont, codeFont].map(async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer())));
    await init({ module_or_path: wasm });
    for (const f of await fonts) core.registerFont(f);
    return core;
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/** What core.markdownSpans gives: elements over ranges of the note (UTF-16, as JavaScript indexes). */
export type TextRange = { from: number; to: number };
export type Alignment = "left" | "center" | "right";
export type Element =
  | { kind: "heading"; level: number }
  | { kind: "emphasis" | "strong" | "strikethrough" | "inlineCode" | "bullet" | "quote" | "rule" }
  | { kind: "link" | "autolink"; url: string }
  | { kind: "image"; url: string; alt: string }
  | { kind: "math"; tex: string; display: boolean }
  | { kind: "task"; checked: boolean }
  | { kind: "codeBlock"; language: string; code: string }
  | { kind: "table"; rows: string[][]; alignments: Alignment[] };
export type Span = { element: Element; range: TextRange; marks: TextRange[] };

export const spansOf = (c: Core, text: string) => c.markdownSpans(text) as Span[];

/** The note's look (sizes in CSS pixels or ems of the body text; colours ARGB), as every app draws it. */
export type NoteStyle = {
  background: number;
  text: number;
  textSecondary: number;
  textTertiary: number;
  accent: number;
  rule: number;
  fontSize: number;
};
export const styleOf = (c: Core, dark: boolean) => c.noteStyle(dark) as NoteStyle;

export type SlashItem = { label: string; keywords: string; text: string; cursor: number };
export type Edit = { changes: { from: number; to: number; insert: string }[]; anchor: number; head: number };
