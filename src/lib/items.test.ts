import { describe, expect, it } from "vitest";
import type { Task } from "../api/client";
import { dueKey, sortTasks } from "./items";

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  calendarId: "c",
  calendarName: "Inbox",
  title: id,
  notes: "",
  done: false,
  categories: [],
  overdue: false,
  subtasks: 0,
  subtasksDone: 0,
  minutesSpent: 0,
  minutesPlanned: 0,
  ...over,
});

describe("dueKey", () => {
  it("puts a date-only deadline after timed ones on the same day", () => {
    expect(dueKey(task("a", { due: { date: "2026-10-23" } }))! > dueKey(task("b", { due: { date: "2026-10-23", time: "23:59:00" } }))!).toBe(true);
  });
});

describe("sortTasks", () => {
  it("keeps tasks without a value last in both directions", () => {
    const tasks = [task("none"), task("late", { due: { date: "2026-10-25" } }), task("soon", { due: { date: "2026-10-19" } })];
    expect(sortTasks(tasks, "due", true).map((t) => t.id)).toEqual(["soon", "late", "none"]);
    expect(sortTasks(tasks, "due", false).map((t) => t.id)).toEqual(["late", "soon", "none"]);
  });
});
