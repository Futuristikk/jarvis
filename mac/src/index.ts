import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";
import {
  VAULT_PATH,
  canonicalWrite,
  listScopeFiles,
  listScopeFilesWithMeta,
  listScopes,
  readRawFile,
  readScopeContext,
  readVaultFile,
  writeVaultNote,
} from "./vault.js";

const app = new Hono();
const SECRET = process.env.MAC_VAULT_SECRET;
const SECRET_HEADER = "x-mac-auth";

app.use("*", logger());
// Mac service is server-to-server only (Railway → here); CORS is irrelevant
// for those calls. Kept off-by-default so a stray browser hit can't probe
// without the X-Mac-Auth secret AND a CORS-allowed origin.
app.use("*", cors({ origin: [] }));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

// /health is intentionally unauth so monitors can probe it.
app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "jarvis-mac",
    vault: VAULT_PATH,
    auth: SECRET ? "required" : "off",
    time: new Date().toISOString(),
  }),
);

// Everything below requires the shared secret when MAC_VAULT_SECRET is set.
// Off when unset → keeps local dev frictionless.
app.use("*", async (c, next) => {
  if (!SECRET) return next();
  if (c.req.header(SECRET_HEADER) !== SECRET) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
});

app.get("/vault/scopes", async (c) =>
  c.json({ scopes: await listScopes() }),
);

app.get("/vault/scope-files", async (c) => {
  const scope = c.req.query("scope") ?? "";
  const meta = c.req.query("meta") === "1";
  if (!scope) return c.json({ files: [] });
  if (meta) {
    return c.json({ files: await listScopeFilesWithMeta(scope) });
  }
  return c.json({ files: await listScopeFiles(scope) });
});

app.get("/vault/file", async (c) => {
  const relPath = c.req.query("path") ?? "";
  if (!relPath) return c.json({ error: "path required" }, 400);
  return c.json(await readVaultFile(relPath));
});

app.get("/vault/raw", async (c) => {
  const relPath = c.req.query("path") ?? "";
  if (!relPath) return c.json({ error: "path required" }, 400);
  return c.json(await readRawFile(relPath));
});

app.get("/vault/context", async (c) => {
  const scope = c.req.query("scope") ?? "";
  return c.json(await readScopeContext(scope));
});

const writeSchema = z.object({
  dest: z.object({
    scope: z.string(),
    bucket: z.enum(["Inbox", "Scheduled", "Threads"]),
    thread: z.string().optional(),
  }),
  filename: z.string().min(1),
  frontmatter: z.record(z.unknown()),
  body: z.string(),
});

app.post("/vault/write", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = writeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  return c.json(await writeVaultNote(parsed.data), 201);
});

const canonicalWriteSchema = z.object({
  relPath: z.string().min(1),
  content: z.string(),
  mode: z.enum(["create", "overwrite"]),
});

app.post("/vault/canonical-write", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = canonicalWriteSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  return c.json(await canonicalWrite(parsed.data), 201);
});

const port = Number(process.env.PORT ?? 3001);
const hostname = process.env.HOST ?? "0.0.0.0";
serve({ fetch: app.fetch, port, hostname });
console.log(`jarvis-mac listening on ${hostname}:${port} · vault=${VAULT_PATH}`);
