import type { MiddlewareHandler } from "hono";

const PUBLIC_PREFIXES = ["/api/health", "/api/oauth/"];

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export const requirePassword: MiddlewareHandler = async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p))) {
    return next();
  }

  const expected = process.env.JARVIS_PASSWORD;
  if (!expected) {
    console.error("[auth] JARVIS_PASSWORD is not set — refusing all non-public requests");
    return c.json({ error: "server auth not configured" }, 500);
  }

  const header = c.req.header("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  const provided = m?.[1] ?? "";
  if (!provided || !timingSafeEqual(provided, expected)) {
    return c.json({ error: "unauthorized" }, 401);
  }

  return next();
};
