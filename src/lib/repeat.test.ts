import { describe, expect, it } from "vitest";
import { describeRepeat, touchesSeries, weekdayOf } from "./repeat";

describe("describeRepeat", () => {
  it("names the days, interval and end", () => {
    expect(describeRepeat({ freq: "weekly", weekdays: ["THURSDAY", "TUESDAY"], until: "2026-12-17" }, "2026-10-20")).toBe(
      "Weekly on Tue, Thu until Thu, Dec 17",
    );
    expect(describeRepeat({ freq: "weekly", interval: 2 }, "2026-10-22")).toBe("Every 2 weeks on Thu");
    expect(describeRepeat({ freq: "daily", count: 10 }, "2026-10-19")).toBe("Daily, 10 times");
    expect(describeRepeat({ freq: "monthly" }, "2026-10-31")).toBe("Monthly on day 31");
  });
});

describe("helpers", () => {
  it("finds the weekday of a local date", () => {
    expect(weekdayOf("2026-10-18")).toBe("SUNDAY");
  });

  it("knows which edits can reach other occurrences", () => {
    expect(touchesSeries({ title: "x" })).toBe(true);
    expect(touchesSeries({ notes: "x", doneAt: null })).toBe(false);
  });
});
