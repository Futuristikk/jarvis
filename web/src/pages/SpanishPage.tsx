import { Fragment, useEffect, useState } from "react";
import { Icon } from "../components/Icon";

type Turn = { role: "agent" | "user"; words: string[]; translation: string };

const DIALOGUE: Turn[] = [
  {
    role: "agent",
    words: ["Buenos", "días.", "¿Qué", "tal", "el", "fin", "de", "semana", "en", "la", "playa?"],
    translation: "Good morning. How was the weekend at the beach?",
  },
  {
    role: "user",
    words: ["Muy", "bien,", "fuimos", "a", "Sitges", "el", "sábado."],
    translation: "Very good, we went to Sitges on Saturday.",
  },
  {
    role: "agent",
    words: ["¡Qué", "bien!", "Sitges", "es", "precioso.", "¿Hicisteis", "algo", "especial?"],
    translation: "How nice! Sitges is beautiful. Did you do anything special?",
  },
  {
    role: "user",
    words: ["Comimos", "paella", "en", "un", "chiringuito."],
    translation: "We had paella at a beach bar.",
  },
];

const SAVED_VOCAB = [
  { es: "chiringuito", en: "beach bar" },
  { es: "precioso", en: "beautiful" },
  { es: "el fin de semana", en: "the weekend" },
  { es: "autónomo", en: "self-employed" },
  { es: "empadronarse", en: "register at city hall" },
];

const LEVELS = ["A2", "B1", "B2", "C1"] as const;
type Level = (typeof LEVELS)[number];

export function SpanishPage() {
  const [turnIdx, setTurnIdx] = useState(0);
  const [wordIdx, setWordIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);
  const [level, setLevel] = useState<Level>("B1");

  const turn = DIALOGUE[turnIdx];

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(
      () => {
        if (wordIdx < turn.words.length - 1) {
          setWordIdx(wordIdx + 1);
        } else {
          setTimeout(() => {
            setWordIdx(0);
            setTurnIdx((i) => (i + 1) % DIALOGUE.length);
          }, 900);
        }
      },
      turn.role === "agent" ? 380 : 420,
    );
    return () => clearTimeout(t);
  }, [wordIdx, turnIdx, playing, turn.role, turn.words.length]);

  const past: string[] = [];
  for (let i = Math.max(0, turnIdx - 2); i < turnIdx; i++) {
    past.push(DIALOGUE[i].words.join(" "));
  }

  return (
    <div className="page page-enter">
      <div className="topbar">
        <div className="topbar-title">
          <span className="dot" />
          Spanish · Tutor
        </div>
        <button
          className="topbar-action"
          onClick={() => setShowTranslation((s) => !s)}
          title="Toggle translation"
          style={{ color: showTranslation ? "var(--accent)" : "var(--text-dim)" }}
        >
          <Icon name="captions" size={18} />
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
        <button className="pill active">Café · casual</button>
        <button className="pill muted">Bureaucracy</button>
        <button className="pill muted">Doctor</button>
      </div>

      <div className="orb-stage" style={{ padding: "8px 0 0" }}>
        <div
          className="orb"
          data-state={turn.role === "agent" ? "speaking" : "listening"}
          style={{ ["--size" as string]: "120px" } as React.CSSProperties}
        >
          <div className="orb-rim" />
          <div className="orb-core" />
        </div>
      </div>

      <div className="karaoke">
        {past.length > 0 && (
          <div className="karaoke-history">
            {past.map((p, i) => (
              <div key={i} className="past">
                {p}
              </div>
            ))}
          </div>
        )}

        <div className={"karaoke-side " + (turn.role === "user" ? "user" : "")}>
          <span className="live" />
          {turn.role === "agent" ? "Jarvis · es-ES" : "You · es-ES"}
        </div>

        <div className={"karaoke-line " + (turn.role === "user" ? "user" : "")}>
          {turn.words.map((w, i) => (
            <Fragment key={i}>
              <span
                className={
                  "word " +
                  (i < wordIdx ? "spoken " : "") +
                  (i === wordIdx ? "active " : "")
                }
              >
                {w}
              </span>
              {i < turn.words.length - 1 ? " " : ""}
            </Fragment>
          ))}
        </div>

        {showTranslation && <div className="karaoke-translation">{turn.translation}</div>}

        {turn.role === "user" && turnIdx === 1 && wordIdx >= 4 && (
          <div
            style={{
              marginTop: 14,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px dashed var(--line-2)",
              background: "var(--bg-1)",
              fontSize: 12,
              fontFamily: "var(--mono)",
              color: "var(--text-mute)",
              maxWidth: 320,
            }}
          >
            <span style={{ color: "var(--text-mute)" }}>you said </span>
            <span style={{ color: "var(--danger)" }}>“sí-tjes”</span>
            <span> · target </span>
            <span style={{ color: "var(--accent)" }}>“síd-jes”</span>
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
            className="icon-btn"
            onClick={() => setPlaying(!playing)}
            title={playing ? "Pause" : "Play"}
          >
            <Icon name={playing ? "pause" : "play"} size={14} />
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
              style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ok)" }}
            />
            Realtime · 12:14 session
          </div>
          <button className="icon-btn" title="Mic">
            <Icon name="mic" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
