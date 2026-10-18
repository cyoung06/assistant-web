import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

type Schemas = components["schemas"];
export type Item = Schemas["ItemResponse"];
export type Tag = Schemas["TagResponse"];
export type By = Schemas["By"];
export type At = Schemas["At"];
export type CalendarEntry = Schemas["CalendarEntry"];
export type CreateItem = Schemas["CreateItemRequest"];
export type QuickAddResult = Schemas["QuickAddResult"];

/** JSON merge patch for an item: absent fields stay, null clears. */
export type ItemPatch = Partial<{
  title: string;
  notes: string;
  by: By | null;
  at: At | null;
  parentId: string | null;
  mainTagId: string | null;
  tagIds: string[];
  doneAt: string | null;
}>;

/** An error response from the API (RFC 9457 problem details). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly currentVersion?: number,
  ) {
    super(message);
  }
}

export const api = createClient<paths>({ baseUrl: "" });

interface Problem {
  title?: string;
  detail?: string;
  currentVersion?: number;
}

/** Returns the data of an openapi-fetch result, or throws an [ApiError]. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok) return result.data as T;
  const problem = (result.error ?? {}) as Problem;
  throw new ApiError(
    result.response.status,
    problem.title ?? "error",
    problem.detail ?? `Request failed (${result.response.status})`,
    problem.currentVersion,
  );
}
