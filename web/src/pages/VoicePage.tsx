import { Fragment, useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";

type OrbState = "idle" | "listening" | "thinking" | "speaking";

type Scope = { id: string; label: string; group: string };

type Turn = { role: "user" | "agent"; time: string; text: string };

const SCOPES: Scope[] = [
  { id: "projects/saildock", label: "Projects/SailDock", group: "projects" },
  { id: "knowledge/finance", label: "Knowledge/Finance", group: "knowledge" },
  { id: "knowledge/spanish", label: "Knowledge/Spanish", group: "knowledge" },
  { id: "admin/personal", label: "Admin/Personal", group: "admin" },
  { id: "projects/jarvis", label: "Projects/Jarvis", group: "projects" },
  { id: "knowledge/sailing", label: "Knowledge/Sailing", group: "knowledge" },
];

const TRANSCRIPT_DEMO: Turn[] = [
  {
    role: "user",
    time: "10:42:11",
    text: "What's on my calendar this afternoon, and is there anything from the SailDock notes I should review before the 3pm?",
  },
  {
    role: "agent",
    time: "10:42:14",
    text:
      "You have two things this afternoon. At 3pm, SailDock weekly with Maya — the agenda doc lists rigging supplier shortlist as the open item. At 4:30, dentist. Before the SailDock call, your last research note flagged Selden vs Z-Spar pricing as the unresolved thread; I can pull it up.",
  },
  {
    role: "user",
    time: "10:42:33",
    text: "Yeah pull it up, and remind me what we decided about the carbon mast option.",
  },
];

const STATE_LABEL: Record<OrbState, string> = {
  idle: "Tap to talk",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

const STATE_SEQ: Record<Exclude<OrbState, "idle">, [OrbState, number]> = {
  listening: ["thinking", 1800],
  thinking: ["speaking", 1400],
  speaking: ["idle", 3200],
};

export function VoicePage() {
  const [state, setState] = useState<OrbState>("idle");
  const [activeScopes, setActiveScopes] = useState<string[]>([
    "projects/saildock",
    "knowledge/sailing",
  ]);
  const [calendarOn, setCalendarOn] = useState(true);
  const [muted, setMuted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>(TRANSCRIPT_DEMO);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state === "idle") return;
    const [next, ms] = STATE_SEQ[state];
    const t = setTimeout(() => setState(next), ms);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [turns]);

  const toggleScope = (id: string) => {
    setActiveScopes((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const onOrbTap = () => {
    setState((s) => (s === "idle" ? "listening" : "idle"));
  };

  const activeCount = activeScopes.length + (calendarOn ? 1 : 0);

  return (
    <div className="page page-enter">
      <div className="topbar">
        <div className="topbar-title">
          <span className="dot" />
          Jarvis · Voice
        </div>
        <button className="topbar-action" onClick={() => setSheetOpen(true)} title="Context">
          <Icon name="info" size={18} />
        </button>
      </div>

      <div className="scope-row">
        <button
          className={"pill " + (calendarOn ? "active" : "")}
          onClick={() => setCalendarOn(!calendarOn)}
          title="Google Calendar"
        >
          <Icon name="calendar" size={11} stroke={2} />
          Calendar · today
        </button>
        {SCOPES.slice(0, 5).map((s) => (
          <button
            key={s.id}
            className={"pill " + (activeScopes.includes(s.id) ? "active" : "")}
            onClick={() => toggleScope(s.id)}
          >
            {s.label}
          </button>
        ))}
        <button className="pill muted" onClick={() => setSheetOpen(true)}>
          <Icon name="plus" size={11} stroke={2.2} />
          {activeCount} active
        </button>
      </div>

      <div className="orb-stage">
        <div className="orb" data-state={state} onClick={onOrbTap}>
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
            "waveform " + (state === "listening" || state === "speaking" ? "" : "silent")
          }
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="bar" />
          ))}
        </div>
      </div>

      <div className="transcript" ref={transcriptRef}>
        {turns.map((t, i) => (
          <div key={i} className={"turn " + t.role}>
            <div className="turn-meta">
              {t.role === "user" ? "you" : "jarvis"} · {t.time}
            </div>
            <div className="turn-text">{t.text}</div>
          </div>
        ))}
        {state === "thinking" && (
          <div className="turn agent">
            <div className="turn-meta">jarvis · thinking</div>
            <div className="turn-text text-mute">
              <span className="mono">…</span> reading 4 notes from{" "}
              <span style={{ color: "var(--accent)" }}>Projects/SailDock</span>
            </div>
          </div>
        )}
      </div>

      <div className="voice-controls">
        <button
          className={"icon-btn " + (muted ? "active" : "")}
          onClick={() => setMuted(!muted)}
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
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ok)" }} />
          WebRTC · 32ms
        </div>
        <button className="icon-btn" onClick={() => setTurns([])} title="Clear">
          <Icon name="x" size={16} />
        </button>
      </div>

      {sheetOpen && (
        <ContextSheet
          onClose={() => setSheetOpen(false)}
          activeScopes={activeScopes}
          toggleScope={toggleScope}
          calendarOn={calendarOn}
          setCalendarOn={setCalendarOn}
        />
      )}
    </div>
  );
}

type ContextSheetProps = {
  onClose: () => void;
  activeScopes: string[];
  toggleScope: (id: string) => void;
  calendarOn: boolean;
  setCalendarOn: (v: boolean) => void;
};

function ContextSheet({
  onClose,
  activeScopes,
  toggleScope,
  calendarOn,
  setCalendarOn,
}: ContextSheetProps) {
  return (
    <Fragment>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <h3>What Jarvis knows right now</h3>

        <h3>Calendar</h3>
        <div style={{ marginBottom: 8 }}>
          <button
            className={"pill " + (calendarOn ? "active" : "")}
            onClick={() => setCalendarOn(!calendarOn)}
          >
            <Icon name="calendar" size={11} stroke={2} />
            Google Calendar · today
          </button>
        </div>
        {calendarOn && (
          <Fragment>
            <div className="calendar-card">
              <div className="time">15:00–15:45</div>
              <div>
                <div className="ev-title">SailDock weekly · Maya</div>
                <div className="ev-meta">meet.google.com</div>
              </div>
            </div>
            <div className="calendar-card">
              <div className="time">16:30–17:15</div>
              <div>
                <div className="ev-title">Dentist — cleaning</div>
                <div className="ev-meta">Calle Aribau 220</div>
              </div>
            </div>
          </Fragment>
        )}

        <h3>Vault scopes</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {SCOPES.map((s) => (
            <button
              key={s.id}
              className={"pill " + (activeScopes.includes(s.id) ? "active" : "")}
              onClick={() => toggleScope(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <h3>Recent research surfaced</h3>
        <div className="context-research">
          <p className="cr-title">Carbon vs aluminum mast — Selden vs Z-Spar pricing</p>
          <div className="cr-meta">2d ago · 11 sources · Projects/SailDock</div>
        </div>
        <div className="context-research">
          <p className="cr-title">Spanish autónomo registration — IAE codes shortlist</p>
          <div className="cr-meta">5d ago · 7 sources · Admin/Personal</div>
        </div>
      </div>
    </Fragment>
  );
}
