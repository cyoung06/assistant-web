import { describe, expect, it } from "vitest";
import type { Item } from "../api/client";
import { nextKey, sortItems } from "./items";

// Runs with TZ=Asia/Seoul (see the npm test script).

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id,
  title: id,
  notes: "",
  tagIds: [],
  source: { type: "manual" },
  version: 1,
  createdAt: "2026-10-18T00:00:00Z",
  updatedAt: "2026-10-18T00:00:00Z",
  derived: { overdue: false, displayTitle: id, timeSpentMinutes: 0, timePlannedMinutes: 0, subItems: 0, subItemsDone: 0 },
  ...over,
});

describe("nextKey", () => {
  it("takes the earlier of deadline and scheduled time, in local time", () => {
    const i = item("a", {
      by: { date: "2026-10-23", time: "23:59:00" },
      at: { allDay: false, start: "2026-10-19T05:00:00Z", end: "2026-10-19T07:00:00Z" },
    });
    expect(nextKey(i)).toBe("2026-10-19T14:00");
  });

  it("puts a date-only deadline after timed ones on the same day", () => {
    expect(nextKey(item("a", { by: { date: "2026-10-23" } }))! > nextKey(item("b", { by: { date: "2026-10-23", time: "23:59:00" } }))!).toBe(true);
  });
});

describe("sortItems", () => {
  it("keeps items without a value last in both directions", () => {
    const items = [item("none"), item("late", { by: { date: "2026-10-25" } }), item("soon", { by: { date: "2026-10-19" } })];
    expect(sortItems(items, "due", true).map((i) => i.id)).toEqual(["soon", "late", "none"]);
    expect(sortItems(items, "due", false).map((i) => i.id)).toEqual(["late", "soon", "none"]);
  });
});
