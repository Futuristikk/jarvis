import { Hono } from "hono";
import { googleFetch } from "../integrations/google.js";

export const integrations = new Hono();

integrations.get("/google/profile", async (c) => {
  const res = await googleFetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
  );
  const body = await res.text();
  if (!res.ok) {
    return c.json({ error: body, status: res.status }, 502);
  }
  return c.json(JSON.parse(body));
});

integrations.get("/google/calendars", async (c) => {
  const res = await googleFetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
  );
  const body = await res.text();
  if (!res.ok) {
    return c.json({ error: body, status: res.status }, 502);
  }
  return c.json(JSON.parse(body));
});

integrations.get("/google/messages/recent", async (c) => {
  const limit = c.req.query("limit") ?? "10";
  const res = await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${encodeURIComponent(limit)}`,
  );
  const body = await res.text();
  if (!res.ok) {
    return c.json({ error: body, status: res.status }, 502);
  }
  return c.json(JSON.parse(body));
});
