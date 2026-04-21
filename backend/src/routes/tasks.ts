import { Hono } from "hono";
import { z } from "zod";
import { convex } from "../convex.js";

export const tasks = new Hono();

const createTaskSchema = z.object({
  projectId: z.string().optional(),
  type: z.enum(["research", "email", "code", "plan"]),
  priority: z.number().int().optional(),
  spec: z.string().min(1),
});

tasks.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  // Untyped call until `npx convex dev` generates `convex/_generated/api`.
  // After first generation, swap for `convex.mutation(api.tasks.create, parsed.data)`.
  const id = await convex.mutation("tasks:create" as never, parsed.data);
  return c.json({ id }, 201);
});

tasks.get("/queued", async (c) => {
  const rows = await convex.query("tasks:queued" as never, {});
  return c.json({ tasks: rows });
});
