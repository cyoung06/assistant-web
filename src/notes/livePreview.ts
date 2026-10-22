import { EditorState, StateEffect, StateField, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, showTooltip, type Tooltip, WidgetType } from "@codemirror/view";
import { spansOf, styleOf, type Alignment, type Core, type Span } from "./core";

/**
 * Obsidian-style live preview: a note reads as rendered (headings sized, emphasis and links
 * styled with their marks hidden, tasks as checkboxes, math typeset, diagrams and images shown)
 * except where the cursor is, which shows the Markdown as written. The file stays plain Markdown.
 * What's what comes from the shared core, so it reads the same as in the Android and macOS apps.
 */

/** Whether the editor has focus: without it, nothing shows as written. */
export const focusChanged = StateEffect.define<boolean>();
const focused = StateField.define<boolean>({
  create: () => false,
  update: (v, tr) => tr.effects.reduce((f, e) => (e.is(focusChanged) ? e.value : f), v),
});

/** Whether the page is dark (math and diagrams are drawn in the theme's colours). */
export const darkChanged = StateEffect.define<boolean>();
const dark = StateField.define<boolean>({
  create: () => false,
  update: (v, tr) => tr.effects.reduce((d, e) => (e.is(darkChanged) ? e.value : d), v),
});

type Setup = { core: Core; folder: string; open: OpenLink; images: ImageSource; mention: OpenMention };
const setup = StateField.define<Setup | null>({ create: () => null, update: (v) => v });

/** Where a note's images come from: a drive path to something an <img> can show. */
export type ImageSource = (path: string) => string | Promise<string>;

/** Opens a link: a web address, or (with [path]) a drive file. */
export type OpenLink = (href: string, path: string | null) => void;
/** Opens what a mention (`@Name`) in the note means. */
export type OpenMention = (name: string) => void;

/** A drawing from the core (its SVG is only paths: text comes outlined). */
function drawing(svg: string, cls: string) {
  const el = document.createElement("span");
  el.className = cls;
  el.innerHTML = svg;
  return el;
}

/** [tex] typeset by the core, in the note's text colour; a TeX error shows red, where the math is. */
function typeset(core: Core, tex: string, display: boolean, isDark: boolean): HTMLElement {
  const style = styleOf(core, isDark);
  try {
    const d = core.renderMath(tex, display, style.fontSize, style.text);
    const el = drawing(d.svg, display ? "cm-md-math cm-md-mathBlock" : "cm-md-math");
    // Its baseline on the text's.
    if (!display) (el.firstElementChild as SVGElement).style.verticalAlign = `${d.baseline - d.height}px`;
    d.free();
    return el;
  } catch (e) {
    const el = document.createElement("span");
    el.className = "cm-md-mathError";
    el.textContent = tex;
    el.title = (e as Error).message;
    return el;
  }
}

class MathWidget extends WidgetType {
  constructor(
    readonly core: Core,
    readonly tex: string,
    readonly display: boolean,
    readonly dark: boolean,
  ) {
    super();
  }
  eq(o: MathWidget) {
    return o.tex === this.tex && o.display === this.display && o.dark === this.dark;
  }
  toDOM(view: EditorView) {
    const el = typeset(this.core, this.tex, this.display, this.dark);
    editOnClick(el, view);
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

class DiagramWidget extends WidgetType {
  constructor(
    readonly core: Core,
    readonly source: string,
    readonly dark: boolean,
  ) {
    super();
  }
  eq(o: DiagramWidget) {
    return o.source === this.source && o.dark === this.dark;
  }
  toDOM(view: EditorView) {
    let el: HTMLElement;
    try {
      const d = this.core.renderMermaid(this.source, this.dark);
      el = drawing(d.svg, "cm-md-diagram");
      d.free();
    } catch (e) {
      el = document.createElement("div");
      el.className = "cm-md-mathError";
      el.textContent = (e as Error).message;
    }
    editOnClick(el, view);
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    /** A web address, or (with [source]) a drive path. */
    readonly src: string,
    readonly alt: string,
    readonly source: ImageSource | null,
  ) {
    super();
  }
  eq(o: ImageWidget) {
    return o.src === this.src && o.alt === this.alt && o.source === this.source;
  }
  toDOM(view: EditorView) {
    const img = document.createElement("img");
    img.className = "cm-md-image";
    const src = this.source ? this.source(this.src) : this.src;
    if (typeof src === "string") img.src = src;
    else void src.then((s) => (img.src = s)).catch(() => (img.alt = `${this.alt || this.src} (couldn't load)`));
    img.alt = this.alt;
    img.title = this.alt;
    editOnClick(img, view);
    return img;
  }
  ignoreEvent() {
    return false;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(o: CheckboxWidget) {
    return o.checked === this.checked;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-md-task";
    box.checked = this.checked;
    box.addEventListener("mousedown", (e) => e.preventDefault());
    box.addEventListener("click", (e) => {
      e.preventDefault();
      if (view.state.readOnly) return;
      const at = view.posAtDOM(box);
      const marker = view.state.sliceDoc(at, at + 5);
      const box3 = marker.indexOf("[");
      if (box3 < 0) return;
      view.dispatch({ changes: { from: at + box3 + 1, to: at + box3 + 2, insert: this.checked ? " " : "x" } });
    });
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

/** How an inline element's text looks. */
const markClass: Partial<Record<string, string>> = { emphasis: "cm-md-em", strong: "cm-md-strong", strikethrough: "cm-md-strike", inlineCode: "cm-md-inlineCode" };

/**
 * A cell's (or any short piece's) inline Markdown, drawn: emphasis, code, links and math as the
 * note shows them, its marks left out.
 */
function inline(core: Core, text: string, isDark: boolean): DocumentFragment {
  const out = document.createDocumentFragment();
  const classes: string[][] = Array.from({ length: text.length }, () => []);
  const hidden = new Array<boolean>(text.length).fill(false);
  const math = new Map<number, { to: number; tex: string }>();
  const mark = (from: number, to: number, cls: string) => {
    for (let i = from; i < to; i++) classes[i]!.push(cls);
  };
  for (const s of spansOf(core, text)) {
    const { from, to } = s.range;
    const e = s.element;
    const cls = e.kind === "link" || e.kind === "autolink" || e.kind === "mention" ? "cm-md-link" : markClass[e.kind];
    if (cls) mark(from, to, cls);
    if (e.kind === "math") math.set(from, { to, tex: e.tex });
    if (e.kind !== "autolink") for (const m of s.marks) hidden.fill(true, m.from, m.to);
  }
  let i = 0;
  while (i < text.length) {
    const m = math.get(i);
    if (m) {
      out.append(typeset(core, m.tex, false, isDark));
      i = m.to;
      continue;
    }
    if (hidden[i]) {
      i++;
      continue;
    }
    const key = classes[i]!.join(" ");
    let j = i + 1;
    while (j < text.length && !hidden[j] && !math.has(j) && classes[j]!.join(" ") === key) j++;
    const run = document.createElement("span");
    run.className = key;
    run.textContent = text.slice(i, j);
    out.append(run);
    i = j;
  }
  return out;
}

/** A GFM table, drawn as one (its cells' inline Markdown too). */
class TableWidget extends WidgetType {
  constructor(
    readonly core: Core,
    readonly rows: string[][],
    readonly alignments: Alignment[],
    readonly dark: boolean,
  ) {
    super();
  }
  eq(o: TableWidget) {
    return JSON.stringify(o.rows) === JSON.stringify(this.rows) && o.alignments.join() === this.alignments.join() && o.dark === this.dark;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "cm-md-tableView";
    const table = el.appendChild(document.createElement("table"));
    this.rows.forEach((row, r) => {
      const tr = table.appendChild(document.createElement("tr"));
      row.forEach((cell, c) => {
        const td = tr.appendChild(document.createElement(r === 0 ? "th" : "td"));
        td.style.textAlign = this.alignments[c] ?? "left";
        td.append(inline(this.core, cell, this.dark));
      });
    });
    editOnClick(el, view);
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-md-bullet";
    s.textContent = "•";
    return s;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-md-hr";
    return s;
  }
}

/** Clicking something drawn (math, a table, an image) while editing puts the cursor into what's written there. */
function editOnClick(el: HTMLElement, view: EditorView) {
  el.addEventListener("mousedown", (e) => {
    if (view.state.readOnly) return;
    e.preventDefault();
    const at = view.posAtDOM(el);
    view.dispatch({ selection: { anchor: Math.min(at, view.state.doc.length) } });
    view.focus();
  });
}

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });
const line = (cls: string) => Decoration.line({ class: cls });

function build(state: EditorState): DecorationSet {
  const s = state.field(setup);
  if (!s) return Decoration.none;
  const { core } = s;
  const isDark = state.field(dark);
  const out: Range<Decoration>[] = [];
  const ranges = state.facet(EditorState.readOnly) || !state.field(focused) ? [] : state.selection.ranges;
  /** Whether the cursor (or a selection) is in [from, to]. */
  const touches = (from: number, to: number) => ranges.some((r) => r.from <= to && r.to >= from);
  const lineOf = (pos: number) => state.doc.lineAt(pos);
  /** The last line of a block (not the next one, when the block ends with its newline). */
  const lastLineOf = (from: number, to: number) => lineOf(to > from && state.sliceDoc(to - 1, to) === "\n" ? to - 1 : to);
  const lineTouched = (pos: number) => {
    const l = lineOf(pos);
    return touches(l.from, l.to);
  };
  const hideMarks = (span: Span) => {
    for (const m of span.marks) if (m.to > m.from) out.push(hide.range(m.from, m.to));
  };
  /** [widget] in place of whole lines [from]…[to]; what's inside them isn't styled on its own. */
  let replacedTo = -1;
  const block = (widget: WidgetType, from: number, to: number) => {
    const first = lineOf(from);
    const last = lastLineOf(from, to);
    out.push(Decoration.replace({ widget, block: true }).range(first.from, last.to));
    replacedTo = last.to;
  };

  for (const span of spansOf(core, state.doc.toString())) {
    const { from } = span.range;
    const to = Math.min(span.range.to, state.doc.length);
    if (to <= from || from < replacedTo) continue;
    const editing = touches(from, to);
    const e = span.element;
    switch (e.kind) {
      case "heading":
        out.push(line(`cm-md-h cm-md-h${Math.min(e.level, 6)}`).range(lineOf(from).from));
        if (!lineTouched(from)) hideMarks(span);
        break;
      case "emphasis":
      case "strong":
      case "strikethrough":
      case "inlineCode":
        out.push(Decoration.mark({ class: markClass[e.kind]! }).range(from, to));
        if (!editing) hideMarks(span);
        break;
      case "link":
      case "autolink":
        out.push(Decoration.mark({ class: "cm-md-link", attributes: { "data-href": e.url, title: `${e.url} (⌘-click to open)` } }).range(from, to));
        if (e.kind === "link" && !editing) hideMarks(span);
        break;
      case "mention":
        out.push(Decoration.mark({ class: "cm-md-link", attributes: { "data-mention": e.name, title: `@${e.name} (⌘-click to open)` } }).range(from, to));
        if (!editing) hideMarks(span);
        break;
      case "math":
        if (editing) {
          out.push(Decoration.mark({ class: "cm-md-mathSource" }).range(from, to));
        } else if (e.display && lineOf(from).from === from && lastLineOf(from, to).to === to) {
          block(new MathWidget(core, e.tex, true, isDark), from, to);
        } else {
          out.push(Decoration.replace({ widget: new MathWidget(core, e.tex, e.display, isDark) }).range(from, to));
        }
        break;
      case "bullet": {
        const m = span.marks[0];
        if (m && !lineTouched(from)) out.push(bullet.range(m.from, m.to));
        break;
      }
      case "task": {
        const m = span.marks[0];
        if (!m || touches(m.from, m.to)) break;
        // "- [x]" and the space after it become the box.
        const end = state.sliceDoc(m.to, m.to + 1) === " " ? m.to + 1 : m.to;
        out.push(Decoration.replace({ widget: new CheckboxWidget(e.checked) }).range(m.from, end));
        const l = lineOf(from);
        if (e.checked && end < l.to) out.push(Decoration.mark({ class: "cm-md-done" }).range(end, l.to));
        break;
      }
      case "quote":
        for (let pos = from; pos < to; ) {
          const l = lineOf(pos);
          out.push(line("cm-md-quote").range(l.from));
          pos = l.to + 1;
        }
        for (const m of span.marks) if (!lineTouched(m.from)) out.push(hide.range(m.from, m.to));
        break;
      case "rule":
        if (!lineTouched(from)) out.push(rule.range(from, lastLineOf(from, to).to));
        break;
      case "codeBlock": {
        if (e.language.toLowerCase() === "mermaid" && !editing) {
          block(new DiagramWidget(core, e.code, isDark), from, to);
          break;
        }
        const first = lineOf(from).number;
        const last = lastLineOf(from, to).number;
        const fences = new Set(span.marks.map((m) => lineOf(m.from).number));
        for (let n = first; n <= last; n++) {
          const fence = fences.has(n) && !editing;
          out.push(line(`cm-md-code${n === first ? " cm-md-codeFirst" : ""}${n === last ? " cm-md-codeLast" : ""}${fence ? " cm-md-fence" : ""}`).range(state.doc.line(n).from));
        }
        break;
      }
      case "table": {
        if (!editing) {
          block(new TableWidget(core, e.rows, e.alignments, isDark), from, to);
          break;
        }
        const first = lineOf(from).number;
        const last = lastLineOf(from, to).number;
        for (let n = first; n <= last; n++) out.push(line(n === first ? "cm-md-table cm-md-tableHead" : "cm-md-table").range(state.doc.line(n).from));
        break;
      }
      case "image":
        if (!editing) {
          const path = core.linkPath(s.folder, e.url);
          out.push(Decoration.replace({ widget: path === undefined ? new ImageWidget(e.url, e.alt, null) : new ImageWidget(path, e.alt, s.images) }).range(from, to));
          replacedTo = to;
        }
        break;
    }
  }
  return Decoration.set(out, true);
}

/**
 * While the cursor is in math (shown as TeX then), the math as it's being written, typeset, just
 * below it; or, while it doesn't parse, the TeX error saying why.
 */
function mathTip(state: EditorState): Tooltip | null {
  const s = state.field(setup);
  if (!s || state.facet(EditorState.readOnly) || !state.field(focused)) return null;
  const head = state.selection.main.head;
  for (const span of spansOf(s.core, state.doc.toString())) {
    const e = span.element;
    if (e.kind !== "math" || head < span.range.from || head > span.range.to) continue;
    const to = Math.min(span.range.to, state.doc.length);
    const { core } = s;
    const isDark = state.field(dark);
    return {
      pos: to,
      above: false,
      create: () => {
        const dom = document.createElement("div");
        dom.className = "cm-md-mathTip";
        if (!e.tex.trim()) {
          dom.textContent = "Type TeX…";
          dom.classList.add("cm-md-mathTipEmpty");
          return { dom };
        }
        const style = styleOf(core, isDark);
        try {
          const d = core.renderMath(e.tex, e.display, style.fontSize, style.text);
          dom.append(drawing(d.svg, "cm-md-math"));
          d.free();
        } catch (err) {
          dom.classList.add("cm-md-mathTipError");
          dom.textContent = (err as Error).message;
        }
        return { dom };
      },
    };
  }
  return null;
}

const mathPreview = StateField.define<Tooltip | null>({
  create: mathTip,
  update(tip, tr) {
    if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(focusChanged) || e.is(darkChanged))) return mathTip(tr.state);
    return tip;
  },
  provide: (f) => showTooltip.from(f),
});

const preview = StateField.define<DecorationSet>({
  create: build,
  update(deco, tr) {
    if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(focusChanged) || e.is(darkChanged)) || tr.startState.readOnly !== tr.state.readOnly) return build(tr.state);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * ⌘/Ctrl-click a link to open it ([open] gets its address, and the drive file it points to, if
 * one); with a finger or pen (no keys to hold), or while only reading, a tap on a link opens it.
 */
function linkClicks() {
  let pointer = "mouse";
  return EditorView.domEventHandlers({
    pointerdown(e) {
      pointer = e.pointerType;
      return false;
    },
    mousedown(e, view) {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-href], [data-mention]");
      const s = view.state.field(setup);
      if (!el || !s || !(e.metaKey || e.ctrlKey || view.state.readOnly || pointer !== "mouse")) return false;
      if (el.dataset.mention) {
        e.preventDefault();
        s.mention(el.dataset.mention);
        return true;
      }
      const href = el.dataset.href ?? "";
      if (!href) return false;
      e.preventDefault();
      s.open(href, s.core.linkPath(s.folder, href) ?? null);
      return true;
    },
    focus(_e, view) {
      queueMicrotask(() => view.dom.isConnected && view.dispatch({ effects: focusChanged.of(true) }));
      return false;
    },
    blur(_e, view) {
      queueMicrotask(() => view.dom.isConnected && view.dispatch({ effects: focusChanged.of(false) }));
      return false;
    },
  });
}

/** The live preview, for a note in [folder] (drawn by [core]); its drive images come from [images]. */
export const livePreview = (core: Core, folder: string, open: OpenLink, images: ImageSource, isDark: boolean, mention: OpenMention = () => {}) => [
  setup.init(() => ({ core, folder, open, images, mention })),
  focused,
  dark.init(() => isDark),
  preview,
  mathPreview,
  linkClicks(),
];
