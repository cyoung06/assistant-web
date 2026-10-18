import { describe, expect, it } from "vitest";
import type { Task } from "../api/client";
import { closedGroup, dueBucket, dueChoices, dueText, groupTasks, sortTasks, weekEnd } from "./model";

// Sunday 2026-10-18; runs with TZ=Asia/Seoul.
const today = "2026-10-18";

let n = 0;
const task = (over: Partial<Task>): Task => ({
  id: `t${++n}`, number: n, title: `task ${n}`, description: "", status: "todo", priority: "none", labelIds: [], relations: [],
  blocked: false, overdue: false, subtasks: 0, subtasksDone: 0, createdAt: "", updatedAt: "", version: 1, ...over,
});

describe("due dates", () => {
  it("buckets by overdue, today, this week (to Saturday), later and none", () => {
    expect(weekEnd(today)).toBe("2026-10-24");
    expect(dueBucket(task({ due: { date: "2026-10-17" }, overdue: true }), today)).toBe("overdue");
    expect(dueBucket(task({ due: { date: "2026-10-18", time: "23:59:00" } }), today)).toBe("today");
    expect(dueBucket(task({ due: { date: "2026-10-24" } }), today)).toBe("week");
    expect(dueBucket(task({ due: { date: "2026-10-25" } }), today)).toBe("later");
    expect(dueBucket(task({}), today)).toBe("none");
  });

  it("names nearby days", () => {
    expect(dueText({ date: "2026-10-18", time: "19:00:00" }, today)).toBe("Today 19:00");
    expect(dueText({ date: "2026-10-19" }, today)).toBe("Tomorrow");
    expect(dueText({ date: "2026-10-23" }, today)).toBe("Fri");
    expect(dueText({ date: "2026-11-02" }, today)).toBe("Nov 2");
  });

  it("offers quick dates without repeating a day", () => {
    expect(dueChoices(today)).toEqual([
      { label: "Today", date: "2026-10-18" },
      { label: "Tomorrow", date: "2026-10-19" },
      { label: "End of week", date: "2026-10-23" },
    ]);
    expect(dueChoices("2026-10-20").map((c) => c.label)).toEqual(["Today", "Tomorrow", "End of week", "Next week"]);
  });
});

describe("grouping", () => {
  it("leaves closed tasks to the closed group and empty groups out", () => {
    const tasks = [task({ due: { date: "2026-10-18" } }), task({ status: "done", closedAt: "2026-10-17T00:00:00Z" }), task({ status: "canceled", closedAt: "2026-10-18T00:00:00Z" })];
    const groups = groupTasks(tasks, "due", "priority", { today, projects: [], labels: [] });
    expect(groups.map((g) => g.key)).toEqual(["today"]);
    expect(groups[0]!.defaults).toEqual({ due: { date: today } });
    expect(closedGroup(tasks).tasks.map((t) => t.status)).toEqual(["canceled", "done"]);
  });

  it("puts a task in each of its labels' groups", () => {
    const t = task({ labelIds: ["a", "b"] });
    const labels = [{ id: "a", name: "assignment", color: "#000000" }, { id: "b", name: "quiz", color: "#000000" }];
    expect(groupTasks([t, task({})], "label", "priority", { today, projects: [], labels }).map((g) => [g.key, g.tasks.length])).toEqual([["a", 1], ["b", 1], ["none", 1]]);
  });

  it("orders by priority, then due date", () => {
    const low = task({ priority: "low", due: { date: "2026-10-19" } });
    const urgent = task({ priority: "urgent" });
    const none = task({ due: { date: "2026-10-18" } });
    const lowEarlier = task({ priority: "low", due: { date: "2026-10-18", time: "09:00:00" } });
    expect(sortTasks([none, low, urgent, lowEarlier], "priority")).toEqual([urgent, lowEarlier, low, none]);
    expect(sortTasks([none, low, urgent, lowEarlier], "due")[0]).toBe(lowEarlier);
  });
});
