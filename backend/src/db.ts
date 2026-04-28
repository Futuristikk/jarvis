import { convex } from "./convex.js";

const untyped = convex as unknown as {
  mutation<T = unknown>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T>;
  query<T = unknown>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T>;
};

export type TaskType = "research" | "email" | "code" | "plan";
export type TaskStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export type TaskRow = {
  _id: string;
  _creationTime: number;
  projectId?: string;
  type: TaskType;
  status: TaskStatus;
  priority: number;
  spec: string;
  contextScope?: string;
  contextFiles?: string[];
  priorAnswersCount?: number;
  scheduleId?: string;
  autoSavePath?: string;
  autoSaveError?: string;
  result?: string;
  completedAt?: number;
};

export type ScheduleRow = {
  _id: string;
  _creationTime: number;
  name: string;
  slug: string;
  cron: string;
  type: "research";
  spec: string;
  contextScope?: string;
  active: boolean;
  lastRunAt?: number;
  nextRunAt: number;
  lastTaskId?: string;
};

export const db = {
  tasks: {
    create: (args: {
      projectId?: string;
      type: TaskType;
      priority?: number;
      spec: string;
      contextScope?: string;
      scheduleId?: string;
    }) => untyped.mutation<string>("tasks:create", args),
    setAutoSaveResult: (args: {
      id: string;
      path?: string;
      error?: string;
    }) => untyped.mutation<void>("tasks:setAutoSaveResult", args),
    setContextFiles: (id: string, files: string[]) =>
      untyped.mutation<void>("tasks:setContextFiles", { id, files }),
    setPriorAnswersCount: (id: string, count: number) =>
      untyped.mutation<void>("tasks:setPriorAnswersCount", { id, count }),
    recentDoneInScope: (scope: string, limit: number, excludeId?: string) =>
      untyped.query<TaskRow[]>("tasks:recentDoneInScope", {
        scope,
        limit,
        excludeId,
      }),
    queued: () => untyped.query<TaskRow[]>("tasks:queued", {}),
    get: (id: string) => untyped.query<TaskRow | null>("tasks:get", { id }),
    recent: (limit?: number) =>
      untyped.query<TaskRow[]>("tasks:recent", { limit }),
    markRunning: (id: string) =>
      untyped.mutation<void>("tasks:markRunning", { id }),
    markDone: (id: string, result: string) =>
      untyped.mutation<void>("tasks:markDone", { id, result }),
    markFailed: (id: string, error: string) =>
      untyped.mutation<void>("tasks:markFailed", { id, error }),
  },
  messages: {
    append: (args: {
      projectId?: string;
      taskId?: string;
      role: "agent" | "user" | "system" | "tool";
      content: string;
    }) => untyped.mutation<string>("messages:append", args),
    byTask: (taskId: string) =>
      untyped.query<unknown[]>("messages:byTask", { taskId }),
  },
  research: {
    insert: (args: {
      taskId: string;
      source: string;
      summary: string;
      raw?: string;
      citations: string[];
    }) => untyped.mutation<string>("research:insert", args),
    byTask: (taskId: string) =>
      untyped.query<unknown[]>("research:byTask", { taskId }),
  },
  projects: {
    list: () => untyped.query<unknown[]>("projects:list", {}),
    active: () => untyped.query<unknown[]>("projects:active", {}),
  },
  schedules: {
    create: (args: {
      name: string;
      slug: string;
      cron: string;
      spec: string;
      contextScope?: string;
      nextRunAt: number;
    }) => untyped.mutation<string>("schedules:create", args),
    list: () => untyped.query<ScheduleRow[]>("schedules:list", {}),
    get: (id: string) =>
      untyped.query<ScheduleRow | null>("schedules:get", { id }),
    due: (now: number) =>
      untyped.query<ScheduleRow[]>("schedules:due", { now }),
    advance: (args: {
      id: string;
      lastRunAt: number;
      nextRunAt: number;
      lastTaskId: string;
    }) => untyped.mutation<void>("schedules:advance", args),
    setActive: (id: string, active: boolean) =>
      untyped.mutation<void>("schedules:setActive", { id, active }),
    setNextRunAt: (id: string, nextRunAt: number) =>
      untyped.mutation<void>("schedules:setNextRunAt", { id, nextRunAt }),
    remove: (id: string) => untyped.mutation<void>("schedules:remove", { id }),
  },
};
