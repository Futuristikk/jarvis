import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { slugify, todayISO, writeVaultNote } from "../vault.js";
import { promoteTask } from "../promote.js";

export const tasks = new Hono();

const createTaskSchema = z.object({
  projectId: z.string().optional(),
  type: z.enum(["research", "email", "code", "plan"]),
  priority: z.number().int().optional(),
  spec: z.string().min(1),
  contextScope: z.string().optional(),
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

const saveSchema = z.object({
  scope: z.string(),
  bucket: z.enum(["Inbox", "Scheduled", "Threads"]),
  thread: z.string().optional(),
});

tasks.post("/:id/save-to-vault", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const dest = parsed.data;
  if ((dest.bucket !== "Inbox") && !dest.thread) {
    return c.json({ error: `${dest.bucket} requires a thread name` }, 400);
  }

  const [task, research] = await Promise.all([
    db.tasks.get(id),
    db.research.byTask(id),
  ]);
  if (!task) return c.json({ error: "task not found" }, 404);
  if (task.status !== "done") {
    return c.json({ error: `task status is ${task.status}, not done` }, 400);
  }

  const summary = task.result ?? "";
  const r0 = research[0] as { citations?: string[] } | undefined;
  const citations = r0?.citations ?? [];

  const filename = `${todayISO()} - ${slugify(task.spec)}.md`;
  const scopeSlug = dest.scope
    ? slugify(dest.scope.split("/").pop() ?? "")
    : "top";

  const result = await writeVaultNote({
    dest,
    filename,
    frontmatter: {
      source: "jarvis",
      jarvis_task_id: task._id,
      jarvis_query: task.spec,
      jarvis_scope: dest.scope || "",
      jarvis_thread: dest.thread,
      jarvis_context_scope: task.contextScope,
      jarvis_context_files: task.contextFiles,
      created: todayISO(),
      tags: ["jarvis", `jarvis/${scopeSlug}`],
    },
    body: buildVaultBody(task.spec, summary, citations, task.contextFiles),
  });

  return c.json(result, 201);
});

const promoteSchema = z.object({
  scope: z.string(),
  filename: z.string().min(1),
  transformPrompt: z.string().optional(),
});

tasks.post("/:id/promote", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = promoteSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  try {
    const result = await promoteTask({
      sourceTaskId: c.req.param("id"),
      scope: parsed.data.scope,
      filename: parsed.data.filename,
      transformPrompt: parsed.data.transformPrompt,
    });
    return c.json(result, 201);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      400,
    );
  }
});

function buildVaultBody(
  question: string,
  summary: string,
  citations: string[],
  contextFiles?: string[],
) {
  const parts = [`# ${question}`, ""];
  if (contextFiles && contextFiles.length > 0) {
    parts.push("## Context", "");
    for (const f of contextFiles) {
      const baseName = f.split("/").pop()?.replace(/\.md$/, "") ?? f;
      parts.push(`- [[${baseName}]]`);
    }
    parts.push("");
  }
  parts.push(summary);
  if (citations.length > 0) {
    parts.push("", "## Sources", "");
    for (const c of citations) parts.push(`- ${c}`);
  }
  return parts.join("\n");
}
