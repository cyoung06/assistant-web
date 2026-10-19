import { syntaxTree } from "@codemirror/language";
import { EditorState, StateEffect, StateField, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import DOMPurify from "dompurify";
import katex from "katex";
import { Marked } from "marked";
import { mathRanges, resolveRelative, toggledTask } from "./md";

/**
 * Obsidian-style live preview: a note reads as rendered (headings sized, emphasis and links
 * styled with their marks hidden, tasks as checkboxes, math typeset, images shown) except where
 * the cursor is, which shows the Markdown as written. The file stays plain Markdown.
 */

/** Whether the editor has focus: without it, nothing shows as written. */
export const focusChanged = StateEffect.define<boolean>();
const focused = StateField.define<boolean>({
  create: () => false,
  update: (v, tr) => tr.effects.reduce((f, e) => (e.is(focusChanged) ? e.value : f), v),
});

/** The note's folder, for its relative links and images. */
export const noteFolder = StateField.define<string>({ create: () => "", update: (v) => v });

/** Where the note's drive images are read from. */
const imageSource = StateField.define<ImageSource | null>({ create: () => null, update: (v) => v });

const CODE = new Set(["InlineCode", "FencedCode", "CodeBlock", "CodeText", "CodeMark", "CodeInfo", "HTMLBlock", "Comment"]);

class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
  ) {
    super();
  }
  eq(o: MathWidget) {
    return o.tex === this.tex && o.display === this.display;
  }
  toDOM(view: EditorView) {
    const el = document.createElement(this.display ? "div" : "span");
    el.className = this.display ? "cm-md-math cm-md-mathBlock" : "cm-md-math";
    // Errors show in red where the math is, instead of throwing.
    el.innerHTML = katex.renderToString(this.tex, { displayMode: this.display, throwOnError: false, errorColor: "var(--danger)", strict: false, trust: false });
    editOnClick(el, view, this.display ? 2 : 1);
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

/** Where a note's images come from: a drive path to something an <img> can show (the host's; maybe later). */
export type ImageSource = (path: string) => string | Promise<string>;

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
    editOnClick(img, view, 2);
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
      const marker = view.state.sliceDoc(at, at + 3);
      view.dispatch({ changes: { from: at, to: at + 3, insert: toggledTask(marker) } });
    });
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

const tables = new Marked({ gfm: true });

/** A GFM table, drawn as one (its cells' inline Markdown too). */
class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }
  eq(o: TableWidget) {
    return o.source === this.source;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "cm-md-tableView";
    el.innerHTML = DOMPurify.sanitize(tables.parse(this.source) as string);
    editOnClick(el, view, 2);
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

/** Clicking rendered math or an image puts the cursor into what's written there. */
function editOnClick(el: HTMLElement, view: EditorView, offset: number) {
  el.addEventListener("mousedown", (e) => {
    if (view.state.readOnly) return;
    e.preventDefault();
    const at = view.posAtDOM(el);
    view.dispatch({ selection: { anchor: Math.min(at + offset, view.state.doc.length) } });
    view.focus();
  });
}

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });
const line = (cls: string) => Decoration.line({ class: cls });

function build(state: EditorState): DecorationSet {
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
  const tree = syntaxTree(state);
  const text = state.doc.toString();
  const folder = state.field(noteFolder);

  // Math first: what's between its dollars isn't Markdown (a_1 … b_2 isn't emphasis).
  const inCode = (pos: number) => {
    for (let n: { name: string; parent: unknown } | null = tree.resolveInner(pos, 1); n; n = n.parent as typeof n) if (CODE.has(n.name)) return true;
    return false;
  };
  const math = mathRanges(text, inCode);
  const inMath = (from: number, to: number) => math.some((m) => m.from < to && m.to > from);
  for (const m of math) {
    if (touches(m.from, m.to)) {
      out.push(Decoration.mark({ class: "cm-md-mathSource" }).range(m.from, m.to));
      continue;
    }
    const whole = m.block && lineOf(m.from).from === m.from && lineOf(m.to).to === m.to;
    out.push(Decoration.replace({ widget: new MathWidget(m.tex, m.block), block: whole }).range(m.from, m.to));
  }

  /** Hides a mark, and the space after it (a heading's "# ", a quote's "> "). */
  const hideMark = (from: number, to: number, withSpace = false) => {
    if (withSpace && text[to] === " ") to++;
    if (to > from) out.push(hide.range(from, to));
  };
  let replacedTo = -1;
  tree.iterate({
    enter: (node) => {
      const { name, from, to } = node;
      if (from < replacedTo) return false;
      if (inMath(from, to) && !["Document", "Paragraph", "ListItem", "BulletList", "OrderedList", "Blockquote"].includes(name)) return false;
      const heading = /^ATXHeading(\d)$/.exec(name);
      if (heading) {
        out.push(line(`cm-md-h cm-md-h${heading[1]}`).range(lineOf(from).from));
        if (!lineTouched(from)) {
          const mark = node.node.getChild("HeaderMark");
          if (mark) hideMark(mark.from, mark.to, true);
        }
        return;
      }
      switch (name) {
        case "Emphasis":
        case "StrongEmphasis":
        case "Strikethrough":
        case "InlineCode": {
          if (touches(from, to)) return;
          const mark = name === "InlineCode" ? "CodeMark" : name === "Strikethrough" ? "StrikethroughMark" : "EmphasisMark";
          for (const m of node.node.getChildren(mark)) hideMark(m.from, m.to);
          return name === "InlineCode" ? false : undefined;
        }
        case "Link": {
          const url = node.node.getChild("URL");
          const href = url ? state.sliceDoc(url.from, url.to) : "";
          out.push(Decoration.mark({ class: "cm-md-link", attributes: { "data-href": href, title: href ? `${href} (⌘-click to open)` : "" } }).range(from, to));
          if (touches(from, to)) return;
          for (const m of node.node.getChildren("LinkMark")) hideMark(m.from, m.to);
          if (url) hideMark(url.from, url.to);
          const title = node.node.getChild("LinkTitle");
          if (title) hideMark(title.from, title.to);
          // The space between the URL and its title, inside the brackets, goes with them.
          const marks = node.node.getChildren("LinkMark");
          const open = marks[1];
          const close = marks[marks.length - 1];
          if (open && close && close.from > open.to) hideMark(open.to, close.from);
          return false;
        }
        case "URL": {
          // A bare web address (GFM autolink).
          if (node.node.parent?.name === "Link" || node.node.parent?.name === "Image") return;
          const href = state.sliceDoc(from, to);
          out.push(Decoration.mark({ class: "cm-md-link", attributes: { "data-href": href, title: `${href} (⌘-click to open)` } }).range(from, to));
          return;
        }
        case "Image": {
          if (touches(from, to)) return;
          const url = node.node.getChild("URL");
          const src = url ? state.sliceDoc(url.from, url.to).replace(/^<|>$/g, "") : "";
          const marks = node.node.getChildren("LinkMark");
          const alt = marks.length >= 2 ? state.sliceDoc(marks[0]!.to, marks[1]!.from) : "";
          const path = resolveRelative(folder, src);
          out.push(Decoration.replace({ widget: path === null ? new ImageWidget(src, alt, null) : new ImageWidget(path, alt, state.field(imageSource)) }).range(from, to));
          replacedTo = to;
          return false;
        }
        case "ListMark": {
          if (lineTouched(from)) return;
          const task = node.node.nextSibling?.name === "Task";
          const mark = state.sliceDoc(from, to);
          if (task) hideMark(from, to, true);
          else if (/^[-*+]$/.test(mark)) out.push(bullet.range(from, to));
          return;
        }
        case "TaskMarker": {
          if (touches(from, to)) return;
          out.push(Decoration.replace({ widget: new CheckboxWidget(/\[[xX]\]/.test(state.sliceDoc(from, to))) }).range(from, to));
          if (/\[[xX]\]/.test(state.sliceDoc(from, to))) {
            const l = lineOf(from);
            if (to < l.to) out.push(Decoration.mark({ class: "cm-md-done" }).range(to, l.to));
          }
          return;
        }
        case "Blockquote": {
          for (let pos = from; pos <= to; ) {
            const l = lineOf(pos);
            out.push(line("cm-md-quote").range(l.from));
            pos = l.to + 1;
          }
          return;
        }
        case "QuoteMark": {
          if (!lineTouched(from)) hideMark(from, to, true);
          return;
        }
        case "HorizontalRule": {
          if (!lineTouched(from)) out.push(rule.range(from, to));
          return;
        }
        case "FencedCode":
        case "CodeBlock": {
          const first = lineOf(from).number;
          const last = lastLineOf(from, to).number;
          const editing = touches(from, to);
          for (let n = first; n <= last; n++) {
            const l = state.doc.line(n);
            const fence = name === "FencedCode" && (n === first || n === last);
            out.push(line(`cm-md-code${n === first ? " cm-md-codeFirst" : ""}${n === last ? " cm-md-codeLast" : ""}${fence && !editing ? " cm-md-fence" : ""}`).range(l.from));
          }
          return false;
        }
        case "Table": {
          const first = lineOf(from);
          const last = lastLineOf(from, to);
          if (!touches(first.from, last.to)) {
            out.push(Decoration.replace({ widget: new TableWidget(state.sliceDoc(first.from, last.to)), block: true }).range(first.from, last.to));
            replacedTo = last.to;
            return false;
          }
          for (let n = first.number; n <= last.number; n++) out.push(line(n === first.number ? "cm-md-table cm-md-tableHead" : "cm-md-table").range(state.doc.line(n).from));
          return;
        }
      }
    },
  });
  return Decoration.set(out, true);
}

const preview = StateField.define<DecorationSet>({
  create: build,
  update(deco, tr) {
    const treeChanged = syntaxTree(tr.state) !== syntaxTree(tr.startState);
    if (tr.docChanged || tr.selection || treeChanged || tr.effects.some((e) => e.is(focusChanged))) return build(tr.state);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** ⌘/Ctrl-click a link to open it ([open] gets its address, and the drive file it points to, if one). */
function linkClicks(open: OpenLink) {
  return EditorView.domEventHandlers({
    mousedown(e, view) {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-href]");
      if (!el || !(e.metaKey || e.ctrlKey || view.state.readOnly)) return false;
      const href = el.dataset.href ?? "";
      if (!href) return false;
      e.preventDefault();
      const path = resolveRelative(view.state.field(noteFolder), href.replace(/^<|>$/g, ""));
      open(href, path);
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

/** Opens a link: a web address, or (with [path]) a drive file. */
export type OpenLink = (href: string, path: string | null) => void;

/** The live preview, for a note in [folder]; its drive images come from [images]. */
export const livePreview = (folder: string, open: OpenLink, images: ImageSource) => [
  noteFolder.init(() => folder),
  imageSource.init(() => images),
  focused,
  preview,
  linkClicks(open),
];
