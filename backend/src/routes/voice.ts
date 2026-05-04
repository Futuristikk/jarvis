import { Hono } from "hono";
import { listScopes, readScopeContext } from "../vaultClient.js";

export const voice = new Hono();

const REALTIME_MODEL = "gpt-realtime";
const REALTIME_VOICE = "verse";
const VAULT_SCOPE_CAP_BYTES = 32_000;

type ToolDef = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

type Mode = "jarvis" | "spanish";

const VAULT_TOOLS: ToolDef[] = [
  {
    type: "function",
    name: "read_vault_scope",
    description:
      "Read Adam's canonical notes for a specific scope (project or knowledge area). Returns concatenated markdown of every canonical .md file in that scope (excluding _jarvis and Archived). Use when the user asks about something specific to one of his projects or knowledge areas, or when their question would benefit from grounding in his own writing.",
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          description:
            "The scope to read, exactly as listed in your instructions (e.g. 'Projects/Saildock', 'Knowledge/Fitness', 'Admin').",
        },
      },
      required: ["scope"],
    },
  },
];

/**
 * Mint an ephemeral OpenAI Realtime client secret for the PWA.
 *
 * The body selects a "mode": jarvis (default — vault-aware general assistant)
 * or spanish (conversational tutor at a target level/scenario, with es-ES
 * input transcription). Vault scopes are fetched once at session creation for
 * jarvis mode so the agent knows what's available without an extra round-trip.
 */
type VoiceConfig = {
  mode: Mode;
  instructions: string;
  tools: ToolDef[];
  transcription: { model: string; language?: string };
};

async function buildVoiceConfig(body: {
  mode?: string;
  level?: string;
  scenario?: string;
}): Promise<VoiceConfig> {
  const mode: Mode = body.mode === "spanish" ? "spanish" : "jarvis";
  if (mode === "spanish") {
    return {
      mode,
      instructions: buildSpanishInstructions(body.level, body.scenario),
      tools: [],
      transcription: { model: "whisper-1", language: "es" },
    };
  }
  let scopes: string[] = [];
  try {
    scopes = (await listScopes()).filter((s) => s !== "");
  } catch (err) {
    console.warn("[voice] failed to list scopes:", err);
  }
  return {
    mode,
    instructions: buildJarvisInstructions(scopes),
    tools: VAULT_TOOLS,
    transcription: { model: "whisper-1" },
  };
}

voice.post("/realtime-token", async (c) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return c.json({ error: "OPENAI_API_KEY not configured" }, 500);

  const body = (await c.req.json().catch(() => ({}))) as {
    mode?: string;
    level?: string;
    scenario?: string;
  };
  const { instructions, tools, transcription } = await buildVoiceConfig(body);

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
      input_audio_transcription: transcription,
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
      tools,
      tool_choice: tools.length > 0 ? "auto" : "none",
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

/**
 * Return the system instructions for the given mode/level/scenario without
 * minting a new realtime token. The PWA pushes these over the data channel
 * via a `session.update` so it can switch tutor configuration mid-call
 * without dropping the WebRTC session.
 */
voice.post("/instructions", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    mode?: string;
    level?: string;
    scenario?: string;
  };
  const { instructions } = await buildVoiceConfig(body);
  return c.json({ instructions });
});

/**
 * Tool dispatch. The PWA forwards function-call args here; we run the tool
 * server-side (where credentials and the vault client live) and return a
 * string output the agent can speak about. Errors are returned as the
 * output string rather than as HTTP errors so the agent stays in flow.
 */
voice.post("/tools/execute", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    name?: string;
    args?: Record<string, unknown>;
  } | null;
  const name = body?.name ?? "";
  const args = body?.args ?? {};

  try {
    if (name === "read_vault_scope") {
      const output = await runReadVaultScope(args);
      return c.json({ output });
    }
    return c.json({ output: `Unknown tool: ${name}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ output: `Tool error: ${msg}` });
  }
});

async function runReadVaultScope(
  args: Record<string, unknown>,
): Promise<string> {
  const scope = String(args.scope ?? "").trim();
  if (!scope) return "Tool error: scope is required.";

  const ctx = await readScopeContext(scope);
  if (ctx.files.length === 0) {
    return `(no canonical notes found in scope "${scope}")`;
  }

  const parts: string[] = [`# Notes from ${scope}`, ""];
  let total = 0;
  let truncatedAt = -1;
  for (let i = 0; i < ctx.files.length; i++) {
    const f = ctx.files[i];
    const piece = `## ${f.relPath}\n\n${f.content.trim()}\n`;
    if (total + piece.length > VAULT_SCOPE_CAP_BYTES) {
      truncatedAt = i;
      break;
    }
    parts.push(piece, "---", "");
    total += piece.length;
  }
  if (truncatedAt >= 0) {
    parts.push(
      `[Truncated at ${VAULT_SCOPE_CAP_BYTES.toLocaleString()} bytes — ${ctx.files.length - truncatedAt} more files not shown.]`,
    );
  }
  return parts.join("\n");
}

function buildJarvisInstructions(scopes: string[]): string {
  const tz = process.env.SCHEDULER_TZ ?? "Europe/Madrid";
  const now = new Date().toLocaleString("en-US", {
    timeZone: tz,
    dateStyle: "full",
    timeStyle: "short",
  });
  const lines = [
    `You are Jarvis, Adam's personal voice assistant. The current time is ${now} (${tz}).`,
    "",
  ];
  if (scopes.length > 0) {
    lines.push(
      "Adam's Obsidian vault is organized into these scopes:",
      ...scopes.map((s) => `- ${s}`),
      "",
      "When he asks about something specific to one of these, call the `read_vault_scope` tool to read the canonical notes for that scope before answering.",
      "Don't call the tool for general-knowledge questions or things that clearly aren't in the vault.",
      "After reading, summarize what's relevant — don't recite. The notes are private context, not a script.",
      "",
    );
  }
  lines.push(
    "Voice style:",
    "- Reply in 2–3 sentences max. One thought per turn, then stop.",
    "- Conversational, direct, slightly dry. No corporate filler, no preamble.",
    "- If you don't know something, say so plainly.",
    "- Never read URLs or long lists out loud.",
    "- When uncertain whether the user finished, briefly pause rather than filling.",
  );
  return lines.join("\n");
}

const LEVEL_GUIDANCE: Record<string, string> = {
  A2: "Stick to present and basic past tenses, high-frequency vocabulary, short sentences (≤8 words). Avoid idioms and the subjunctive.",
  B1: "Use past, present, future, and conditional. Common idioms are fine. Keep sentences ≤14 words.",
  B2: "Full range of tenses including subjunctive. Use natural connectors and idioms. Don't dumb things down.",
  C1: "Speak as you would to a native: rich vocabulary, regional idioms, full subjunctive use, hedging and nuance.",
};

const SCENARIO_GUIDANCE: Record<string, string> = {
  "Café · casual":
    "You're a friend Adam meets at a café in Barcelona. Small talk, weekend plans, food, neighborhood gossip. Warm and unhurried.",
  Bureaucracy:
    "You're a clerk at a Spanish administrative office (ayuntamiento, extranjería, hacienda). Formal but helpful. Use the bureaucratic vocabulary Adam needs to handle real paperwork.",
  Doctor:
    "You're a Spanish GP doing a routine consultation. Ask about symptoms, history, lifestyle. Use medical vocabulary a patient would actually hear.",
};

function buildSpanishInstructions(
  levelRaw: string | undefined,
  scenarioRaw: string | undefined,
): string {
  const level = (levelRaw ?? "B1").toUpperCase();
  const scenario = scenarioRaw ?? "Café · casual";
  const levelHint = LEVEL_GUIDANCE[level] ?? LEVEL_GUIDANCE.B1;
  const scenarioHint =
    SCENARIO_GUIDANCE[scenario] ??
    `Stay in character for the scenario "${scenario}".`;

  return [
    "You are Adam's Spanish (Castilian, es-ES) conversation tutor. He lives in Barcelona and is practising for real life there.",
    `His current level is ${level}. ${levelHint}`,
    "",
    `Scenario: ${scenario}. ${scenarioHint}`,
    "",
    "Hard rules:",
    "- Speak ONLY in Spanish. Never switch to English unless he explicitly asks you to translate something.",
    "- Keep every reply to 1–2 short sentences, then stop and let him respond.",
    "- Stay in character and in scenario. Don't narrate, don't meta-comment ('great question', 'as your tutor…').",
    "- If he makes a meaningful mistake (gender, conjugation, preposition, vocab), recast the correct form once inside your reply, then continue naturally. Don't lecture.",
    "- If his transcription suggests a clear pronunciation slip, you may briefly model the correct word, then move on.",
    "- Don't read URLs, hashtags, or long lists out loud.",
    "- Pause and let him think rather than filling silence.",
  ].join("\n");
}
