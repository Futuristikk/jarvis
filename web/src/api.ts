const BASE = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3000";

export async function getHealth(): Promise<{
  ok: boolean;
  service: string;
  time: string;
}> {
  const r = await fetch(`${BASE}/health`);
  if (!r.ok) throw new Error(`health ${r.status}`);
  return r.json();
}
