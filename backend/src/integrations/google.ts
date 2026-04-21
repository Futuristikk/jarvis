type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

let cache: TokenCache | null = null;

async function mintAccessToken(): Promise<TokenCache> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google OAuth env missing: need GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN",
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(
      `Google token refresh failed: ${res.status} ${await res.text()}`,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
  };

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
}

export async function getGoogleAccessToken(): Promise<string> {
  if (cache && cache.expiresAt > Date.now()) return cache.accessToken;
  cache = await mintAccessToken();
  return cache.accessToken;
}

export async function googleFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getGoogleAccessToken();
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}
