import { useCallback, useEffect, useState } from "react";
import {
  createResearchTask,
  createSchedule,
  deleteSchedule,
  getTask,
  listSchedules,
  listTasks,
  listVaultScopes,
  previewCron,
  promoteTask,
  runScheduleNow,
  saveTaskToVault,
  setScheduleActive,
  type PromoteResult,
  type ScheduleRow,
  type TaskDetail,
  type TaskRow,
  type VaultBucket,
  type VaultWriteResult,
} from "./api";

const POLL_MS = 3000;

export default function App() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [question, setQuestion] = useState("");
  const [contextScope, setContextScope] = useState("");
  const [scopes, setScopes] = useState<string[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listVaultScopes()
      .then((r) => setScopes(r.scopes))
      .catch((e) => setError((e as Error).message));
  }, []);

  const refreshList = useCallback(async () => {
    try {
      const { tasks } = await listTasks();
      setTasks(tasks);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const refreshDetail = useCallback(async (id: string) => {
    try {
      const d = await getTask(id);
      setDetail(d);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  useEffect(() => {
    const anyInFlight = tasks.some(
      (t) => t.status === "queued" || t.status === "running",
    );
    const detailInFlight =
      detail?.task &&
      (detail.task.status === "queued" || detail.task.status === "running");
    if (!anyInFlight && !detailInFlight) return;

    const i = setInterval(() => {
      refreshList();
      if (openId) refreshDetail(openId);
    }, POLL_MS);
    return () => clearInterval(i);
  }, [tasks, detail, openId, refreshList, refreshDetail]);

  useEffect(() => {
    if (openId) refreshDetail(openId);
    else setDetail(null);
  }, [openId, refreshDetail]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { id } = await createResearchTask(q, contextScope);
      setQuestion("");
      await refreshList();
      setOpenId(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={S.page}>
      <header style={S.header}>
        <h1 style={S.h1}>Jarvis</h1>
      </header>

      <form onSubmit={submit} style={S.form}>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a research question…"
          rows={3}
          style={S.textarea}
          disabled={submitting}
        />
        <div style={S.formRow}>
          <label style={S.contextLabel}>
            Context:
            <select
              value={contextScope}
              onChange={(e) => setContextScope(e.target.value)}
              style={S.contextSelect}
              disabled={submitting || !scopes}
            >
              <option value="">none</option>
              {scopes?.filter((s) => s !== "").map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={submitting || !question.trim()}
            style={S.button}
          >
            {submitting ? "Sending…" : "Ask"}
          </button>
        </div>
      </form>

      {error && <div style={S.error}>{error}</div>}

      <section style={S.section}>
        <h2 style={S.h2}>Tasks</h2>
        {tasks.length === 0 && <p style={S.muted}>No tasks yet.</p>}
        <ul style={S.list}>
          {tasks.map((t) => (
            <li key={t._id} style={S.taskItem}>
              <button
                style={S.taskButton}
                onClick={() => setOpenId(openId === t._id ? null : t._id)}
              >
                <StatusBadge status={t.status} />
                <span style={S.taskSpec}>
                  {t.scheduleId ? "⏰ " : ""}
                  {t.spec}
                </span>
                <span style={S.taskTime}>{fmt(t._creationTime)}</span>
              </button>
              {openId === t._id && detail?.task._id === t._id && (
                <Detail detail={detail} scopes={scopes} />
              )}
            </li>
          ))}
        </ul>
      </section>

      <SchedulesSection scopes={scopes} />
    </div>
  );
}

function SchedulesSection({ scopes }: { scopes: string[] | null }) {
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { schedules } = await listSchedules();
      setSchedules(schedules);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <section style={S.section}>
      <div style={S.sectionHeader}>
        <h2 style={S.h2}>Schedules</h2>
        <button style={S.smallButton} onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ New"}
        </button>
      </div>
      {err && <div style={S.error}>{err}</div>}
      {showForm && (
        <ScheduleForm
          scopes={scopes}
          onCreated={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}
      {schedules.length === 0 && !showForm && (
        <p style={S.muted}>No schedules yet.</p>
      )}
      <ul style={S.list}>
        {schedules.map((s) => (
          <ScheduleItem key={s._id} sched={s} onChanged={refresh} />
        ))}
      </ul>
    </section>
  );
}

function ScheduleForm({
  scopes,
  onCreated,
}: {
  scopes: string[] | null;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 9 * * 1");
  const [spec, setSpec] = useState("");
  const [scope, setScope] = useState("");
  const [preview, setPreview] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!cron) return;
    let cancelled = false;
    const t = setTimeout(() => {
      previewCron(cron).then((r) => {
        if (cancelled) return;
        if (r.valid && r.next) {
          setPreview(`next: ${new Date(r.next).toLocaleString()}`);
        } else {
          setPreview(`invalid: ${r.error}`);
        }
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cron]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      await createSchedule({
        name: name.trim(),
        cron: cron.trim(),
        spec: spec.trim(),
        contextScope: scope || undefined,
      });
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} style={S.scheduleForm}>
      <label style={S.label}>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Saildock weekly news"
          style={S.input}
          required
        />
      </label>
      <label style={S.label}>
        Cron (Europe/Madrid)
        <input
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          placeholder="0 9 * * 1"
          style={S.input}
          required
        />
        <span style={S.muted}>{preview}</span>
      </label>
      <label style={S.label}>
        Question
        <textarea
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
          placeholder="What new self-docking research came out this week?"
          rows={3}
          style={S.textarea}
          required
        />
      </label>
      <label style={S.label}>
        Context scope
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          style={S.select}
          disabled={!scopes}
        >
          <option value="">none</option>
          {scopes?.filter((s) => s !== "").map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      {err && <div style={S.error}>{err}</div>}
      <button
        type="submit"
        disabled={submitting || !name.trim() || !cron.trim() || !spec.trim()}
        style={S.button}
      >
        {submitting ? "Creating…" : "Create schedule"}
      </button>
    </form>
  );
}

function ScheduleItem({
  sched,
  onChanged,
}: {
  sched: ScheduleRow;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li style={S.taskItem}>
      <div style={S.scheduleRow}>
        <div style={S.scheduleMain}>
          <div>
            <span
              style={{
                ...S.badge,
                background: sched.active ? "#22c55e" : "#6b7280",
              }}
            >
              {sched.active ? "active" : "paused"}
            </span>{" "}
            <strong>{sched.name}</strong>
          </div>
          <div style={S.scheduleMeta}>
            <code>{sched.cron}</code>
            {sched.contextScope ? ` · ${sched.contextScope}` : ""}
            {" · next "}
            {new Date(sched.nextRunAt).toLocaleString()}
          </div>
          <div style={S.scheduleSpec}>{sched.spec}</div>
        </div>
        <div style={S.scheduleActions}>
          <button
            style={S.smallButton}
            disabled={busy}
            onClick={() => run(() => runScheduleNow(sched._id))}
          >
            Run now
          </button>
          <button
            style={S.smallButton}
            disabled={busy}
            onClick={() => run(() => setScheduleActive(sched._id, !sched.active))}
          >
            {sched.active ? "Pause" : "Resume"}
          </button>
          <button
            style={{ ...S.smallButton, color: "#ef4444" }}
            disabled={busy}
            onClick={() => {
              if (confirm(`Delete schedule "${sched.name}"?`)) {
                run(() => deleteSchedule(sched._id));
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

function Detail({ detail, scopes }: { detail: TaskDetail; scopes: string[] | null }) {
  const { task, research } = detail;
  return (
    <div style={S.detail}>
      {task.contextScope && (
        <div style={S.contextBanner}>
          context: <strong>{task.contextScope}</strong>
          {task.contextFiles && ` · ${task.contextFiles.length} files`}
          {task.priorAnswersCount
            ? ` · ${task.priorAnswersCount} prior answers`
            : ""}
        </div>
      )}
      {task.status === "running" || task.status === "queued" ? (
        <p style={S.muted}>{task.status}…</p>
      ) : task.status === "failed" ? (
        <pre style={S.error}>{task.result}</pre>
      ) : (
        <div>
          <pre style={S.result}>{task.result}</pre>
          {research[0]?.citations.length ? (
            <details>
              <summary style={S.summary}>
                {research[0].citations.length} citations
              </summary>
              <ul style={S.citations}>
                {research[0].citations.map((c) => (
                  <li key={c}>
                    <a href={c} target="_blank" rel="noreferrer" style={S.link}>
                      {c}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {task.autoSavePath && (
            <div style={S.savedRow}>
              <span style={S.savedTick}>⏰</span>
              <span style={S.savedPath}>auto-saved · {task.autoSavePath}</span>
            </div>
          )}
          {task.autoSaveError && (
            <div style={S.error}>auto-save failed: {task.autoSaveError}</div>
          )}
          <SaveToVault
            taskId={task._id}
            defaultScope={task.contextScope ?? ""}
            scopes={scopes}
          />
          <PromoteToProject
            taskId={task._id}
            defaultScope={task.contextScope ?? ""}
            scopes={scopes}
          />
        </div>
      )}
    </div>
  );
}

function SaveToVault({
  taskId,
  defaultScope,
  scopes,
}: {
  taskId: string;
  defaultScope: string;
  scopes: string[] | null;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState(defaultScope);
  const [bucket, setBucket] = useState<VaultBucket>("Inbox");
  const [thread, setThread] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<VaultWriteResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    if (bucket !== "Inbox" && !thread.trim()) {
      setErr(`${bucket} requires a thread name`);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await saveTaskToVault(taskId, {
        scope,
        bucket,
        thread: bucket === "Inbox" ? undefined : thread.trim(),
      });
      setSaved(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div style={S.savedRow}>
        <span style={S.savedTick}>✓</span>
        <span style={S.savedPath}>{saved.relPath}</span>
      </div>
    );
  }

  if (!open) {
    return (
      <button style={S.saveTrigger} onClick={() => setOpen(true)}>
        Save to vault
      </button>
    );
  }

  return (
    <div style={S.saveBox}>
      <label style={S.label}>
        Scope
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          style={S.select}
          disabled={!scopes}
        >
          {!scopes && <option>loading…</option>}
          {scopes?.map((s) => (
            <option key={s} value={s}>
              {s === "" ? "Top-level (Jarvis/)" : s}
            </option>
          ))}
        </select>
      </label>
      <label style={S.label}>
        Bucket
        <select
          value={bucket}
          onChange={(e) => setBucket(e.target.value as VaultBucket)}
          style={S.select}
        >
          <option value="Inbox">Inbox</option>
          <option value="Threads">Threads</option>
          <option value="Scheduled">Scheduled</option>
        </select>
      </label>
      {bucket !== "Inbox" && (
        <label style={S.label}>
          {bucket === "Threads" ? "Thread name" : "Schedule name"}
          <input
            value={thread}
            onChange={(e) => setThread(e.target.value)}
            placeholder="my-thread-slug"
            style={S.input}
          />
        </label>
      )}
      {err && <div style={S.error}>{err}</div>}
      <div style={S.saveActions}>
        <button onClick={save} disabled={saving} style={S.button}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setOpen(false)} style={S.cancelBtn}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function PromoteToProject({
  taskId,
  defaultScope,
  scopes,
}: {
  taskId: string;
  defaultScope: string;
  scopes: string[] | null;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState(defaultScope);
  const [filename, setFilename] = useState("");
  const [transformPrompt, setTransformPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PromoteResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await promoteTask(taskId, {
        scope,
        filename: filename.trim(),
        transformPrompt: transformPrompt.trim() || undefined,
      });
      setDone(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={S.savedRow}>
        <span style={S.savedTick}>↗</span>
        <span style={S.savedPath}>
          promoted{done.transformed ? " (transformed)" : ""} · {done.relPath}
        </span>
      </div>
    );
  }

  if (!open) {
    return (
      <button style={S.saveTrigger} onClick={() => setOpen(true)}>
        Promote to project
      </button>
    );
  }

  const promoteScopes = scopes?.filter((s) => s !== "") ?? [];

  return (
    <div style={S.saveBox}>
      <label style={S.label}>
        Target scope (canonical)
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          style={S.select}
          disabled={!scopes}
        >
          {!scopes && <option>loading…</option>}
          {promoteScopes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label style={S.label}>
        New filename
        <input
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          placeholder="Open Question - Sub-10cm Positioning.md"
          style={S.input}
        />
      </label>
      <label style={S.label}>
        Transform prompt (optional — leave blank for raw paste)
        <textarea
          value={transformPrompt}
          onChange={(e) => setTransformPrompt(e.target.value)}
          rows={3}
          placeholder="Reshape as a hypothesis note. Drop conversational tone. Keep specific numbers."
          style={S.textarea}
        />
      </label>
      {err && <div style={S.error}>{err}</div>}
      <div style={S.saveActions}>
        <button
          onClick={submit}
          disabled={busy || !scope || !filename.trim()}
          style={S.button}
        >
          {busy ? "Promoting…" : "Promote"}
        </button>
        <button onClick={() => setOpen(false)} style={S.cancelBtn}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TaskRow["status"] }) {
  const color: Record<TaskRow["status"], string> = {
    queued: "#6b7280",
    running: "#f59e0b",
    done: "#22c55e",
    failed: "#ef4444",
    cancelled: "#6b7280",
  };
  return (
    <span
      style={{
        ...S.badge,
        background: color[status],
      }}
    >
      {status}
    </span>
  );
}

function fmt(ts: number) {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

const S: Record<string, React.CSSProperties> = {
  page: {
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    background: "#0b0b0c",
    color: "#e7e7e9",
    minHeight: "100vh",
    padding: "1.5rem",
    maxWidth: "780px",
    margin: "0 auto",
  },
  header: { borderBottom: "1px solid #2a2a2d", paddingBottom: "0.75rem", marginBottom: "1rem" },
  h1: { margin: 0, color: "#ffb547", fontSize: "1.5rem", letterSpacing: "0.02em" },
  h2: { fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a8a90", marginBottom: "0.5rem" },
  form: { display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.5rem" },
  textarea: {
    background: "#16161a",
    color: "#e7e7e9",
    border: "1px solid #2a2a2d",
    borderRadius: "8px",
    padding: "0.75rem",
    fontFamily: "inherit",
    fontSize: "1rem",
    resize: "vertical",
  },
  button: {
    background: "#ffb547",
    color: "#0b0b0c",
    border: "none",
    borderRadius: "8px",
    padding: "0.6rem 1rem",
    fontWeight: 600,
    cursor: "pointer",
    alignSelf: "flex-start",
  },
  error: { color: "#ef4444", padding: "0.5rem 0" },
  section: { marginTop: "1rem" },
  list: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" },
  taskItem: { background: "#16161a", border: "1px solid #2a2a2d", borderRadius: "8px", overflow: "hidden" },
  taskButton: {
    width: "100%",
    background: "transparent",
    border: "none",
    color: "inherit",
    padding: "0.75rem",
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    fontSize: "0.95rem",
  },
  taskSpec: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  taskTime: { color: "#8a8a90", fontSize: "0.8rem" },
  badge: {
    color: "#0b0b0c",
    fontSize: "0.7rem",
    fontWeight: 600,
    padding: "0.15rem 0.5rem",
    borderRadius: "4px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  detail: { padding: "0 0.75rem 0.75rem", borderTop: "1px solid #2a2a2d" },
  result: { whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit", margin: "0.75rem 0", lineHeight: 1.5 },
  muted: { color: "#8a8a90" },
  summary: { cursor: "pointer", color: "#8a8a90", fontSize: "0.85rem" },
  citations: { paddingLeft: "1rem", margin: "0.5rem 0" },
  link: { color: "#ffb547", wordBreak: "break-all" },
  formRow: { display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" },
  contextLabel: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    fontSize: "0.8rem",
    color: "#8a8a90",
  },
  contextSelect: {
    background: "#16161a",
    color: "#e7e7e9",
    border: "1px solid #2a2a2d",
    borderRadius: "4px",
    padding: "0.3rem",
    fontFamily: "inherit",
    fontSize: "0.85rem",
    maxWidth: "260px",
  },
  contextBanner: {
    fontSize: "0.75rem",
    color: "#ffb547",
    padding: "0.5rem 0",
    borderBottom: "1px solid #2a2a2d",
    marginBottom: "0.5rem",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "0.5rem",
  },
  smallButton: {
    background: "transparent",
    border: "1px solid #2a2a2d",
    color: "#e7e7e9",
    borderRadius: "6px",
    padding: "0.3rem 0.6rem",
    fontSize: "0.8rem",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  scheduleForm: {
    background: "#16161a",
    border: "1px solid #2a2a2d",
    borderRadius: "8px",
    padding: "0.75rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    marginBottom: "0.75rem",
  },
  scheduleRow: {
    padding: "0.75rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  scheduleMain: { display: "flex", flexDirection: "column", gap: "0.25rem" },
  scheduleMeta: { fontSize: "0.8rem", color: "#8a8a90" },
  scheduleSpec: { fontSize: "0.85rem", color: "#c8c8cc" },
  scheduleActions: { display: "flex", gap: "0.4rem", flexWrap: "wrap" },
  saveTrigger: {
    marginTop: "0.75rem",
    background: "transparent",
    border: "1px solid #2a2a2d",
    color: "#ffb547",
    borderRadius: "6px",
    padding: "0.4rem 0.75rem",
    fontSize: "0.85rem",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  saveBox: {
    marginTop: "0.75rem",
    padding: "0.75rem",
    background: "#0e0e10",
    border: "1px solid #2a2a2d",
    borderRadius: "6px",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    fontSize: "0.8rem",
    color: "#8a8a90",
  },
  select: {
    background: "#16161a",
    color: "#e7e7e9",
    border: "1px solid #2a2a2d",
    borderRadius: "4px",
    padding: "0.4rem",
    fontFamily: "inherit",
    fontSize: "0.9rem",
  },
  input: {
    background: "#16161a",
    color: "#e7e7e9",
    border: "1px solid #2a2a2d",
    borderRadius: "4px",
    padding: "0.4rem",
    fontFamily: "inherit",
    fontSize: "0.9rem",
  },
  saveActions: { display: "flex", gap: "0.5rem", marginTop: "0.25rem" },
  cancelBtn: {
    background: "transparent",
    border: "1px solid #2a2a2d",
    color: "#8a8a90",
    borderRadius: "6px",
    padding: "0.4rem 0.75rem",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  savedRow: {
    marginTop: "0.75rem",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    color: "#22c55e",
    fontSize: "0.85rem",
  },
  savedTick: { fontSize: "1rem" },
  savedPath: { color: "#8a8a90", wordBreak: "break-all" },
};
