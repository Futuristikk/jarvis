import { Hono } from "hono";
import { listScopes } from "../vault.js";

export const vault = new Hono();

vault.get("/scopes", async (c) => {
  return c.json({ scopes: await listScopes() });
});
