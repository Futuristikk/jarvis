import { useState } from "react";
import {
  getCurrentLocation,
  openLocationInMaps,
  type CurrentLocation,
} from "../native";

export function LocationAccessCard() {
  const [location, setLocation] = useState<CurrentLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function locate() {
    setLoading(true);
    setMessage(null);
    try {
      setLocation(await getCurrentLocation());
    } catch (error) {
      setLocation(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Der aktuelle Standort konnte nicht ermittelt werden.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function openMap() {
    if (!location) return;
    setMessage(null);
    try {
      await openLocationInMaps(location);
    } catch {
      setMessage("Die Kartenansicht konnte nicht geöffnet werden.");
    }
  }

  return (
    <section className="surface-card location-access">
      <strong>Aktueller Standort</strong>
      <p>
        Jarvis fragt nur nach einer ungefähren Position, wenn du den Button
        antippst. Es gibt kein Hintergrundtracking und keine Übertragung.
      </p>
      <button
        className="location-primary"
        onClick={() => void locate()}
        disabled={loading}
      >
        {loading ? "Standort wird ermittelt…" : "Aktuellen Standort abrufen"}
      </button>

      {location && (
        <div className="location-result">
          <div className="setting-row">
            <span>Breitengrad</span>
            <strong>{location.latitude.toFixed(5)}</strong>
          </div>
          <div className="setting-row">
            <span>Längengrad</span>
            <strong>{location.longitude.toFixed(5)}</strong>
          </div>
          <div className="setting-row">
            <span>Genauigkeit</span>
            <strong>ca. {Math.round(location.accuracy)} m</strong>
          </div>
          <div className="location-actions">
            <button onClick={() => void openMap()}>In Karten öffnen</button>
            <button onClick={() => setLocation(null)}>Standort verwerfen</button>
          </div>
        </div>
      )}
      {message && <p className="surface-error">{message}</p>}
    </section>
  );
}
