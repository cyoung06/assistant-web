import { createContext, useContext } from "react";
import type { CreateTask } from "../api/client";

/** What the side panel shows: an existing task, or a new task that isn't saved yet. */
export type PanelTarget = { kind: "task"; id: string } | { kind: "draft"; draft: CreateTask } | null;

export interface PanelApi {
  openTask: (id: string) => void;
  openDraft: (draft: CreateTask) => void;
  close: () => void;
}

export const PanelContext = createContext<PanelApi>({
  openTask: () => {},
  openDraft: () => {},
  close: () => {},
});

export const usePanel = () => useContext(PanelContext);
