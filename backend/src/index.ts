import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requirePassword } from "./auth.js";
import { chat } from "./routes/chat.js";
import { voice } from "./routes/voice.js";

const app = new Hono();

const configuredOrigin = process.env.JARVIS_ORIGIN?.replace(/\/+$/, "");

const allowedOrigins = new Set([
  "http://localhost:5173",
  "https://localhost",
  ...(configuredOrigin ? [configuredOrigin] : []),
]);

app.use("*", logger());
app.use(
  "/api/*",
  cors({ origin: (origin) => (allowedOrigins.has(origin) ? origin : null) }),
);
app.use("/api/*", requirePassword);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "jarvis-backend",
    time: new Date().toISOString(),
  }),
);

app.get("/api/auth/verify", (c) => c.json({ ok: true }));
app.route("/api/chat", chat);
app.route("/api/voice", voice);

if (process.env.CONVEX_URL) {
  const [
    { integrations },
    { oauth },
    { schedules },
    { tasks },
    { vault },
    { startWorker },
  ] = await Promise.all([
    import("./routes/integrations.js"),
    import("./routes/oauth.js"),
    import("./routes/schedules.js"),
    import("./routes/tasks.js"),
    import("./routes/vault.js"),
    import("./worker.js"),
  ]);
  app.route("/api/tasks", tasks);
  app.route("/api/integrations", integrations);
  app.route("/api/oauth", oauth);
  app.route("/api/vault", vault);
  app.route("/api/schedules", schedules);
  startWorker();
}

app.all("/api/*", (c) =>
  c.json({ error: "Die angeforderte API-Route existiert nicht." }, 404),
);

app.use("/*", serveStatic({ root: "../web/dist" }));
app.get("*", serveStatic({ path: "../web/dist/index.html" }));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
console.log(`jarvis-backend listening on :${port}`);
