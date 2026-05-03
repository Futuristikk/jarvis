import {
  executeVoiceTool,
  getRealtimeToken,
  type RealtimeOptions,
} from "../api";

export type SessionState = "idle" | "connecting" | "listening" | "thinking" | "speaking";

export type Turn = {
  id: string;
  role: "user" | "agent";
  text: string;
  done: boolean;
};

export type SessionEvents = {
  onState: (s: SessionState) => void;
  onTranscript: (turns: Turn[]) => void;
  onError: (msg: string) => void;
};

type ServerEvent = {
  type: string;
  // Common shapes — only the keys we care about.
  item_id?: string;
  response_id?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string };
  [k: string]: unknown;
};

export class RealtimeSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private turns: Turn[] = [];
  private state: SessionState = "idle";
  private events: SessionEvents;
  private opts: RealtimeOptions;
  // Tool calls collected during a response; flushed on response.done so we
  // never race the response state machine.
  private pendingToolCalls: Array<{
    callId: string;
    name: string;
    args: string;
  }> = [];

  constructor(events: SessionEvents, opts: RealtimeOptions = {}) {
    this.events = events;
    this.opts = opts;
  }

  async start() {
    this.setState("connecting");
    try {
      const session = await getRealtimeToken(this.opts);
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mic = mic;

      const pc = new RTCPeerConnection();
      this.pc = pc;

      // Remote audio playback. The element is created on the fly; iOS Safari
      // requires it to be attached to the DOM and `playsInline` for autoplay
      // to behave on the home-screen PWA.
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.setAttribute("playsinline", "");
      audioEl.style.display = "none";
      document.body.appendChild(audioEl);
      this.audioEl = audioEl;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
        // iOS Safari (esp. PWA mode) sometimes ignores autoplay even after
        // a user gesture; calling play() explicitly here is harmless on
        // platforms where it isn't needed.
        audioEl.play().catch(() => {
          /* ignore — autoplay may still kick in */
        });
      };

      for (const track of mic.getTracks()) pc.addTrack(track, mic);
      // Start muted — push-to-talk style. UI tap unmutes when user is ready.
      mic.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });

      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;
      dc.onmessage = (e) => this.handleServerEvent(e.data);
      // Connection is live; agent will only "hear" us when the mic is unmuted.
      dc.onopen = () => this.setState("idle");

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(
        `https://api.openai.com/v1/realtime?model=${session.model}`,
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${session.token}`,
            "Content-Type": "application/sdp",
          },
        },
      );
      if (!sdpRes.ok) {
        throw new Error(
          `OpenAI SDP exchange failed: ${sdpRes.status} ${await sdpRes.text().catch(() => "")}`,
        );
      }

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (err) {
      this.events.onError(err instanceof Error ? err.message : String(err));
      this.stop();
      throw err;
    }
  }

  stop() {
    try {
      this.dc?.close();
    } catch {
      // ignore
    }
    try {
      this.pc?.close();
    } catch {
      // ignore
    }
    this.mic?.getTracks().forEach((t) => t.stop());
    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl.remove();
    }
    this.pc = null;
    this.dc = null;
    this.mic = null;
    this.audioEl = null;
    this.setState("idle");
  }

  setMuted(muted: boolean) {
    this.mic?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }

  clearTranscript() {
    this.turns = [];
    this.events.onTranscript([]);
  }

  private setState(s: SessionState) {
    this.state = s;
    this.events.onState(s);
  }

  private handleServerEvent(raw: unknown) {
    let evt: ServerEvent;
    try {
      evt = typeof raw === "string" ? JSON.parse(raw) : (raw as ServerEvent);
    } catch {
      return;
    }

    switch (evt.type) {
      case "input_audio_buffer.speech_started":
        // user mic captured speech start. Move out of speaking → listening.
        this.setState("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        // committed; model will respond next.
        this.setState("thinking");
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const text = String(evt.transcript ?? "").trim();
        if (text) this.appendTurn(String(evt.item_id ?? cryptoId()), "user", text, true);
        break;
      }
      case "response.created":
        // Stay in thinking until we hear audio start.
        break;
      // Audio-output events have shifted names across API versions; accept any.
      case "response.audio.delta":
      case "response.audio.done":
      case "response.output_audio.delta":
      case "response.output_audio.done":
      case "response.output_audio_buffer.started":
        if (this.state !== "speaking") this.setState("speaking");
        break;
      case "response.audio_transcript.delta": {
        const delta = String(evt.delta ?? "");
        const itemId = String(evt.item_id ?? "");
        if (delta && itemId) this.appendDelta(itemId, "agent", delta);
        break;
      }
      case "response.audio_transcript.done": {
        const text = String(evt.transcript ?? "").trim();
        const itemId = String(evt.item_id ?? "");
        if (text && itemId) this.replaceTurn(itemId, "agent", text, true);
        break;
      }
      case "response.function_call_arguments.done": {
        const callId = String(evt.call_id ?? "");
        const name = String(evt.name ?? "");
        const args = String(evt.arguments ?? "{}");
        if (callId && name) this.pendingToolCalls.push({ callId, name, args });
        break;
      }
      case "response.done":
        if (this.pendingToolCalls.length > 0) {
          // fire and forget — flushPendingTools sends events back through dc
          // and triggers a new response.create when results land.
          void this.flushPendingTools();
        } else {
          // agent done speaking — back to idle. UI shows "Listening" if mic
          // is unmuted, "Tap to talk" if muted.
          this.setState("idle");
        }
        break;
      case "error": {
        const msg = evt.error?.message ?? "unknown realtime error";
        this.events.onError(msg);
        break;
      }
      default:
        break;
    }
  }

  private async flushPendingTools() {
    if (!this.dc || this.dc.readyState !== "open") {
      this.pendingToolCalls = [];
      this.setState("idle");
      return;
    }
    const batch = this.pendingToolCalls.splice(0);
    // Stay in thinking while tool executes.
    this.setState("thinking");
    for (const call of batch) {
      let output: string;
      try {
        const args = JSON.parse(call.args || "{}") as Record<string, unknown>;
        const res = await executeVoiceTool(call.name, args);
        output = res.output;
      } catch (err) {
        output = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
      }
      this.dc.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.callId,
            output,
          },
        }),
      );
    }
    // Ask the model to continue now that tool outputs are in scope.
    this.dc.send(JSON.stringify({ type: "response.create" }));
  }

  private appendTurn(id: string, role: Turn["role"], text: string, done: boolean) {
    const existing = this.turns.find((t) => t.id === id);
    if (existing) {
      existing.text = text;
      existing.done = done;
    } else {
      this.turns.push({ id, role, text, done });
    }
    this.events.onTranscript([...this.turns]);
  }

  private appendDelta(id: string, role: Turn["role"], delta: string) {
    const existing = this.turns.find((t) => t.id === id);
    if (existing) {
      existing.text += delta;
    } else {
      this.turns.push({ id, role, text: delta, done: false });
    }
    this.events.onTranscript([...this.turns]);
  }

  private replaceTurn(id: string, role: Turn["role"], text: string, done: boolean) {
    const existing = this.turns.find((t) => t.id === id);
    if (existing) {
      existing.text = text;
      existing.done = done;
    } else {
      this.turns.push({ id, role, text, done });
    }
    this.events.onTranscript([...this.turns]);
  }
}

function cryptoId(): string {
  return `id-${Math.random().toString(36).slice(2, 10)}`;
}
