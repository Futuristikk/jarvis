const TOKEN_KEY = "jarvis_token";

const listeners = new Set<(token: string | null) => void>();

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
  listeners.forEach((fn) => fn(token));
}

export function onTokenChange(fn: (token: string | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
