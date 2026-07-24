import { useEffect, useState, type FormEvent } from "react";
import { listTasks, type TaskRow, type TaskStatus } from "../api";
import { isNativeApp } from "../native";
import {
  createReminder,
  loadReminders,
  removeReminder,
  restoreWebReminders,
  type LocalReminder,
} from "../reminders";

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
  const [reminders, setReminders] = useState<LocalReminder[]>(() =>
    loadReminders(),
  );
  const [title, setTitle] = useState("");
  const [at, setAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);

  useEffect(() => {
    restoreWebReminders();
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

  async function submitReminder(event: FormEvent) {
    event.preventDefault();
    setReminderError(null);
    setSaving(true);
    try {
      await createReminder(title, new Date(at));
      setReminders(loadReminders());
      setTitle("");
      setAt("");
    } catch (error) {
      setReminderError(
        error instanceof Error
          ? error.message
          : "Die Erinnerung konnte nicht gespeichert werden.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteReminder(id: number) {
    setReminderError(null);
    try {
      await removeReminder(id);
      setReminders(loadReminders());
    } catch {
      setReminderError("Die Erinnerung konnte nicht entfernt werden.");
    }
  }

  return (
    <div className="page page-enter">
      <div className="topbar">
        <div className="topbar-title">
          <span className="dot" />
          Aufgaben
        </div>
      </div>
      <div className="surface-list">
        <section className="surface-card reminder-composer">
          <strong>Lokale Erinnerung</strong>
          <p>
            {isNativeApp()
              ? "Android fragt erst beim Speichern nach Benachrichtigungen."
              : "Im Browser erscheint die Erinnerung zuverlässig, solange die PWA geöffnet ist."}
          </p>
          <form onSubmit={(event) => void submitReminder(event)}>
            <label>
              Was soll Jarvis erinnern?
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                placeholder="Zum Beispiel: Medikamente nehmen"
                required
              />
            </label>
            <label>
              Zeitpunkt
              <input
                type="datetime-local"
                value={at}
                onChange={(event) => setAt(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={saving}>
              {saving ? "Wird gespeichert…" : "Erinnerung aktivieren"}
            </button>
          </form>
          {reminderError && <p className="surface-error">{reminderError}</p>}
        </section>

        {reminders.length > 0 && (
          <section className="reminder-list" aria-label="Geplante Erinnerungen">
            {reminders.map((reminder) => (
              <article className="surface-card" key={reminder.id}>
                <div className="surface-card-row">
                  <div>
                    <strong>{reminder.title}</strong>
                    <p>{formatReminderTime(reminder.at)}</p>
                  </div>
                  <button
                    className="reminder-delete"
                    onClick={() => void deleteReminder(reminder.id)}
                    aria-label={`Erinnerung „${reminder.title}“ entfernen`}
                  >
                    Entfernen
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

        {loading && <div className="surface-empty">Aufgaben werden geladen…</div>}
        {!loading && !available && (
          <div className="surface-card">
            <strong>Server-Aufgaben nicht verbunden</strong>
            <p>
              Lokale Erinnerungen funktionieren trotzdem auf diesem Gerät.
            </p>
          </div>
        )}
        {!loading && available && tasks.length === 0 && (
          <div className="surface-empty">Noch keine Server-Aufgaben vorhanden.</div>
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

function formatReminderTime(value: string) {
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
