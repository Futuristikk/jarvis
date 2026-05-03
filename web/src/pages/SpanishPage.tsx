import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import {
  RealtimeSession,
  type SessionState,
  type Turn,
} from "../voice/realtimeSession";

const LEVELS = ["A2", "B1", "B2", "C1"] as const;
type Level = (typeof LEVELS)[number];

const SCENARIOS = ["Café · casual", "Bureaucracy", "Doctor"] as const;
type Scenario = (typeof SCENARIOS)[number];

const SAVED_VOCAB = [
  { es: "chiringuito", en: "beach bar" },
  { es: "precioso", en: "beautiful" },
  { es: "el fin de semana", en: "the weekend" },
  { es: "autónomo", en: "self-employed" },
  { es: "empadronarse", en: "register at city hall" },
];

export function SpanishPage() {
  const [level, setLevel] = useState<Level>("B1");
  const [scenario, setScenario] = useState<Scenario>("Café · casual");
  const [state, setState] = useState<SessionState>("connecting");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<RealtimeSession | null>(null);

  // Re-mint the session whenever the tutor mode parameters change so the new
  // prompt takes effect. This is heavier than a `session.update` over the data
  // channel but keeps the wiring obvious — the agent's instructions always
  // match the pills you see.
  useEffect(() => {
    let disposed = false;
    setError(null);
    setTurns([]);
    setMuted(true);

    const session = new RealtimeSession(
      {
        onState: (s) => {
          if (!disposed) setState(s);
        },
        onTranscript: (t) => {
          if (!disposed) setTurns(t);
        },
        onError: (msg) => {
          if (!disposed) setError(msg);
        },
      },
      { mode: "spanish", level, scenario },
    );
    sessionRef.current = session;
    session.start().catch(() => {
      sessionRef.current = null;
    });

    return () => {
      disposed = true;
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, [level, scenario]);

  const toggleMic = () => {
    if (!sessionRef.current) return;
    setError(null);
    const next = !muted;
    setMuted(next);
    sessionRef.current.setMuted(next);
  };

  // Pick the agent turn to karaoke-highlight: the latest agent turn we've
  // received any text for. Show up to two prior turns as faded history.
  const { currentAgent, pastTurns } = useMemo(() => {
    let agentIdx = -1;
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].role === "agent" && turns[i].text.length > 0) {
        agentIdx = i;
        break;
      }
    }
    const past =
      agentIdx >= 0
        ? turns.slice(Math.max(0, agentIdx - 2), agentIdx)
        : turns.slice(-2);
    return {
      currentAgent: agentIdx >= 0 ? turns[agentIdx] : null,
      pastTurns: past,
    };
  }, [turns]);

  // Most recent user turn — when the agent hasn't replied yet, surface it
  // as the live line so the user sees their transcription land.
  const liveUser =
    currentAgent === null
      ? [...turns].reverse().find((t) => t.role === "user") ?? null
      : null;

  // Karaoke pacing. OpenAI Realtime emits transcript deltas faster than the
  // audio is actually spoken — the text bursts in, the audio plays at speech
  // rate. Without per-word timing, we advance the highlight cursor on a
  // fixed cadence (~280ms/word ≈ natural casual Spanish) instead of jumping
  // to the latest delta. Once the transcript is finalized we speed up so the
  // cursor can catch up if it's behind by a few words.
  //
  // See: OpenAI realtime API has no per-token timestamps on
  // response.audio_transcript.delta, and no audio↔text alignment events
  // (community-confirmed open limitation).
  const PACE_MS_LIVE = 280;
  const PACE_MS_DONE = 110;

  const allWords = useMemo(
    () => (currentAgent ? currentAgent.text.split(/\s+/).filter(Boolean) : []),
    [currentAgent?.text],
  );

  const [cursor, setCursor] = useState(0);
  const cursorTurnRef = useRef<string | null>(null);

  // Reset the cursor whenever a new agent turn begins.
  useEffect(() => {
    if (currentAgent?.id !== cursorTurnRef.current) {
      cursorTurnRef.current = currentAgent?.id ?? null;
      setCursor(0);
    }
  }, [currentAgent?.id]);

  // Tick the cursor forward toward the latest received word count.
  useEffect(() => {
    if (!currentAgent) return;
    if (cursor >= allWords.length) return;
    const pace = currentAgent.done ? PACE_MS_DONE : PACE_MS_LIVE;
    const id = setTimeout(() => {
      setCursor((c) => Math.min(c + 1, allWords.length));
    }, pace);
    return () => clearTimeout(id);
  }, [cursor, allWords.length, currentAgent?.done, currentAgent?.id]);

  let orbState: "idle" | "listening" | "thinking" | "speaking";
  if (state === "connecting") orbState = "thinking";
  else if (state === "speaking") orbState = "speaking";
  else if (state === "thinking") orbState = "thinking";
  else orbState = muted ? "idle" : "listening";

  let stateLabel: string;
  if (state === "connecting") stateLabel = "Connecting…";
  else if (state === "speaking") stateLabel = "Jarvis · es-ES";
  else if (state === "thinking") stateLabel = "Pensando…";
  else if (muted) stateLabel = "Tap orb to talk";
  else stateLabel = "Te escucho…";

  const connected = state !== "connecting";

  return (
    <div className="page page-enter">
      <div className="topbar">
        <div className="topbar-title">
          <span className="dot" />
          Spanish · Tutor
        </div>
        <button
          className="topbar-action"
          onClick={() => sessionRef.current?.clearTranscript()}
          title="Clear transcript"
        >
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="scope-row">
        {LEVELS.map((l) => (
          <button
            key={l}
            className={"pill " + (level === l ? "active" : "")}
            onClick={() => setLevel(l)}
            style={{ minWidth: 38, justifyContent: "center" }}
          >
            {l}
          </button>
        ))}
        <div
          style={{
            width: 1,
            alignSelf: "stretch",
            background: "var(--line)",
            margin: "4px 4px",
          }}
        />
        {SCENARIOS.map((s) => (
          <button
            key={s}
            className={"pill " + (scenario === s ? "active" : "muted")}
            onClick={() => setScenario(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="orb-stage" style={{ padding: "8px 0 0" }}>
        <div
          className="orb"
          data-state={orbState}
          onClick={toggleMic}
          style={{ ["--size" as string]: "120px" } as React.CSSProperties}
        >
          <div className="orb-rim" />
          <div className="orb-core" />
        </div>
      </div>

      {error && (
        <div
          style={{
            margin: "4px 20px 0",
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

      <div className="karaoke">
        {pastTurns.length > 0 && (
          <div className="karaoke-history">
            {pastTurns.map((t) => (
              <div key={t.id} className="past">
                {t.role === "user" ? "· " : ""}
                {t.text}
              </div>
            ))}
          </div>
        )}

        <div
          className={
            "karaoke-side " +
            ((currentAgent ?? liveUser)?.role === "user" ? "user" : "")
          }
        >
          <span className="live" />
          {stateLabel}
        </div>

        {currentAgent ? (
          <KaraokeLine
            words={allWords}
            cursor={cursor}
            done={currentAgent.done}
          />
        ) : liveUser ? (
          <div className="karaoke-line user">{liveUser.text}</div>
        ) : (
          <div
            className="karaoke-line"
            style={{ color: "var(--text-mute)", fontSize: 22 }}
          >
            {connected
              ? "Tap the orb and say something en español."
              : "Conectando…"}
          </div>
        )}
      </div>

      <div className="spanish-footer">
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <div
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--text-mute)",
            }}
          >
            Saved · Knowledge/Spanish
          </div>
          <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 11 }}>
            <Icon name="bookmark" size={12} /> Save current
          </button>
        </div>

        <div className="saved-words">
          {SAVED_VOCAB.map((v, i) => (
            <div key={i} className="word-chip">
              <strong>{v.es}</strong>{" "}
              <span style={{ color: "var(--text-mute)" }}>· {v.en}</span>
            </div>
          ))}
        </div>

        <div
          style={{ display: "flex", gap: 8, justifyContent: "space-between", paddingTop: 4 }}
        >
          <button
            className={"icon-btn " + (!muted ? "active" : "")}
            onClick={toggleMic}
            disabled={!connected}
            title={muted ? "Open mic" : "Mute"}
          >
            <Icon name={muted ? "mic-off" : "mic"} size={14} />
          </button>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: "var(--text-mute)",
              justifyContent: "center",
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
                ? `${level} · ${scenario}`
                : `${level} · live`}
          </div>
          <button
            className="icon-btn"
            onClick={() => sessionRef.current?.clearTranscript()}
            disabled={turns.length === 0}
            title="Clear"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Karaoke line. The full received transcript is rendered; the `cursor`
 * (paced by SpanishPage) drives which word is "active". Words at indices
 * < cursor are "spoken" (white), the word at cursor is "active" (orange),
 * and words ahead of the cursor are unstyled (muted) — so they read like
 * upcoming lyrics until the cursor reaches them.
 */
function KaraokeLine({
  words,
  cursor,
  done,
}: {
  words: string[];
  cursor: number;
  done: boolean;
}) {
  const allDone = done && cursor >= words.length;
  return (
    <div className="karaoke-line">
      {words.map((w, i) => {
        const spoken = allDone || i < cursor;
        const active = !allDone && i === cursor;
        return (
          <Fragment key={i}>
            <span
              className={
                "word " + (spoken ? "spoken " : "") + (active ? "active " : "")
              }
            >
              {w}
            </span>
            {i < words.length - 1 ? " " : ""}
          </Fragment>
        );
      })}
    </div>
  );
}
