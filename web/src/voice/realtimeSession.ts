import { executeVoiceTool, getRealtimeToken } from "../api";

export type SessionState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking";

export type Turn = {
  id: string;
  role: "user" | "agent";
  text: string;
  done: boolean;
};

export type SessionEvents = {
  onState: (state: SessionState) => void;
  onTranscript: (turns: Turn[]) => void;
  onError: (message: string) => void;
};

type ServerEvent = {
  type: string;
  item_id?: string;
  delta?: string;
  transcript?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  error?: { message?: string };
};

export class RealtimeSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private turns: Turn[] = [];
  private state: SessionState = "idle";
  private pendingToolCalls: Array<{
    callId: string;
    name: string;
    args: string;
  }> = [];

  constructor(private readonly events: SessionEvents) {}

  async start() {
    this.setState("connecting");
    try {
      const clientSecret = await getRealtimeToken();
      const mic = await this.requestMicrophone();
      this.mic = mic;

      const pc = new RTCPeerConnection();
      this.pc = pc;
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.setAttribute("playsinline", "");
      audioEl.style.display = "none";
      document.body.appendChild(audioEl);
      this.audioEl = audioEl;

      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0];
        void audioEl.play().catch(() => undefined);
      };
      for (const track of mic.getTracks()) pc.addTrack(track, mic);
      mic.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });

      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;
      dc.onmessage = (event) => this.handleServerEvent(event.data);
      dc.onopen = () => this.setState("idle");

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!offer.sdp) throw new Error("Der Browser konnte keine Sprachverbindung vorbereiten.");

      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${clientSecret.token}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!response.ok) {
        throw new Error("Die Sprachverbindung zu OpenAI konnte nicht aufgebaut werden.");
      }

      await pc.setRemoteDescription({
        type: "answer",
        sdp: await response.text(),
      });
    } catch (error) {
      const message = toGermanError(error);
      this.stop();
      this.events.onError(message);
      throw error;
    }
  }

  stop() {
    try {
      this.dc?.close();
      this.pc?.close();
    } catch {
      // Bereits geschlossene Browser-Verbindungen sind unkritisch.
    }
    this.mic?.getTracks().forEach((track) => track.stop());
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
    this.mic?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  clearTranscript() {
    this.turns = [];
    this.events.onTranscript([]);
  }

  private async requestMicrophone(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Dein Browser unterstützt keinen Mikrofonzugriff.");
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        throw new Error(
          "Der Mikrofonzugriff wurde abgelehnt. Erlaube ihn in den Website-Einstellungen.",
        );
      }
      throw new Error("Das Mikrofon konnte nicht gestartet werden.");
    }
  }

  private setState(state: SessionState) {
    this.state = state;
    this.events.onState(state);
  }

  private handleServerEvent(raw: unknown) {
    let event: ServerEvent;
    try {
      event = typeof raw === "string" ? JSON.parse(raw) : (raw as ServerEvent);
    } catch {
      return;
    }

    switch (event.type) {
      case "input_audio_buffer.speech_started":
        this.setState("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        this.setState("thinking");
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const text = String(event.transcript ?? "").trim();
        if (text) this.replaceTurn(event.item_id ?? cryptoId(), "user", text, true);
        break;
      }
      case "response.output_audio.delta":
      case "response.output_audio_buffer.started":
        this.setState("speaking");
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta": {
        const delta = String(event.delta ?? "");
        if (delta && event.item_id) this.appendDelta(event.item_id, "agent", delta);
        break;
      }
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        const text = String(event.transcript ?? "").trim();
        if (text && event.item_id) this.replaceTurn(event.item_id, "agent", text, true);
        break;
      }
      case "response.function_call_arguments.done":
        if (event.call_id && event.name) {
          this.pendingToolCalls.push({
            callId: event.call_id,
            name: event.name,
            args: event.arguments ?? "{}",
          });
        }
        break;
      case "response.done":
        if (this.pendingToolCalls.length) void this.flushPendingTools();
        else this.setState("idle");
        break;
      case "error":
        this.events.onError(
          event.error?.message
            ? "Die Sprachsitzung wurde unterbrochen. Bitte starte sie erneut."
            : "In der Sprachsitzung ist ein Fehler aufgetreten.",
        );
        break;
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
    const calls = this.pendingToolCalls.splice(0);
    this.setState("thinking");

    for (const call of calls) {
      let output: string;
      try {
        const args = JSON.parse(call.args) as Record<string, unknown>;
        output = (await executeVoiceTool(call.name, args)).output;
      } catch {
        output = "Das angeforderte Werkzeug konnte nicht ausgeführt werden.";
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
    this.dc.send(JSON.stringify({ type: "response.create" }));
  }

  private appendDelta(id: string, role: Turn["role"], delta: string) {
    const existing = this.turns.find((turn) => turn.id === id);
    if (existing) {
      existing.text += delta;
    } else {
      this.turns.push({ id, role, text: delta, done: false });
    }
    this.events.onTranscript([...this.turns]);
  }

  private replaceTurn(id: string, role: Turn["role"], text: string, done: boolean) {
    const index = this.turns.findIndex((turn) => turn.id === id);
    const turn = { id, role, text, done };
    if (index >= 0) this.turns[index] = turn;
    else this.turns.push(turn);
    this.events.onTranscript([...this.turns]);
  }
}

function toGermanError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Die Sprachfunktion konnte nicht gestartet werden.";
}

function cryptoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}
