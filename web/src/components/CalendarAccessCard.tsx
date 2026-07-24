import { type FormEvent, useState } from "react";
import {
  isNativeApp,
  openCalendarEventDraft,
  type CalendarEventDraft,
} from "../native";

function toLocalDateTimeInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

function createDefaultTimes() {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  start.setSeconds(0, 0);
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    start: toLocalDateTimeInput(start),
    end: toLocalDateTimeInput(end),
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Die Kalender-App konnte nicht geöffnet werden.";
}

export function CalendarAccessCard() {
  const [defaults] = useState(createDefaultTimes);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);

    const draft: CalendarEventDraft = {
      title,
      startTime: new Date(start).getTime(),
      endTime: new Date(end).getTime(),
      location,
      description,
    };

    setIsOpening(true);
    try {
      await openCalendarEventDraft(draft);
      setStatus(
        "Die Kalender-App ist geöffnet. Prüfe den Termin und tippe dort selbst auf Speichern.",
      );
    } catch (openError) {
      setError(getErrorMessage(openError));
    } finally {
      setIsOpening(false);
    }
  }

  const native = isNativeApp();

  return (
    <section className="surface-card calendar-access">
      <strong>Kalendertermin vorbereiten</strong>
      <p>
        Jarvis liest deinen Kalender nicht und speichert keinen Termin
        automatisch. Nach deinem Antippen öffnet Android die Kalender-App mit
        diesen Angaben; erst dort bestätigst du das Speichern.
      </p>

      <form onSubmit={(event) => void submit(event)}>
        <label>
          Titel
          <input
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Zum Beispiel Zahnarzt"
          />
        </label>
        <div className="calendar-time-grid">
          <label>
            Beginn
            <input
              required
              type="datetime-local"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label>
            Ende
            <input
              required
              type="datetime-local"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
        </div>
        <label>
          Ort (optional)
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Adresse oder Treffpunkt"
          />
        </label>
        <label>
          Notiz (optional)
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Weitere Informationen"
          />
        </label>
        <button type="submit" disabled={!native || isOpening}>
          {isOpening ? "Kalender wird geöffnet …" : "In Kalender-App prüfen"}
        </button>
      </form>

      {!native && (
        <p className="surface-error">
          Diese Funktion ist in der installierten Android-App verfügbar.
        </p>
      )}
      {error && <p className="surface-error">{error}</p>}
      {status && <p className="surface-success">{status}</p>}
    </section>
  );
}
