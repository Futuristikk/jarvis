import { useCallback, useEffect, useState } from "react";
import {
  createResearchTask,
  getTask,
  listTasks,
  type TaskDetail,
  type TaskRow,
} from "./api";

const POLL_MS = 3000;

export default function App() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const { id } = await createResearchTask(q);
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
        <button type="submit" disabled={submitting || !question.trim()} style={S.button}>
          {submitting ? "Sending…" : "Ask"}
        </button>
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
                <span style={S.taskSpec}>{t.spec}</span>
                <span style={S.taskTime}>{fmt(t._creationTime)}</span>
              </button>
              {openId === t._id && detail?.task._id === t._id && (
                <Detail detail={detail} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Detail({ detail }: { detail: TaskDetail }) {
  const { task, research } = detail;
  return (
    <div style={S.detail}>
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
        </div>
      )}
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
};
