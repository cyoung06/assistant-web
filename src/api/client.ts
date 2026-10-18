import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

type Schemas = components["schemas"];
export type Task = Schemas["TaskResponse"];
export type TaskStatus = Task["status"];
export type Priority = Task["priority"];
export type Due = Schemas["DueDto"];
export type Relation = Schemas["RelationResponse"];
export type RelationKind = Relation["kind"];
export type Project = Schemas["ProjectResponse"];
export type ProjectState = Project["state"];
export type Label = Schemas["LabelResponse"];
export type CreateTask = Schemas["CreateTaskRequest"];
export type Calendar = Schemas["CalendarResponse"];
export type EventOccurrence = Schemas["EventOccurrence"];
export type CalendarEvent = Schemas["EventResponse"];
export type CreateEvent = Schemas["CreateEventRequest"];
export type Repeat = Schemas["RepeatDto"];
export type SourceStatus = Schemas["SourceStatus"];

/** JSON merge patch for a task: absent fields stay, null clears. */
export type TaskPatch = Partial<{
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  due: Due | null;
  projectId: string | null;
  labelIds: string[];
  parentId: string | null;
}>;

/** JSON merge patch for an event. */
export type EventPatch = Partial<{
  title: string;
  notes: string;
  start: string;
  end: string;
  startDate: string;
  endDate: string;
  repeat: Repeat | null;
}>;

/** An error response from the API (RFC 9457 problem details). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const api = createClient<paths>({ baseUrl: "" });

interface Problem {
  title?: string;
  detail?: string;
}

/** Returns the data of an openapi-fetch result, or throws an [ApiError]. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok) return result.data as T;
  const problem = (result.error ?? {}) as Problem;
  throw new ApiError(result.response.status, problem.title ?? "error", problem.detail ?? `Request failed (${result.response.status})`);
}
