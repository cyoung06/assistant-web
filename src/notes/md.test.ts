import { describe, expect, it } from "vitest";
import { applyTemplate, mathRanges, pastedName, relativeTo, resolveRelative, toggledTask, toggleWrap } from "./md";

describe("mathRanges", () => {
  it("finds inline and display math", () => {
    const text = "Euler: $e^{i\\pi}+1=0$.\n$$\n\\int_0^1 x\\,dx\n$$\nend";
    const r = mathRanges(text);
    expect(r.map((m) => [m.tex, m.block])).toEqual([
      ["e^{i\\pi}+1=0", false],
      ["\\int_0^1 x\\,dx", true],
    ]);
    expect(text.slice(r[0]!.from, r[0]!.to)).toBe("$e^{i\\pi}+1=0$");
    expect(text.slice(r[1]!.from, r[1]!.to)).toBe("$$\n\\int_0^1 x\\,dx\n$$");
  });

  it("leaves money, escaped dollars and unclosed math alone", () => {
    expect(mathRanges("It costs $5 and $10 today")).toEqual([]);
    expect(mathRanges("a \\$x\\$ b")).toEqual([]);
    expect(mathRanges("$ x $ and $y")).toEqual([]);
    expect(mathRanges("$$ never closed")).toEqual([]);
  });

  it("stays on one line for inline math", () => {
    expect(mathRanges("$a\nb$")).toEqual([]);
  });

  it("skips what [skip] says is code", () => {
    const text = "`$a$` and $b$";
    expect(mathRanges(text, (p) => p < 5).map((m) => m.tex)).toEqual(["b"]);
  });
});

describe("paths", () => {
  it("resolves links relative to the note's folder", () => {
    expect(resolveRelative("Projects/A/Notes/", "img/x%20y.png")).toBe("Projects/A/Notes/img/x y.png");
    expect(resolveRelative("Projects/A/Notes/", "../Course files/L1.pdf#page=2")).toBe("Projects/A/Course files/L1.pdf");
    expect(resolveRelative("Projects/A/", "./a.md")).toBe("Projects/A/a.md");
    expect(resolveRelative("Projects/A/", "/Projects/B/b.md")).toBe("Projects/B/b.md");
  });

  it("leaves web addresses and anchors alone", () => {
    expect(resolveRelative("Projects/A/", "https://example.com")).toBeNull();
    expect(resolveRelative("Projects/A/", "mailto:x@y.z")).toBeNull();
    expect(resolveRelative("Projects/A/", "#section")).toBeNull();
  });

  it("writes links relative to the note, and they resolve back", () => {
    expect(relativeTo("Projects/A/", "Projects/A/attachments/Pasted image 1.png")).toBe("attachments/Pasted%20image%201.png");
    expect(relativeTo("Projects/A/Notes/", "Projects/A/Course files/L1.pdf")).toBe("../Course%20files/L1.pdf");
    expect(resolveRelative("Projects/A/Notes/", relativeTo("Projects/A/Notes/", "Projects/A/Course files/L1.pdf"))).toBe("Projects/A/Course files/L1.pdf");
  });
});

describe("editing", () => {
  it("ticks and unticks tasks", () => {
    expect(toggledTask("[ ]")).toBe("[x]");
    expect(toggledTask("[x]")).toBe("[ ]");
    expect(toggledTask("[X]")).toBe("[ ]");
  });

  it("wraps and unwraps a selection", () => {
    expect(toggleWrap("a word b", 2, 6, "**")).toEqual({ changes: [{ from: 2, to: 2, insert: "**" }, { from: 6, to: 6, insert: "**" }], anchor: 4, head: 8 });
    // Selected inside the marks, or the marks selected too: unwrapped either way.
    expect(toggleWrap("a **word** b", 4, 8, "**").changes).toEqual([{ from: 2, to: 4, insert: "" }, { from: 8, to: 10, insert: "" }]);
    expect(toggleWrap("a **word** b", 2, 10, "**").changes).toEqual([{ from: 2, to: 4, insert: "" }, { from: 8, to: 10, insert: "" }]);
  });

  it("places the cursor where a template says", () => {
    expect(applyTemplate("## |")).toEqual({ text: "## ", cursor: 3 });
    expect(applyTemplate("$$\n|\n$$")).toEqual({ text: "$$\n\n$$", cursor: 3 });
    expect(applyTemplate("| Column | Column |\n| --- | --- |").cursor).toBe(2);
  });

  it("names pasted images", () => {
    const at = new Date(2026, 9, 20, 3, 4, 5);
    expect(pastedName({ name: "image.png", type: "image/png" }, at)).toBe("Pasted image 20261020030405.png");
    expect(pastedName({ name: "", type: "image/jpeg" }, at)).toBe("Pasted image 20261020030405.jpg");
    expect(pastedName({ name: "diagram.png", type: "image/png" })).toBe("diagram.png");
  });
});
