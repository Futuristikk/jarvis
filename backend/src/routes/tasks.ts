import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";

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
  const id = await db.tasks.create(parsed.data);
  return c.json({ id }, 201);
});

tasks.get("/", async (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  const rows = await db.tasks.recent(limit);
  return c.json({ tasks: rows });
});

tasks.get("/queued", async (c) => {
  const rows = await db.tasks.queued();
  return c.json({ tasks: rows });
});

tasks.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [task, messages, research] = await Promise.all([
    db.tasks.get(id),
    db.messages.byTask(id),
    db.research.byTask(id),
  ]);
  if (!task) return c.json({ error: "not found" }, 404);
  return c.json({ task, messages, research });
});
