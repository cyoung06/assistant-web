import { useEffect, useState } from "react";
import { useProjectFolder } from "./api";
import { FilesPage } from "./FilesPage";

/** A project's own storage (its folder in the drive), as its page's Files tab. */
export function ProjectFiles({ projectId, projectName }: { projectId: string; projectName: string }) {
  const folder = useProjectFolder(projectId);
  const root = folder.data?.path;
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => setPath(null), [projectId]);
  if (!root) return <p style={{ padding: 16, color: "var(--text-2)" }}>{folder.isError ? "Couldn't reach the drive." : "Loading…"}</p>;
  return <FilesPage path={path ?? root} go={setPath} root={root} rootName={projectName} />;
}
