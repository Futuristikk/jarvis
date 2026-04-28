const BASE =
  import.meta.env.VITE_BACKEND_URL ??
  `${window.location.protocol}//${window.location.hostname}:3000`;

export type TaskStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export type TaskRow = {
  _id: string;
  _creationTime: number;
  type: "research" | "email" | "code" | "plan";
  status: TaskStatus;
  priority: number;
  spec: string;
  result?: string;
  completedAt?: number;
};

export type Message = {
  _id: string;
  taskId?: string;
  role: "agent" | "user" | "system" | "tool";
  content: string;
  _creationTime: number;
};

export type Research = {
  _id: string;
  taskId: string;
  source: string;
  summary: string;
  citations: string[];
  _creationTime: number;
};

export type TaskDetail = {
  task: TaskRow;
  messages: Message[];
  research: Research[];
};

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`${r.status} ${path}: ${body.slice(0, 200)}`);
  }
  return r.json() as Promise<T>;
}

export async function getHealth() {
  return jsonFetch<{ ok: boolean; service: string; time: string }>("/health");
}

export async function createResearchTask(question: string) {
  return jsonFetch<{ id: string }>("/tasks", {
    method: "POST",
    body: JSON.stringify({ type: "research", spec: question }),
  });
}

export async function listTasks(limit = 50) {
  return jsonFetch<{ tasks: TaskRow[] }>(`/tasks?limit=${limit}`);
}

export async function getTask(id: string) {
  return jsonFetch<TaskDetail>(`/tasks/${id}`);
}
