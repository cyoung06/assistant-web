import { describe, expect, it } from "vitest";
import { scheduleLine } from "./ProjectSchedule";

const base = { eventId: "e", title: "확률및통계", interval: 1, weekdays: [] as ("TUESDAY" | "THURSDAY" | "FRIDAY")[] };

describe("scheduleLine", () => {
  it("sums up a repeating event in one line", () => {
    expect(scheduleLine({ ...base, freq: "weekly", weekdays: ["TUESDAY", "THURSDAY"], start: "12:30:00", end: "13:45:00" })).toBe("Tue · Thu 12:30–13:45");
    expect(scheduleLine({ ...base, freq: "weekly", interval: 2, weekdays: ["FRIDAY"] })).toBe("Every 2 weeks · Fri");
    expect(scheduleLine({ ...base, freq: "daily", start: "09:00:00", end: "10:00:00" })).toBe("Daily 09:00–10:00");
  });
});
