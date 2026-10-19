import { useEffect, useState } from "react";
import { useProjectFolder } from "./api";
import { FilesPage } from "./FilesPage";

/** Where each project's storage was left, so leaving the Files tab and coming back keeps the folder. */
const left = new Map<string, string>();

/** A project's own storage (its folder in the drive), as its page's Files tab. */
export function ProjectFiles({ projectId, projectName }: { projectId: string; projectName: string }) {
  const folder = useProjectFolder(projectId);
  const root = folder.data?.path;
  const [path, setPath] = useState<string | null>(() => left.get(projectId) ?? null);
  useEffect(() => setPath(left.get(projectId) ?? null), [projectId]);
  const go = (p: string) => {
    left.set(projectId, p);
    setPath(p);
  };
  if (!root) return <p style={{ padding: 16, color: "var(--text-2)" }}>{folder.isError ? "Couldn't reach the drive." : "Loading…"}</p>;
  return <FilesPage path={path ?? root} go={go} root={root} rootName={projectName} />;
}
