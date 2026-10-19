/** Plain helpers for notes (Markdown with $…$ and $$…$$ math), kept apart from the editor so they can be tested. */

/** Math in a note: $inline$ or $$display$$ ([from], [to] include the dollars). */
export type MathRange = { from: number; to: number; tex: string; block: boolean };

/**
 * The math in [text], as Obsidian and Pandoc read it: $$…$$ (across lines too), and $…$ on one
 * line with no space just inside either dollar and no digit right after the closing one (so
 * "$5 and $10" is money). Escaped dollars (\$) and positions [skip] says are code don't count.
 */
export function mathRanges(text: string, skip: (pos: number) => boolean = () => false): MathRange[] {
  const out: MathRange[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c !== "$" || skip(i)) {
      i++;
      continue;
    }
    if (text[i + 1] === "$") {
      const end = text.indexOf("$$", i + 2);
      if (end < 0) break;
      const tex = text.slice(i + 2, end).trim();
      if (tex) out.push({ from: i, to: end + 2, tex, block: true });
      i = end + 2;
      continue;
    }
    if (/\s/.test(text[i + 1] ?? " ")) {
      i++;
      continue;
    }
    let close = -1;
    for (let j = i + 1; j < text.length && text[j] !== "\n"; j++) {
      if (text[j] === "\\") {
        j++;
        continue;
      }
      if (text[j] === "$") {
        if (!/\s/.test(text[j - 1] ?? " ") && !/\d/.test(text[j + 1] ?? "")) close = j;
        break;
      }
    }
    if (close < 0) {
      i++;
      continue;
    }
    out.push({ from: i, to: close + 1, tex: text.slice(i + 1, close), block: false });
    i = close + 1;
  }
  return out;
}

/** The drive path a link or image in a note in [folder] points at; null for web addresses and anchors. */
export function resolveRelative(folder: string, href: string): string | null {
  if (!href || /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) return null;
  let target = href.split("#")[0]!.split("?")[0]!;
  try {
    target = decodeURI(target);
  } catch {
    // Left as written.
  }
  const out: string[] = [];
  for (const p of ((target.startsWith("/") ? "" : folder) + target).split("/")) {
    if (p === "..") out.pop();
    else if (p !== "." && p !== "") out.push(p);
  }
  return out.join("/");
}

/** How a note in [folder] links to the drive file [path]: relative, each part encoded (spaces as %20). */
export function relativeTo(folder: string, path: string): string {
  const from = folder.split("/").filter(Boolean);
  const to = path.split("/").filter(Boolean);
  let same = 0;
  while (same < from.length && same < to.length - 1 && from[same] === to[same]) same++;
  return [...from.slice(same).map(() => ".."), ...to.slice(same).map((p) => encodeURIComponent(p).replace(/%2F/gi, "/"))].join("/");
}

/** A task's "[ ]" ticked, or a "[x]" unticked. */
export const toggledTask = (marker: string) => (/\[\s\]/.test(marker) ? "[x]" : "[ ]");

/** Wrapping a selection in [mark] (** for bold, say), or unwrapping it if it's wrapped already. */
export function toggleWrap(doc: string, from: number, to: number, mark: string) {
  const m = mark.length;
  const inside = to - from >= 2 * m && doc.slice(from, from + m) === mark && doc.slice(to - m, to) === mark;
  if (inside) return { changes: [{ from, to: from + m, insert: "" }, { from: to - m, to, insert: "" }], anchor: from, head: to - 2 * m };
  const around = from >= m && doc.slice(from - m, from) === mark && doc.slice(to, to + m) === mark;
  if (around) return { changes: [{ from: from - m, to: from, insert: "" }, { from: to, to: to + m, insert: "" }], anchor: from - m, head: to - m };
  return { changes: [{ from, to: from, insert: mark }, { from: to, to, insert: mark }], anchor: from + m, head: to + m };
}

/** What the "/" menu can insert: its name, other words it's found by, and the text ("|" marks where the cursor goes). */
export const SLASH_ITEMS: { label: string; keywords: string; template: string }[] = [
  { label: "Heading 1", keywords: "h1 title", template: "# |" },
  { label: "Heading 2", keywords: "h2", template: "## |" },
  { label: "Heading 3", keywords: "h3", template: "### |" },
  { label: "Bulleted list", keywords: "bullet ul", template: "- |" },
  { label: "Numbered list", keywords: "ordered ol", template: "1. |" },
  { label: "To-do", keywords: "task checkbox todo", template: "- [ ] |" },
  { label: "Quote", keywords: "blockquote", template: "> |" },
  { label: "Code block", keywords: "pre fence", template: "```\n|\n```" },
  { label: "Math block", keywords: "equation latex tex katex display", template: "$$\n|\n$$" },
  { label: "Inline math", keywords: "equation latex tex", template: "$|$" },
  { label: "Table", keywords: "grid", template: "| Column | Column |\n| --- | --- |\n| | |" },
  { label: "Divider", keywords: "rule hr line", template: "---\n|" },
];

/** A "/" menu template as text to insert and where the cursor goes in it. */
export function applyTemplate(template: string) {
  const at = template.indexOf("|");
  // A table's "|"s are its own: its cursor goes into the first header cell.
  if (template.startsWith("| ")) return { text: template, cursor: 2 };
  return at < 0 ? { text: template, cursor: template.length } : { text: template.slice(0, at) + template.slice(at + 1), cursor: at };
}

/** A name for a pasted image that came without one of its own ("image.png" from the clipboard). */
export function pastedName(file: { name: string; type: string }, now = new Date()) {
  if (file.name && !/^image\.(png|jpe?g|gif|webp)$/i.test(file.name)) return file.name.replace(/\//g, " ");
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const p = (n: number) => String(n).padStart(2, "0");
  return `Pasted image ${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}.${ext}`;
}
