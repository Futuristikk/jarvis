import { Hono } from "hono";
import {
  listScopes,
  listScopeFiles,
  listScopeFilesWithMeta,
  readVaultFile,
} from "../vault.js";

export const vault = new Hono();

vault.get("/scopes", async (c) => {
  return c.json({ scopes: await listScopes() });
});

vault.get("/scope-files", async (c) => {
  const scope = c.req.query("scope") ?? "";
  const withMeta = c.req.query("meta") === "1";
  if (!scope) return c.json(withMeta ? { files: [] } : { files: [] });
  try {
    if (withMeta) {
      const files = await listScopeFilesWithMeta(scope);
      return c.json({ files });
    }
    const files = await listScopeFiles(scope);
    return c.json({ files });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      400,
    );
  }
});

vault.get("/file", async (c) => {
  const relPath = c.req.query("path") ?? "";
  if (!relPath) return c.json({ error: "path required" }, 400);
  try {
    const file = await readVaultFile(relPath);
    return c.json(file);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      400,
    );
  }
});
