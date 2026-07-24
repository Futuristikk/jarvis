import { useState, type FormEvent } from "react";
import { setToken } from "../auth";
import { verifyPassword } from "../api";

export function Login() {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const ok = await verifyPassword(password);
      if (ok) {
        setToken(password);
      } else {
        setError("Falsches Passwort");
      }
    } catch {
      setError("Couldn't reach the server");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-title">JARVIS</div>
        <input
          type="password"
          className="login-input"
          placeholder="Jarvis-Passwort"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="login-submit" disabled={submitting || !password}>
          {submitting ? "Prüfe…" : "Entsperren"}
        </button>
        {error ? <div className="login-error">{error}</div> : null}
      </form>
    </div>
  );
}
