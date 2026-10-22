import { describe, expect, it } from "vitest";
import { parsePages } from "./ExportDialog";

describe("parsePages", () => {
  it("reads pages and ranges as indices from 0", () => {
    expect(parsePages("1-3, 5")).toEqual([0, 1, 2, 4]);
    expect(parsePages(" 2 4-4 ")).toEqual([1, 3]);
  });
  it("takes nothing as every page", () => {
    expect(parsePages("  ")).toBeUndefined();
  });
  it("refuses what isn't pages", () => {
    expect(() => parsePages("0")).toThrow();
    expect(() => parsePages("3-1")).toThrow();
    expect(() => parsePages("a")).toThrow();
  });
});
