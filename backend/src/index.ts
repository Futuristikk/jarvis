import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { tasks } from "./routes/tasks.js";

const app = new Hono();

app.use("*", logger());
app.use("*", cors({ origin: "*" }));

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "jarvis-backend",
    time: new Date().toISOString(),
  }),
);

app.route("/tasks", tasks);

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
console.log(`jarvis-backend listening on :${port}`);
