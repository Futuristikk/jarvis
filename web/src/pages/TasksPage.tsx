import { useEffect, useState } from "react";
import { listTasks, type TaskRow, type TaskStatus } from "../api";

const STATUS: Record<TaskStatus, string> = {
  queued: "Wartet",
  running: "Läuft",
  done: "Erledigt",
  failed: "Fehlgeschlagen",
  cancelled: "Abgebrochen",
};

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listTasks(30)
      .then((result) => {
        if (!cancelled) setTasks(result.tasks);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page page-enter">
      <div className="topbar">
        <div className="topbar-title">
          <span className="dot" />
          Aufgaben
        </div>
      </div>
      <div className="surface-list">
        {loading && <div className="surface-empty">Aufgaben werden geladen…</div>}
        {!loading && !available && (
          <div className="surface-card">
            <strong>Aufgabenmodul nicht verbunden</strong>
            <p>
              Chat und Sprache funktionieren bereits. Die dauerhafte
              Aufgabenverwaltung benötigt später eine konfigurierte Datenbank.
            </p>
          </div>
        )}
        {!loading && available && tasks.length === 0 && (
          <div className="surface-empty">Noch keine Aufgaben vorhanden.</div>
        )}
        {tasks.map((task) => (
          <article className="surface-card" key={task._id}>
            <div className="surface-card-row">
              <strong>{task.spec}</strong>
              <span className={"status-badge " + task.status}>
                {STATUS[task.status]}
              </span>
            </div>
            {task.result && <p>{task.result}</p>}
          </article>
        ))}
      </div>
    </div>
  );
}
