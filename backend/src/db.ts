import { convex } from "./convex.js";

// Untyped bridge until `npx convex dev` generates `convex/_generated/api`.
// After generation, swap each body for `convex.mutation(api.tasks.create, args)` etc.
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

export const db = {
  tasks: {
    create: (args: {
      projectId?: string;
      type: TaskType;
      priority?: number;
      spec: string;
    }) => untyped.mutation<string>("tasks:create", args),
    queued: () => untyped.query<unknown[]>("tasks:queued", {}),
  },
  projects: {
    list: () => untyped.query<unknown[]>("projects:list", {}),
    active: () => untyped.query<unknown[]>("projects:active", {}),
  },
};
