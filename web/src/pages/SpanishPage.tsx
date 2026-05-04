import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { getRealtimeInstructions } from "../api";
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
  // activeMs of audible speech per agent item, fed by the analyser tap on
  // the remote MediaStream. Used to drive the karaoke cursor in lockstep
  // with the audio actually coming out of the speaker.
  const [audioMsByTurn, setAudioMsByTurn] = useState<Record<string, number>>({});
  const sessionRef = useRef<RealtimeSession | null>(null);

  // Initial level/scenario captured at mount so the first session is minted
  // with whatever's selected. Changes after mount are pushed via
  // `session.update` (below) so the WebRTC session — and the karaoke state —
  // survive level/scenario swaps without a reconnect.
  const initialOptsRef = useRef({ level, scenario });

  useEffect(() => {
    let disposed = false;
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
        onAudioPulse: (itemId, ms) => {
          if (disposed) return;
          setAudioMsByTurn((prev) =>
            prev[itemId] === ms ? prev : { ...prev, [itemId]: ms },
          );
        },
      },
      {
        mode: "spanish",
        level: initialOptsRef.current.level,
        scenario: initialOptsRef.current.scenario,
      },
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
  }, []);

  // After mount, push level/scenario changes as a `session.update` over the
  // open data channel — connection stays open, transcript stays intact, and
  // the agent's next reply uses the new instructions.
  const skipFirstUpdateRef = useRef(true);
  useEffect(() => {
    if (skipFirstUpdateRef.current) {
      skipFirstUpdateRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getRealtimeInstructions({
          mode: "spanish",
          level,
          scenario,
        });
        if (!cancelled) sessionRef.current?.updateInstructions(res.instructions);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
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

  // Karaoke pacing.
  //
  // Primary: an AnalyserNode tap on the remote MediaStream (in
  // RealtimeSession) emits `onAudioPulse(itemId, activeMs)` ~20×/sec while
  // the agent is *audibly* speaking. Cursor = floor(activeMs / PER_WORD),
  // capped at received word count. This pauses the cursor during the
  // agent's natural between-word silences and stays locked to the actual
  // audio coming out of the speaker — sidestepping the WebRTC jitter
  // buffer and the absence of any audio↔text alignment events in the
  // OpenAI Realtime API.
  //
  // Fallback: if no pulse has arrived for the current turn within ~700ms
  // of the agent starting (e.g. analyser graph blocked, AudioContext
  // suspended on iOS), drift the cursor on a steady timer so the line
  // still moves.
  //
  // Tune for cursor tempo within active speech.
  const PACE_MS_PER_WORD = 320;
  const FALLBACK_DELAY_MS = 700;
  const FALLBACK_PACE_MS = 430;

  const allWords = useMemo(
    () => (currentAgent ? currentAgent.text.split(/\s+/).filter(Boolean) : []),
    [currentAgent?.text],
  );

  const [fallbackCursor, setFallbackCursor] = useState(0);
  const cursorTurnRef = useRef<string | null>(null);
  const turnAppearedAtRef = useRef<number>(0);

  // Reset whenever a new agent turn begins.
  useEffect(() => {
    if (currentAgent?.id !== cursorTurnRef.current) {
      cursorTurnRef.current = currentAgent?.id ?? null;
      turnAppearedAtRef.current = performance.now();
      setFallbackCursor(0);
    }
  }, [currentAgent?.id]);

  // Audio-driven cursor (preferred).
  const audioMs = currentAgent ? audioMsByTurn[currentAgent.id] : undefined;
  const audioCursor =
    audioMs !== undefined
      ? Math.min(Math.floor(audioMs / PACE_MS_PER_WORD), allWords.length)
      : null;

  // Fallback timer: only ticks once we've waited past FALLBACK_DELAY_MS
  // without any pulse data — otherwise the audio cursor takes over.
  useEffect(() => {
    if (!currentAgent) return;
    if (audioCursor !== null) return;
    if (fallbackCursor >= allWords.length) return;
    const sinceTurn = performance.now() - turnAppearedAtRef.current;
    const wait = Math.max(FALLBACK_PACE_MS, FALLBACK_DELAY_MS - sinceTurn);
    const id = setTimeout(() => {
      setFallbackCursor((c) => Math.min(c + 1, allWords.length));
    }, wait);
    return () => clearTimeout(id);
  }, [fallbackCursor, allWords.length, currentAgent?.id, audioCursor]);

  const cursor = audioCursor ?? fallbackCursor;

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

      <div className="orb-stage" style={{ padding: "12px 0 4px" }}>
        <div
          className="orb"
          data-state={orbState}
          onClick={toggleMic}
          style={{ ["--size" as string]: "150px" } as React.CSSProperties}
        >
          <div className="orb-pulse" />
          <div className="orb-pulse delay" />
          <div className="orb-rim" />
          <div className="orb-core" />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <div className={"orb-state-label " + (orbState === "idle" ? "idle" : "")}>
          <span className="live" />
          {stateLabel}
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
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--text-mute)",
            justifyContent: "center",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            paddingTop: 4,
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
