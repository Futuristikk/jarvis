import { Fragment, useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import {
  RealtimeSession,
  type SessionState,
  type Turn,
} from "../voice/realtimeSession";

const STATE_LABEL: Record<SessionState, string> = {
  idle: "Tap to talk",
  connecting: "Connecting…",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

export function VoicePage() {
  const [state, setState] = useState<SessionState>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [muted, setMuted] = useState(false);
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

  const onOrbTap = async () => {
    setError(null);
    if (state === "idle") {
      const session = new RealtimeSession({
        onState: setState,
        onTranscript: setTurns,
        onError: (msg) => setError(msg),
      });
      sessionRef.current = session;
      try {
        await session.start();
      } catch {
        sessionRef.current = null;
      }
    } else {
      sessionRef.current?.stop();
      sessionRef.current = null;
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    sessionRef.current?.setMuted(next);
  };

  const clearTranscript = () => {
    sessionRef.current?.clearTranscript();
    setTurns([]);
  };

  const orbState =
    state === "connecting" ? "thinking" : state === "idle" ? "idle" : state;

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
        <div className="orb" data-state={orbState} onClick={onOrbTap}>
          <div className="orb-pulse" />
          <div className="orb-pulse delay" />
          <div className="orb-rim" />
          <div className="orb-core" />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div className={"orb-state-label " + (state === "idle" ? "idle" : "")}>
          <span className="live" />
          {STATE_LABEL[state]}
        </div>
        <div
          className={
            "waveform " +
            (state === "listening" || state === "speaking" ? "" : "silent")
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
        {turns.length === 0 && state === "idle" && (
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
            tap the orb to start a conversation
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
          className={"icon-btn " + (muted ? "active" : "")}
          onClick={toggleMute}
          disabled={state === "idle" || state === "connecting"}
          title={muted ? "Unmute" : "Mute"}
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
              background:
                state === "idle"
                  ? "var(--text-mute)"
                  : state === "connecting"
                    ? "var(--accent)"
                    : "var(--ok)",
            }}
          />
          {state === "idle"
            ? "disconnected"
            : state === "connecting"
              ? "connecting"
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
        <h3>What Jarvis knows right now</h3>
        <p
          className="text-mute"
          style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}
        >
          Voice chat is live, but Jarvis isn't yet wired into your vault or
          calendar. The agent has only its system prompt and the current time.
        </p>
        <h3>Next: tools</h3>
        <p
          className="text-mute"
          style={{ fontSize: 13, lineHeight: 1.5 }}
        >
          The next pass adds tool-calls so Jarvis can read scoped vault notes
          and check Google Calendar mid-conversation.
        </p>
      </div>
    </Fragment>
  );
}
