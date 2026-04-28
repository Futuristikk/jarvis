import { Hono } from "hono";
import { listScopes, listScopeFiles } from "../vault.js";

export const vault = new Hono();

vault.get("/scopes", async (c) => {
  return c.json({ scopes: await listScopes() });
});

vault.get("/scope-files", async (c) => {
  const scope = c.req.query("scope") ?? "";
  if (!scope) return c.json({ files: [] });
  try {
    const files = await listScopeFiles(scope);
    return c.json({ files });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      400,
    );
  }
});
