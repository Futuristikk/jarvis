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
  /**
   * Optional. Fires periodically while the agent is *audibly* speaking
   * (above a silence threshold on the remote audio MediaStream). `activeMs`
   * is the cumulative active-speech time for `itemId` so far, with silent
   * gaps excluded — useful for driving a karaoke cursor that pauses with
   * the agent. Resets to 0 when a new agent item starts speaking.
   */
  onAudioPulse?: (itemId: string, activeMs: number) => void;
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
  // Web-Audio analyser tap on the remote stream. The realtime API exposes no
  // audio↔text alignment events, so we measure actual playback ourselves and
  // count active-speech ms per agent item — that drives the karaoke cursor.
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBuf: Uint8Array | null = null;
  private analyserTimer: number | null = null;
  private currentSpeakingId: string | null = null;
  private speechActiveMs = 0;
  private lastAnalyserTickAt = 0;

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
        // Tap the same stream for analyser-based speech detection. Failures
        // are non-fatal — the consumer's pulse callback simply won't fire
        // and they should fall back to a timer.
        if (this.events.onAudioPulse) this.setupAnalyser(e.streams[0]);
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
    this.teardownAnalyser();
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

  /**
   * Push new system instructions over the data channel without tearing the
   * WebRTC session down. Used by the Spanish tutor when the user changes
   * level or scenario mid-call so the connection — and the karaoke state —
   * survive the swap.
   */
  updateInstructions(instructions: string) {
    if (!this.dc || this.dc.readyState !== "open") return;
    this.dc.send(
      JSON.stringify({
        type: "session.update",
        session: { instructions },
      }),
    );
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
      case "response.output_audio_buffer.started": {
        if (this.state !== "speaking") this.setState("speaking");
        // Tag whichever item the analyser should credit active speech to.
        // Audio events carry item_id; first delta for a new item resets the
        // counter so a fresh agent turn starts at 0ms.
        const itemId = String(evt.item_id ?? "");
        if (itemId && itemId !== this.currentSpeakingId) {
          this.currentSpeakingId = itemId;
          this.speechActiveMs = 0;
        }
        break;
      }
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

  /**
   * Tap the remote audio MediaStream with an AnalyserNode and start a
   * sampling loop that credits "active speech ms" to the current agent item.
   *
   * Notes:
   *  - Chromium needs the analyser graph to be pulled by something downstream
   *    of the MediaStreamSource or it returns silence; a zero-gain connection
   *    to `ctx.destination` provides that pull without doubling audio output
   *    (the <audio> element is still the actual sink).
   *  - The AudioContext may start `suspended` under autoplay policy; we
   *    `resume()` and ignore the rejection — the orb tap that started the
   *    session counts as a user gesture and unsuspends it eventually.
   */
  private setupAnalyser(stream: MediaStream) {
    if (this.audioCtx) return;
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      ctx.resume().catch(() => {
        /* ignore */
      });

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      const muteGain = ctx.createGain();
      muteGain.gain.value = 0;
      source.connect(analyser);
      analyser.connect(muteGain);
      muteGain.connect(ctx.destination);

      this.audioCtx = ctx;
      this.analyser = analyser;
      this.analyserBuf = new Uint8Array(analyser.frequencyBinCount);
      this.lastAnalyserTickAt = performance.now();

      // ~50ms tick — fast enough to feel real-time, cheap enough to ignore.
      this.analyserTimer = window.setInterval(() => this.analyserTick(), 50);
    } catch (err) {
      console.warn("[realtime] analyser setup failed:", err);
    }
  }

  private analyserTick() {
    if (!this.analyser || !this.analyserBuf || !this.events.onAudioPulse) return;
    // PCM time-domain samples in [0, 255], 128 = silence baseline.
    const buf = this.analyserBuf as Uint8Array;
    this.analyser.getByteTimeDomainData(buf as unknown as Uint8Array<ArrayBuffer>);
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i] - 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / buf.length);

    const now = performance.now();
    const elapsed = now - this.lastAnalyserTickAt;
    this.lastAnalyserTickAt = now;

    // Threshold tuned empirically against gpt-realtime "verse" output. Below
    // this is room noise / between-word silence; above this is voiced audio.
    const SILENCE_RMS = 3;
    if (rms > SILENCE_RMS && this.currentSpeakingId) {
      this.speechActiveMs += elapsed;
      this.events.onAudioPulse(this.currentSpeakingId, this.speechActiveMs);
    }
  }

  private teardownAnalyser() {
    if (this.analyserTimer !== null) {
      clearInterval(this.analyserTimer);
      this.analyserTimer = null;
    }
    try {
      this.audioCtx?.close();
    } catch {
      // ignore
    }
    this.audioCtx = null;
    this.analyser = null;
    this.analyserBuf = null;
    this.currentSpeakingId = null;
    this.speechActiveMs = 0;
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
