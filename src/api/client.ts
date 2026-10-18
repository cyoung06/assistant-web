import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

type Schemas = components["schemas"];
export type Task = Schemas["TaskResponse"];
export type Calendar = Schemas["CalendarResponse"];
export type AgendaEntry = Schemas["AgendaEntry"];
export type Due = Schemas["DueDto"];
export type CreateTask = Schemas["CreateTaskRequest"];
export type CreateEvent = Schemas["CreateEventRequest"];
export type QuickAddDraft = Schemas["QuickAddDraft"];
export type QuickAddResult = Schemas["QuickAddResult"];
export type SourceStatus = Schemas["SourceStatus"];

/** JSON merge patch for a task: absent fields stay, null clears. */
export type TaskPatch = Partial<{
  title: string;
  notes: string;
  due: Due | null;
  done: boolean;
  categories: string[];
  parentId: string | null;
  calendarId: string;
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
