import { Hono } from "hono";

export const oauth = new Hono();

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "openid",
  "email",
  "profile",
];

oauth.get("/google/start", (c) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return c.json({ error: "GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI missing" }, 500);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

oauth.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const err = c.req.query("error");
  if (err) return c.json({ error: err }, 400);
  if (!code) return c.json({ error: "missing code" }, 400);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return c.json({ error: "Google OAuth env missing" }, 500);
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    return c.json({ error: await res.text(), status: res.status }, 502);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    scope: string;
    expires_in: number;
  };

  console.log("\n=== Google OAuth success ===");
  console.log("scopes:", data.scope);
  if (data.refresh_token) {
    console.log("GOOGLE_REFRESH_TOKEN=" + data.refresh_token);
    console.log(
      "Copy the line above into backend/.env (replacing GOOGLE_REFRESH_TOKEN) and restart the server.",
    );
  } else {
    console.log(
      "NO refresh_token returned — Google only issues one on first consent per client. Revoke at https://myaccount.google.com/permissions and retry.",
    );
  }
  console.log("===\n");

  return c.html(
    `<!doctype html><meta charset="utf-8"><title>Google OAuth</title>
<h1>Google OAuth complete</h1>
<p><strong>Scopes granted:</strong><br><code>${data.scope}</code></p>
<p>${
      data.refresh_token
        ? "Refresh token printed to the backend console. Copy it into <code>backend/.env</code> as <code>GOOGLE_REFRESH_TOKEN</code>, then restart the server."
        : "No refresh token returned. Revoke this app at <a href='https://myaccount.google.com/permissions'>myaccount.google.com/permissions</a> and retry."
    }</p>`,
  );
});
