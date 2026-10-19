import DOMPurify from "dompurify";
import { Marked } from "marked";
import { useMemo } from "react";
import { isAppLink, kindOf, splitRefs } from "./kinds";
import "./refs.css";

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Links render as reference chips: an icon for what they point to; outside links open in a new tab. */
const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      const target = isAppLink(href) || href.startsWith("plms:") ? "" : ` target="_blank" rel="noreferrer"`;
      return `<a class="ref" data-kind="${kindOf(href)}" href="${escapeAttr(href)}"${target}>${text}</a>`;
    },
  },
});

function render(markdown: string, inline: boolean): string {
  const html = inline ? (marked.parseInline(markdown) as string) : (marked.parse(markdown) as string);
  // DOMPurify's default list of link schemes, plus mid: (mail) and plms:.
  return DOMPurify.sanitize(html, { ADD_ATTR: ["target"], ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|mid|plms):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i });
}

/** Markdown text (descriptions, notes) with references as chips. */
export function Markdown({ text, className, inline }: { text: string; className?: string; inline?: boolean }) {
  const html = useMemo(() => render(text, !!inline), [text, inline]);
  return inline ? (
    <span className={`markdown ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <div className={`markdown ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/** A one-line title with its references shown as (non-clickable) chips, for rows that open on click. */
export function RefText({ text }: { text: string }) {
  return (
    <>
      {splitRefs(text).map((part, i) =>
        "text" in part ? (
          <span key={i}>{part.text}</span>
        ) : (
          <span key={i} className="ref" data-kind={kindOf(part.url)}>
            {part.ref}
          </span>
        ),
      )}
    </>
  );
}
