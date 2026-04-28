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
  contextScope?: string;
  contextFiles?: string[];
  priorAnswersCount?: number;
  scheduleId?: string;
  autoSavePath?: string;
  autoSaveError?: string;
  result?: string;
  completedAt?: number;
};

export type ScheduleRow = {
  _id: string;
  _creationTime: number;
  name: string;
  slug: string;
  cron: string;
  type: "research";
  spec: string;
  contextScope?: string;
  active: boolean;
  lastRunAt?: number;
  nextRunAt: number;
  lastTaskId?: string;
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

export async function createResearchTask(question: string, contextScope?: string) {
  return jsonFetch<{ id: string }>("/tasks", {
    method: "POST",
    body: JSON.stringify({
      type: "research",
      spec: question,
      contextScope: contextScope || undefined,
    }),
  });
}

export async function listTasks(limit = 50) {
  return jsonFetch<{ tasks: TaskRow[] }>(`/tasks?limit=${limit}`);
}

export async function getTask(id: string) {
  return jsonFetch<TaskDetail>(`/tasks/${id}`);
}

export type VaultBucket = "Inbox" | "Scheduled" | "Threads";

export type VaultDest = {
  scope: string;
  bucket: VaultBucket;
  thread?: string;
};

export type VaultWriteResult = {
  absPath: string;
  relPath: string;
};

export async function listVaultScopes() {
  return jsonFetch<{ scopes: string[] }>("/vault/scopes");
}

export async function saveTaskToVault(taskId: string, dest: VaultDest) {
  return jsonFetch<VaultWriteResult>(`/tasks/${taskId}/save-to-vault`, {
    method: "POST",
    body: JSON.stringify(dest),
  });
}

export type PromoteMode = "create" | "append" | "merge";

export type PromoteRequest =
  | {
      mode: "create";
      scope: string;
      filename: string;
      transformPrompt?: string;
    }
  | {
      mode: "append" | "merge";
      targetPath: string;
      transformPrompt?: string;
    };

export type PromoteResult = {
  absPath: string;
  relPath: string;
  mode: PromoteMode;
  transformed: boolean;
};

export async function promoteTask(taskId: string, req: PromoteRequest) {
  return jsonFetch<PromoteResult>(`/tasks/${taskId}/promote`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function listScopeFiles(scope: string) {
  const params = new URLSearchParams({ scope });
  return jsonFetch<{ files: string[] }>(`/vault/scope-files?${params}`);
}

export async function listSchedules() {
  return jsonFetch<{ schedules: ScheduleRow[] }>("/schedules");
}

export async function previewCron(cron: string) {
  const params = new URLSearchParams({ cron });
  return jsonFetch<{ valid: boolean; next?: string; error?: string }>(
    `/schedules/util/cron-preview?${params}`,
  );
}

export type CreateScheduleInput = {
  name: string;
  cron: string;
  spec: string;
  contextScope?: string;
};

export async function createSchedule(input: CreateScheduleInput) {
  return jsonFetch<{ id: string; slug: string; nextRunAt: number }>(
    "/schedules",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function runScheduleNow(id: string) {
  return jsonFetch<{ ok: true }>(`/schedules/${id}/run-now`, {
    method: "POST",
    body: "{}",
  });
}

export async function setScheduleActive(id: string, active: boolean) {
  return jsonFetch<{ ok: true }>(`/schedules/${id}/active`, {
    method: "POST",
    body: JSON.stringify({ active }),
  });
}

export async function deleteSchedule(id: string) {
  return jsonFetch<{ ok: true }>(`/schedules/${id}`, { method: "DELETE" });
}
