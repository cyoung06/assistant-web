import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, unwrap, type CreateTask, type Initiative, type InitiativePatch, type InitiativeStatus, type Label, type Project, type ProjectState, type RelationKind, type Task, type TaskPatch } from "../api/client";
import { isClosed } from "./model";

// One person's tasks fit in one list, so every view reads the same cached list and changes show
// everywhere at once.

const TASKS = ["tasks"];
const PROJECTS = ["projects"];
const LABELS = ["labels"];
const INITIATIVES = ["initiatives"];

export function useTasks() {
  return useQuery({ queryKey: TASKS, queryFn: async () => unwrap(await api.GET("/api/v1/tasks")) });
}

export function useTask(id: string | null): Task | undefined {
  return useTasks().data?.find((t) => t.id === id);
}

export function useProjects() {
  return useQuery({ queryKey: PROJECTS, queryFn: async () => unwrap(await api.GET("/api/v1/projects")) });
}

export function useInitiatives() {
  return useQuery({ queryKey: INITIATIVES, queryFn: async () => unwrap(await api.GET("/api/v1/initiatives")) });
}

export function useLabels() {
  return useQuery({ queryKey: LABELS, queryFn: async () => unwrap(await api.GET("/api/v1/labels")), staleTime: 60_000 });
}

/** Other tasks' counts (sub-tasks, blocked) and project and initiative progress follow from any change. */
function refresh(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: TASKS }),
    qc.invalidateQueries({ queryKey: PROJECTS }),
    qc.invalidateQueries({ queryKey: INITIATIVES }),
  ]);
}

/** Changes the cached list right away; returns a function that puts it back. */
async function changeLocally(qc: QueryClient, change: (tasks: Task[]) => Task[]) {
  await qc.cancelQueries({ queryKey: TASKS });
  const previous = qc.getQueryData<Task[]>(TASKS);
  if (previous) qc.setQueryData<Task[]>(TASKS, change(previous));
  return () => qc.setQueryData(TASKS, previous);
}

export function applyPatch(t: Task, p: TaskPatch): Task {
  const next: Task = { ...t, ...p } as Task;
  if (p.status !== undefined) next.closedAt = isClosed(p.status) ? (isClosed(t.status) ? t.closedAt : new Date().toISOString()) : null;
  if (p.status !== undefined && isClosed(p.status)) next.overdue = false;
  return next;
}

export function useTaskMutations() {
  const qc = useQueryClient();
  return {
    create: useMutation({
      mutationFn: async (body: CreateTask) => unwrap(await api.POST("/api/v1/tasks", { body })),
      onSuccess: (task) => {
        qc.setQueryData<Task[]>(TASKS, (list) => (list ? [...list, task] : list));
        return refresh(qc);
      },
    }),
    patch: useMutation({
      mutationFn: async ({ id, patch }: { id: string; patch: TaskPatch }) =>
        unwrap(await api.PATCH("/api/v1/tasks/{id}", { params: { path: { id } }, body: patch as never })),
      onMutate: ({ id, patch }) => changeLocally(qc, (list) => list.map((t) => (t.id === id ? applyPatch(t, patch) : t))),
      onError: (_e, _v, restore) => restore?.(),
      onSettled: () => refresh(qc),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/tasks/{id}", { params: { path: { id } } })),
      // Sub-tasks go with it.
      onMutate: (id) =>
        changeLocally(qc, (list) => {
          const gone = new Set([id]);
          for (let grew = true; grew; ) {
            grew = false;
            for (const t of list) if (t.parentId && gone.has(t.parentId) && !gone.has(t.id)) (gone.add(t.id), (grew = true));
          }
          return list.filter((t) => !gone.has(t.id));
        }),
      onError: (_e, _v, restore) => restore?.(),
      onSettled: () => refresh(qc),
    }),
    relate: useMutation({
      mutationFn: async ({ id, kind, taskId }: { id: string; kind: RelationKind; taskId: string }) =>
        unwrap(await api.POST("/api/v1/tasks/{id}/relations", { params: { path: { id } }, body: { kind, taskId } })),
      onSettled: () => refresh(qc),
    }),
    unrelate: useMutation({
      mutationFn: async ({ id, relationId }: { id: string; relationId: string }) =>
        unwrap(await api.DELETE("/api/v1/tasks/{id}/relations/{relationId}", { params: { path: { id, relationId } } })),
      onSettled: () => refresh(qc),
    }),
  };
}

export function useProjectMutations() {
  const qc = useQueryClient();
  const done = () => refresh(qc);
  return {
    create: useMutation({
      mutationFn: async (body: { name: string; color?: string; description?: string }) => unwrap(await api.POST("/api/v1/projects", { body })),
      onSuccess: (p) => {
        qc.setQueryData<Project[]>(PROJECTS, (list) => (list ? [...list, p] : list));
        return done();
      },
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: { id: string; name?: string; description?: string; color?: string; state?: ProjectState; initiativeIds?: string[] }) =>
        unwrap(await api.PATCH("/api/v1/projects/{id}", { params: { path: { id } }, body })),
      onSuccess: (p, vars) => {
        qc.setQueryData<Project[]>(PROJECTS, (list) => list?.map((x) => (x.id === p.id ? p : x)));
        if (vars.initiativeIds) return qc.invalidateQueries({ queryKey: INITIATIVES });
      },
    }),
    remove: useMutation({
      mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/projects/{id}", { params: { path: { id } } })),
      onSettled: done,
    }),
  };
}

export function useInitiativeMutations() {
  const qc = useQueryClient();
  const both = () => Promise.all([qc.invalidateQueries({ queryKey: INITIATIVES }), qc.invalidateQueries({ queryKey: PROJECTS })]);
  return {
    create: useMutation({
      mutationFn: async (body: { name: string; status?: InitiativeStatus; projectIds?: string[] }) => unwrap(await api.POST("/api/v1/initiatives", { body })),
      onSuccess: (i) => {
        qc.setQueryData<Initiative[]>(INITIATIVES, (list) => (list ? [...list, i] : list));
        return both();
      },
    }),
    update: useMutation({
      mutationFn: async ({ id, ...patch }: InitiativePatch & { id: string }) =>
        unwrap(await api.PATCH("/api/v1/initiatives/{id}", { params: { path: { id } }, body: patch as never })),
      onSuccess: (i, vars) => {
        qc.setQueryData<Initiative[]>(INITIATIVES, (list) => list?.map((x) => (x.id === i.id ? i : x)));
        if (vars.projectIds) return qc.invalidateQueries({ queryKey: PROJECTS });
      },
    }),
    remove: useMutation({
      mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/initiatives/{id}", { params: { path: { id } } })),
      onSettled: both,
    }),
  };
}

export function useLabelMutations() {
  const qc = useQueryClient();
  return {
    create: useMutation({
      mutationFn: async (body: { name: string; color?: string }) => unwrap(await api.POST("/api/v1/labels", { body })),
      onSuccess: (l) => {
        qc.setQueryData<Label[]>(LABELS, (list) => (list ? [...list, l] : list));
      },
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: { id: string; name?: string; color?: string }) =>
        unwrap(await api.PATCH("/api/v1/labels/{id}", { params: { path: { id } }, body })),
      onSuccess: (l) => {
        qc.setQueryData<Label[]>(LABELS, (list) => list?.map((x) => (x.id === l.id ? l : x)));
      },
    }),
    remove: useMutation({
      mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/labels/{id}", { params: { path: { id } } })),
      onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: LABELS }), qc.invalidateQueries({ queryKey: TASKS })]),
    }),
  };
}
