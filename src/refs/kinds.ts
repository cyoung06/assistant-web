// References are Markdown links, `[title](url)`. What a link points to follows from its URL, so
// text written anywhere keeps its meaning.

import type { components } from "../api/schema";

export type RefKind = components["schemas"]["Ref"]["kind"];
export type Ref = components["schemas"]["Ref"];

// The app's own things are its pages (`<origin>/task/<id>`; older text has `#task/<id>`). Mail
// isn't ours: `mid:<Message-ID>` (RFC 2392). PLMS things are `plms:course/…`, `plms:mod/<module>/…`
// or `plms:post/…`, independent of the site's URLs.
const APP = /[/#](task|tasks\/project|event|mail)\/[^\s)#?]+/;

export const PLMS_BASE = "https://plms.postech.ac.kr";

export function kindOf(url: string): RefKind {
  if (url.startsWith("mid:")) return "mail";
  if (url.startsWith("plms:")) {
    const [what, module] = url.slice(5).split("/");
    if (what === "course") return "plms_course";
    if (what === "post") return "plms_notice";
    if (module === "ubfile" || module === "resource") return "plms_file";
    if (module === "assign") return "plms_assignment";
    return "plms_activity";
  }
  const app = /^(https?:|#|\/)/.test(url) ? APP.exec(url) : null;
  if (app) return ({ task: "task", "tasks/project": "project", event: "event", mail: "mail" } as const)[app[1] as "task"];
  const gh = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\/(issues|pull)\/\d+)?/.exec(url);
  if (gh) return gh[1] === "pull" ? "github_pr" : gh[1] === "issues" ? "github_issue" : "github_repo";
  if (/plms\.postech\.ac\.kr/.test(url)) {
    if (/\/mod\/(ubfile|resource)\//.test(url)) return "plms_file";
    if (/\/mod\/ubboard\/article\.php/.test(url)) return "plms_notice";
    if (/\/mod\/assign\//.test(url)) return "plms_assignment";
    if (/\/course\/view\.php/.test(url)) return "plms_course";
    return "plms_activity";
  }
  return "link";
}

/** PLMS's page for a `plms:` link. */
export function plmsWebUrl(link: string): string | null {
  const [what, a, b] = link.slice(5).split("/");
  if (what === "course" && a) return `${PLMS_BASE}/course/view.php?id=${a}`;
  if (what === "mod" && a && b) return `${PLMS_BASE}/mod/${a}/view.php?id=${b}`;
  if (what === "post" && a && b) return `${PLMS_BASE}/mod/ubboard/article.php?id=${a}&bwid=${b}`;
  return null;
}

/**
 * Where in the app a link leads ("task/<id>", "mail/<id>", "tasks/active", …), or null when it
 * leaves the app. Mail opens in the app's reader.
 */
export function appRoute(url: string): string | null {
  if (url.startsWith("mid:")) return `mail/${encodeURIComponent(decodeURIComponent(url.slice(4)))}`;
  let path: string;
  if (url.startsWith("#")) path = url.slice(1);
  else if (url.startsWith("/")) path = url.slice(1);
  else if (url.startsWith(location.origin + "/")) path = url.slice(location.origin.length + 1);
  else return null;
  // Older links were fragments: "<origin>/#task/<id>".
  if (path.startsWith("#")) path = path.slice(1);
  return /^(tasks|task|event|mail|calendar|triage|files)(\/|$)/.test(path) ? path : null;
}

/** A link that opens in place (one of the app's pages, or mail) rather than in a new tab. */
export const isAppLink = (url: string) => appRoute(url) !== null;

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
  github_repo: "GitHub repo",
  github_issue: "GitHub issue",
  github_pr: "Pull request",
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
