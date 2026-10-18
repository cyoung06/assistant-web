// References are Markdown links, `[title](url)`. What a link points to follows from its URL, so
// text written anywhere keeps its meaning.

import type { components } from "../api/schema";

export type RefKind = components["schemas"]["Ref"]["kind"];
export type Ref = components["schemas"]["Ref"];

const APP = /#(task|tasks\/project|event|mail)\/[^\s)#?]+/;

export function kindOf(url: string): RefKind {
  const app = APP.exec(url);
  if (app) return ({ task: "task", "tasks/project": "project", event: "event", mail: "mail" } as const)[app[1] as "task"];
  if (/plms\.postech\.ac\.kr/.test(url)) {
    if (/\/mod\/(ubfile|resource)\//.test(url)) return "plms_file";
    if (/\/mod\/ubboard\/article\.php/.test(url)) return "plms_notice";
    if (/\/mod\/assign\//.test(url)) return "plms_assignment";
    if (/\/course\/view\.php/.test(url)) return "plms_course";
    return "plms_activity";
  }
  return "link";
}

/** A link to one of the app's own pages (opens in place rather than in a new tab). */
export const isAppLink = (url: string) => APP.test(url) && (url.startsWith(location.origin) || url.startsWith("#"));

export const KIND_LABEL: Record<RefKind, string> = {
  task: "Task",
  project: "Project",
  event: "Event",
  mail: "Mail",
  plms_course: "PLMS course",
  plms_file: "PLMS file",
  plms_notice: "PLMS post",
  plms_assignment: "PLMS assignment",
  plms_activity: "PLMS",
  link: "Link",
};

/** `[text](url)`; the text may contain escaped brackets, the URL balanced parentheses. */
const LINK = /\[((?:\\.|[^\]\\])*)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;
const unescape = (text: string) => text.replace(/\\([[\]])/g, "$1");

/** `[text](url)` → `text`. */
export const plainText = (markdown: string) => markdown.replace(LINK, (_, text: string) => unescape(text));

/** Text and references in order, for one-line places (titles in lists). */
export function splitRefs(markdown: string): ({ text: string } | { ref: string; url: string })[] {
  const out: ({ text: string } | { ref: string; url: string })[] = [];
  let last = 0;
  for (const m of markdown.matchAll(LINK)) {
    if (m.index! > last) out.push({ text: markdown.slice(last, m.index) });
    out.push({ ref: unescape(m[1]!), url: m[2]! });
    last = m.index! + m[0].length;
  }
  if (last < markdown.length) out.push({ text: markdown.slice(last) });
  return out;
}

/** The Markdown for a reference; brackets in the title are escaped so the link stays intact. */
export const refMarkdown = (title: string, url: string) => `[${title.replace(/([[\]])/g, "\\$1")}](${url.replace(/\)/g, "%29").replace(/ /g, "%20")})`;
