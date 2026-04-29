import { Fragment, useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import {
  RealtimeSession,
  type SessionState,
  type Turn,
} from "../voice/realtimeSession";

export function VoicePage() {
  const [state, setState] = useState<SessionState>("connecting");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<RealtimeSession | null>(null);

  // Auto-connect when the Voice page mounts; tear down on unmount so leaving
  // the tab fully releases the mic and the WebRTC peer connection.
  useEffect(() => {
    let disposed = false;
    const session = new RealtimeSession({
      onState: (s) => {
        if (!disposed) setState(s);
      },
      onTranscript: (t) => {
        if (!disposed) setTurns(t);
      },
      onError: (msg) => {
        if (!disposed) setError(msg);
      },
    });
    sessionRef.current = session;
    session.start().catch(() => {
      sessionRef.current = null;
    });
    return () => {
      disposed = true;
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [turns]);

  const toggleMic = () => {
    if (!sessionRef.current) return;
    setError(null);
    const next = !muted;
    setMuted(next);
    sessionRef.current.setMuted(next);
  };

  const clearTranscript = () => {
    sessionRef.current?.clearTranscript();
    setTurns([]);
  };

  // The agent's session state and the local mute state are orthogonal.
  // Compose them for display:
  //  - connecting → orb in "thinking" pulse
  //  - agent speaking/thinking → reflect agent state regardless of mic
  //  - otherwise → muted = "idle" visual, unmuted = "listening" (mic hot)
  let orbState: "idle" | "listening" | "thinking" | "speaking";
  if (state === "connecting") orbState = "thinking";
  else if (state === "speaking") orbState = "speaking";
  else if (state === "thinking") orbState = "thinking";
  else orbState = muted ? "idle" : "listening";

  let stateLabel: string;
  if (state === "connecting") stateLabel = "Connecting…";
  else if (state === "speaking") stateLabel = "Speaking";
  else if (state === "thinking") stateLabel = "Thinking";
  else if (muted) stateLabel = "Tap to talk";
  else stateLabel = "Listening";

  const connected = state !== "connecting";

  return (
    <div className="page page-enter">
      <div className="topbar">
        <div className="topbar-title">
          <span className="dot" />
          Jarvis · Voice
        </div>
        <button
          className="topbar-action"
          onClick={() => setSheetOpen(true)}
          title="Context"
        >
          <Icon name="info" size={18} />
        </button>
      </div>

      <div className="orb-stage">
        <div className="orb" data-state={orbState} onClick={toggleMic}>
          <div className="orb-pulse" />
          <div className="orb-pulse delay" />
          <div className="orb-rim" />
          <div className="orb-core" />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div className={"orb-state-label " + (orbState === "idle" ? "idle" : "")}>
          <span className="live" />
          {stateLabel}
        </div>
        <div
          className={
            "waveform " + (!muted && orbState !== "idle" ? "" : "silent")
          }
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="bar" />
          ))}
        </div>
      </div>

      {error && (
        <div
          style={{
            margin: "0 20px 8px",
            padding: "8px 12px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            background: "var(--bg-1)",
            color: "var(--danger)",
            fontFamily: "var(--mono)",
            fontSize: 11,
          }}
        >
          {error}
        </div>
      )}

      <div className="transcript" ref={transcriptRef}>
        {turns.length === 0 && state !== "connecting" && (
          <div
            style={{
              color: "var(--text-mute)",
              fontFamily: "var(--mono)",
              fontSize: 11,
              padding: "20px 0",
              textAlign: "center",
              letterSpacing: "0.04em",
            }}
          >
            tap the orb to open the mic · tap again to mute
          </div>
        )}
        {turns.map((t) => (
          <div key={t.id} className={"turn " + t.role}>
            <div className="turn-meta">
              {t.role === "user" ? "you" : "jarvis"}
              {!t.done && " · …"}
            </div>
            <div className="turn-text">{t.text}</div>
          </div>
        ))}
      </div>

      <div className="voice-controls">
        <button
          className={"icon-btn " + (!muted ? "active" : "")}
          onClick={toggleMic}
          disabled={!connected}
          title={muted ? "Open mic" : "Mute"}
        >
          <Icon name={muted ? "mic-off" : "mic"} size={16} />
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--text-mute)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: !connected
                ? "var(--accent)"
                : muted
                  ? "var(--text-mute)"
                  : "var(--ok)",
            }}
          />
          {!connected
            ? "connecting"
            : muted
              ? "WebRTC · muted"
              : "WebRTC · live"}
        </div>
        <button
          className="icon-btn"
          onClick={clearTranscript}
          disabled={turns.length === 0}
          title="Clear transcript"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {sheetOpen && <ContextSheet onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

function ContextSheet({ onClose }: { onClose: () => void }) {
  return (
    <Fragment>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <h3>How voice works</h3>
        <p
          className="text-mute"
          style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}
        >
          The connection opens automatically when you land on this tab. Tap
          the orb to open the mic, tap again to mute. Jarvis only "hears" you
          while the mic is open, so ambient noise won't interrupt his replies.
        </p>
        <h3>What he knows</h3>
        <p
          className="text-mute"
          style={{ fontSize: 13, lineHeight: 1.5 }}
        >
          The current time, your vault scope list, and (when you ask about
          one) the canonical notes inside that scope. Calendar awareness
          comes next.
        </p>
      </div>
    </Fragment>
  );
}
