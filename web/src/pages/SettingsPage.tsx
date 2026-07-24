import { useState } from "react";
import { setToken } from "../auth";
import { isNativeApp, openWebSearch, openWhatsApp, shareJarvis } from "../native";

export function SettingsPage() {
  const [actionError, setActionError] = useState<string | null>(null);

  async function runAction(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch {
      setActionError("Die Aktion konnte nicht geöffnet werden.");
    }
  }

  return (
    <div className="page page-enter">
      <div className="topbar">
        <div className="topbar-title">
          <span className="dot" />
          Einstellungen
        </div>
      </div>
      <div className="surface-list">
        <section className="surface-card">
          <div className="setting-row">
            <span>Sprache</span>
            <strong>Deutsch</strong>
          </div>
          <div className="setting-row">
            <span>Sprachverbindung</span>
            <strong>WebRTC</strong>
          </div>
          <div className="setting-row">
            <span>App-Modus</span>
            <strong>{isNativeApp() ? "Android-App" : "Installierbare PWA"}</strong>
          </div>
        </section>
        <section className="surface-card">
          <strong>Apps und Internet</strong>
          <p>
            Externe Apps werden nur nach deinem Antippen geöffnet. Nachrichten
            werden nicht automatisch versendet.
          </p>
          <div className="settings-actions">
            <button onClick={() => void runAction(openWebSearch)}>
              Websuche öffnen
            </button>
            <button onClick={() => void runAction(openWhatsApp)}>
              WhatsApp öffnen
            </button>
            <button onClick={() => void runAction(shareJarvis)}>
              Jarvis teilen
            </button>
          </div>
          {actionError && <p className="surface-error">{actionError}</p>}
        </section>
        <section className="surface-card">
          <strong>Sicherheit</strong>
          <p>
            API-Schlüssel bleiben ausschließlich im Railway-Backend. Die
            Sprachfunktion erhält nur kurzlebige Sitzungsschlüssel.
          </p>
        </section>
        <button className="settings-logout" onClick={() => setToken(null)}>
          Abmelden
        </button>
      </div>
    </div>
  );
}
