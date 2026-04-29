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

const TOOLS: ToolDef[] = [
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
 * Vault scopes are fetched once at session creation and listed in the
 * instructions so the agent knows what's available without an extra round-trip.
 */
voice.post("/realtime-token", async (c) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return c.json({ error: "OPENAI_API_KEY not configured" }, 500);

  let scopes: string[] = [];
  try {
    scopes = (await listScopes()).filter((s) => s !== "");
  } catch (err) {
    console.warn("[voice] failed to list scopes:", err);
  }

  const instructions = buildInstructions(scopes);

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
      tools: TOOLS,
      tool_choice: "auto",
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

function buildInstructions(scopes: string[]): string {
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
