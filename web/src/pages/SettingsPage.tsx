import { setToken } from "../auth";

export function SettingsPage() {
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
            <strong>Installierbare PWA</strong>
          </div>
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
