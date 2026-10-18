import { createContext, useContext } from "react";
import type { CreateItem } from "../api/client";

/** What the side panel shows: an existing item, or a new item that isn't saved yet. */
export type PanelTarget = { kind: "item"; id: string } | { kind: "draft"; draft: CreateItem } | null;

export interface PanelApi {
  openItem: (id: string) => void;
  openDraft: (draft: CreateItem) => void;
  close: () => void;
}

export const PanelContext = createContext<PanelApi>({
  openItem: () => {},
  openDraft: () => {},
  close: () => {},
});

export const usePanel = () => useContext(PanelContext);
