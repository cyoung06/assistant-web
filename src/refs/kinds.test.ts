import { describe, expect, it, vi } from "vitest";
import { appRoute, kindOf, plainText, plmsWebUrl, refMarkdown, splitRefs } from "./kinds";

describe("references", () => {
  it("knows what a link points to", () => {
    expect(kindOf("https://assistant.example/task/0b3b")).toBe("task");
    expect(kindOf("https://assistant.example/#task/0b3b")).toBe("task");
    expect(kindOf("mid:lab@postech.ac.kr")).toBe("mail");
    expect(kindOf("plms:mod/ubfile/1")).toBe("plms_file");
    expect(kindOf("plms:post/1/2")).toBe("plms_notice");
    expect(kindOf("plms:mod/assign/7")).toBe("plms_assignment");
    expect(kindOf("plms:course/3")).toBe("plms_course");
    expect(kindOf("https://example.com/task/1")).toBe("task");
    expect(kindOf("https://assistant.example/#tasks/project/9")).toBe("project");
    expect(kindOf("https://assistant.example/#mail/lab%40postech.ac.kr")).toBe("mail");
    expect(kindOf("https://plms.postech.ac.kr/mod/ubfile/view.php?id=1")).toBe("plms_file");
    expect(kindOf("https://plms.postech.ac.kr/mod/ubboard/article.php?id=1&bwid=2")).toBe("plms_notice");
    expect(kindOf("https://plms.postech.ac.kr/mod/assign/view.php?id=7")).toBe("plms_assignment");
    expect(kindOf("https://github.com/PLUS-POSTECH/tasks/pull/42")).toBe("github_pr");
    expect(kindOf("https://github.com/PLUS-POSTECH/tasks/issues/7")).toBe("github_issue");
    expect(kindOf("https://github.com/PLUS-POSTECH/tasks")).toBe("github_repo");
    expect(kindOf("https://example.com")).toBe("link");
  });

  it("opens our pages and mail in place, PLMS on its site", () => {
    vi.stubGlobal("location", { origin: "https://assistant.example" });
    expect(appRoute("https://assistant.example/task/0b3b")).toBe("task/0b3b");
    expect(appRoute("https://assistant.example/#task/0b3b")).toBe("task/0b3b");
    expect(appRoute("mid:lab@postech.ac.kr")).toBe("mail/lab%40postech.ac.kr");
    expect(appRoute("https://example.com/task/1")).toBeNull();
    expect(plmsWebUrl("plms:post/55/9")).toBe("https://plms.postech.ac.kr/mod/ubboard/article.php?id=55&bwid=9");
    expect(plmsWebUrl("plms:mod/ubfile/101")).toBe("https://plms.postech.ac.kr/mod/ubfile/view.php?id=101");
    vi.unstubAllGlobals();
  });

  it("turns links into text and parts", () => {
    const md = "Submit [HW6](https://plms.postech.ac.kr/mod/assign/view.php?id=7) by [Fri](https://x.test/a_(b))";
    expect(plainText(md)).toBe("Submit HW6 by Fri");
    expect(splitRefs(md)).toEqual([
      { text: "Submit " },
      { ref: "HW6", url: "https://plms.postech.ac.kr/mod/assign/view.php?id=7" },
      { text: " by " },
      { ref: "Fri", url: "https://x.test/a_(b)" },
    ]);
  });

  it("writes links that survive brackets and spaces", () => {
    const md = refMarkdown("[Lab 3] BombLab", "https://x.test/a b");
    expect(md).toBe("[\\[Lab 3\\] BombLab](https://x.test/a%20b)");
    expect(plainText(`Do ${md} now`)).toBe("Do [Lab 3] BombLab now");
    expect(splitRefs(md)).toEqual([{ ref: "[Lab 3] BombLab", url: "https://x.test/a%20b" }]);
  });
});
