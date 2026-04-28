import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { nextFire, validateCron, fireDueSchedules } from "../scheduler.js";
import { slugify } from "../vault.js";

export const schedules = new Hono();

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  cron: z.string().min(1),
  spec: z.string().min(1),
  contextScope: z.string().optional(),
});

schedules.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { name, cron, spec, contextScope } = parsed.data;
  const cronError = validateCron(cron);
  if (cronError) return c.json({ error: `invalid cron: ${cronError}` }, 400);

  const slug = parsed.data.slug ?? slugify(name);
  const next = nextFire(cron).getTime();

  try {
    const id = await db.schedules.create({
      name,
      slug,
      cron,
      spec,
      contextScope,
      nextRunAt: next,
    });
    return c.json({ id, slug, nextRunAt: next }, 201);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      400,
    );
  }
});

schedules.get("/", async (c) => {
  const rows = await db.schedules.list();
  return c.json({ schedules: rows });
});

schedules.get("/:id", async (c) => {
  const sched = await db.schedules.get(c.req.param("id"));
  if (!sched) return c.json({ error: "not found" }, 404);
  return c.json({ schedule: sched });
});

const setActiveSchema = z.object({ active: z.boolean() });

schedules.post("/:id/active", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = setActiveSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  await db.schedules.setActive(c.req.param("id"), parsed.data.active);
  return c.json({ ok: true });
});

schedules.post("/:id/run-now", async (c) => {
  const id = c.req.param("id");
  const sched = await db.schedules.get(id);
  if (!sched) return c.json({ error: "not found" }, 404);
  await db.schedules.setNextRunAt(id, Date.now() - 1);
  await fireDueSchedules();
  return c.json({ ok: true });
});

schedules.delete("/:id", async (c) => {
  await db.schedules.remove(c.req.param("id"));
  return c.json({ ok: true });
});

schedules.get("/util/cron-preview", (c) => {
  const cron = c.req.query("cron") ?? "";
  const error = validateCron(cron);
  if (error) return c.json({ valid: false, error });
  const next = nextFire(cron).toISOString();
  return c.json({ valid: true, next });
});
