import { Hono } from "hono";

export const voice = new Hono();

const REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";
const REALTIME_VOICE = "verse";

/**
 * Mint an ephemeral OpenAI Realtime client secret for the PWA.
 *
 * The client opens WebRTC directly to OpenAI using this token (good for
 * ~60s); our API key never leaves the server. Session config (voice,
 * VAD, modalities, instructions) is baked in here so the client doesn't
 * have to think about it.
 */
voice.post("/realtime-token", async (c) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return c.json({ error: "OPENAI_API_KEY not configured" }, 500);

  const instructions = buildInstructions();

  const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: REALTIME_MODEL,
      voice: REALTIME_VOICE,
      instructions,
      modalities: ["text", "audio"],
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      input_audio_transcription: { model: "whisper-1" },
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return c.json({ error: `OpenAI sessions: ${text.slice(0, 300)}` }, 500);
  }

  const session = (await res.json()) as {
    client_secret: { value: string; expires_at: number };
  };

  return c.json({
    token: session.client_secret.value,
    expiresAt: session.client_secret.expires_at,
    model: REALTIME_MODEL,
  });
});

function buildInstructions(): string {
  const tz = process.env.SCHEDULER_TZ ?? "Europe/Madrid";
  const now = new Date().toLocaleString("en-US", {
    timeZone: tz,
    dateStyle: "full",
    timeStyle: "short",
  });
  return [
    `You are Jarvis, Adam's personal voice assistant. The current time is ${now} (${tz}).`,
    "",
    "Voice style:",
    "- Reply in 2–3 sentences max. One thought per turn, then stop.",
    "- Conversational, direct, slightly dry. No corporate filler, no preamble.",
    "- If you don't know something, say so plainly.",
    "- Never read URLs or long lists out loud.",
    "- When uncertain whether the user finished, briefly pause rather than filling.",
  ].join("\n");
}
