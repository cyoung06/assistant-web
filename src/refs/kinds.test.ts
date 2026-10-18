import { describe, expect, it } from "vitest";
import { kindOf, plainText, refMarkdown, splitRefs } from "./kinds";

describe("references", () => {
  it("knows what a link points to", () => {
    expect(kindOf("https://assistant.example/#task/0b3b")).toBe("task");
    expect(kindOf("https://assistant.example/#tasks/project/9")).toBe("project");
    expect(kindOf("https://assistant.example/#mail/lab%40postech.ac.kr")).toBe("mail");
    expect(kindOf("https://plms.postech.ac.kr/mod/ubfile/view.php?id=1")).toBe("plms_file");
    expect(kindOf("https://plms.postech.ac.kr/mod/ubboard/article.php?id=1&bwid=2")).toBe("plms_notice");
    expect(kindOf("https://plms.postech.ac.kr/mod/assign/view.php?id=7")).toBe("plms_assignment");
    expect(kindOf("https://example.com")).toBe("link");
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
