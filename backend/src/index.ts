import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { integrations } from "./routes/integrations.js";
import { oauth } from "./routes/oauth.js";
import { tasks } from "./routes/tasks.js";
import { vault } from "./routes/vault.js";
import { startWorker } from "./worker.js";

const app = new Hono();

app.use("*", logger());
app.use("*", cors({ origin: "*" }));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "jarvis-backend",
    time: new Date().toISOString(),
  }),
);

app.route("/tasks", tasks);
app.route("/integrations", integrations);
app.route("/oauth", oauth);
app.route("/vault", vault);

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
console.log(`jarvis-backend listening on :${port}`);

startWorker();
