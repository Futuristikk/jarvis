import { Fragment, useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import {
  RealtimeSession,
  type SessionState,
  type Turn,
} from "../voice/realtimeSession";

export function VoicePage() {
  const [state, setState] = useState<SessionState>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<RealtimeSession | null>(null);

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [turns]);

  async function startSession() {
    if (sessionRef.current || state === "connecting") return;
    setError(null);
    const session = new RealtimeSession({
      onState: setState,
      onTranscript: setTurns,
      onError: setError,
    });
    sessionRef.current = session;
    try {
      await session.start();
      session.setMuted(false);
      setMuted(false);
    } catch {
      sessionRef.current = null;
      setMuted(true);
    }
  }

  function toggleMic() {
    if (!sessionRef.current) {
      void startSession();
      return;
    }
    setError(null);
    const next = !muted;
    setMuted(next);
    sessionRef.current.setMuted(next);
  }

  function clearTranscript() {
    sessionRef.current?.clearTranscript();
    setTurns([]);
  }

  let orbState: "idle" | "listening" | "thinking" | "speaking";
  if (state === "connecting" || state === "thinking") orbState = "thinking";
  else if (state === "speaking") orbState = "speaking";
  else orbState = muted ? "idle" : "listening";

  const stateLabel =
    state === "connecting"
      ? "Verbindung wird hergestellt…"
      : state === "speaking"
        ? "Jarvis spricht"
        : state === "thinking"
          ? "Jarvis denkt nach"
          : muted
            ? sessionRef.current
              ? "Tippen zum Sprechen"
              : "Tippen zum Starten"
            : "Jarvis hört zu";

  return (
    <div className="page page-enter">
      <div className="topbar">
        <div className="topbar-title">
          <span className="dot" />
          Jarvis · Sprache
        </div>
        <button
          className="topbar-action"
          onClick={() => setSheetOpen(true)}
          aria-label="Informationen zur Sprachfunktion"
        >
          <Icon name="info" size={18} />
        </button>
      </div>

      <div className="orb-stage">
        <div
          className="orb"
          data-state={orbState}
          onClick={toggleMic}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") toggleMic();
          }}
          role="button"
          tabIndex={0}
          aria-label={muted ? "Mikrofon starten" : "Mikrofon stummschalten"}
        >
          <div className="orb-pulse" />
          <div className="orb-pulse delay" />
          <div className="orb-rim" />
          <div className="orb-core" />
        </div>
      </div>

      <div className="voice-state">
        <div className={"orb-state-label " + (orbState === "idle" ? "idle" : "")}>
          <span className="live" />
          {stateLabel}
        </div>
        <div className={"waveform " + (muted ? "silent" : "")}>
          {Array.from({ length: 9 }).map((_, index) => (
            <span key={index} className="bar" />
          ))}
        </div>
      </div>

      {error && <div className="voice-error">{error}</div>}

      <div className="transcript" ref={transcriptRef}>
        {turns.length === 0 && state !== "connecting" && (
          <div className="voice-empty">
            Tippe auf den Orb und sprich mit Jarvis auf Deutsch.
          </div>
        )}
        {turns.map((turn) => (
          <div key={turn.id} className={"turn " + turn.role}>
            <div className="turn-meta">
              {turn.role === "user" ? "Du" : "Jarvis"}
              {!turn.done && " · …"}
            </div>
            <div className="turn-text">{turn.text}</div>
          </div>
        ))}
      </div>

      <div className="voice-controls">
        <button
          className={"icon-btn " + (!muted ? "active" : "")}
          onClick={toggleMic}
          disabled={state === "connecting"}
          aria-label={muted ? "Mikrofon einschalten" : "Mikrofon stummschalten"}
        >
          <Icon name={muted ? "mic-off" : "mic"} size={16} />
        </button>
        <div className="voice-connection">
          <span className={state === "connecting" ? "connecting" : !muted ? "live" : ""} />
          {state === "connecting"
            ? "Verbindet"
            : sessionRef.current
              ? muted
                ? "WebRTC · stumm"
                : "WebRTC · aktiv"
              : "Noch nicht gestartet"}
        </div>
        <button
          className="icon-btn"
          onClick={clearTranscript}
          disabled={turns.length === 0}
          aria-label="Verlauf löschen"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {sheetOpen && <VoiceInfo onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

function VoiceInfo({ onClose }: { onClose: () => void }) {
  return (
    <Fragment>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <h3>So funktioniert Sprache</h3>
        <p className="text-mute">
          Erst dein Tippen auf den Orb startet Mikrofon und Verbindung. Tippe
          erneut, um das Mikrofon stummzuschalten.
        </p>
        <h3>Datenschutz</h3>
        <p className="text-mute">
          Der OpenAI-Schlüssel bleibt im Backend. Dein Browser erhält nur einen
          kurzlebigen Schlüssel für diese Sprachsitzung.
        </p>
      </div>
    </Fragment>
  );
}
