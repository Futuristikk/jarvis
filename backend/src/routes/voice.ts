import { Hono } from "hono";
import { listScopes, readScopeContext } from "../vaultClient.js";

const REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE ?? "marin";
const OPENAI_BASE_URL = (
  process.env.OPENAI_BASE_URL ?? "https://api.openai.com"
).replace(/\/+$/, "");
const CLIENT_SECRET_TTL_SECONDS = 600;
const VAULT_SCOPE_CAP_BYTES = 32_000;

type ToolDef = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

const VAULT_TOOLS: ToolDef[] = [
  {
    type: "function",
    name: "read_vault_scope",
    description:
      "Liest die persönlichen Notizen eines bestimmten Bereichs. Nutze das Werkzeug nur, wenn die Frage von privaten Notizen profitieren würde.",
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          description: "Exakter Name des Notizbereichs.",
        },
      },
      required: ["scope"],
    },
  },
];

export const voice = new Hono();

voice.post("/realtime-token", async (c) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return c.json(
      { error: "Die Sprachfunktion ist auf dem Server nicht konfiguriert." },
      503,
    );
  }

  const instructions = await buildJarvisInstructions();
  const response = await fetch(
    `${OPENAI_BASE_URL}/v1/realtime/client_secrets`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "OpenAI-Safety-Identifier":
          process.env.OPENAI_SAFETY_IDENTIFIER ?? "jarvis-personal-user",
      },
      body: JSON.stringify({
        expires_after: {
          anchor: "created_at",
          seconds: CLIENT_SECRET_TTL_SECONDS,
        },
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions,
          output_modalities: ["audio"],
          audio: {
            input: {
              transcription: {
                model: "gpt-4o-mini-transcribe",
                language: "de",
              },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
              },
            },
            output: {
              voice: REALTIME_VOICE,
            },
          },
          tools: VAULT_TOOLS,
          tool_choice: "auto",
        },
      }),
    },
  );

  const body = (await response.json().catch(() => null)) as {
    value?: string;
    expires_at?: number;
    session?: { model?: string };
    error?: { message?: string };
  } | null;

  if (!response.ok || !body?.value) {
    console.error(
      "[voice] client secret request failed",
      response.status,
      body?.error?.message ?? "unknown OpenAI error",
    );
    return c.json(
      { error: "Die Sprachsitzung konnte nicht vorbereitet werden." },
      502,
    );
  }

  return c.json({
    token: body.value,
    expiresAt: body.expires_at ?? 0,
    model: body.session?.model ?? REALTIME_MODEL,
  });
});

voice.post("/tools/execute", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    name?: string;
    args?: Record<string, unknown>;
  } | null;

  try {
    if (body?.name === "read_vault_scope") {
      return c.json({ output: await readVaultScope(body.args ?? {}) });
    }
    return c.json({ output: "Unbekanntes Werkzeug." });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[voice] tool failed", message);
    return c.json({
      output: "Die persönlichen Notizen konnten nicht gelesen werden.",
    });
  }
});

async function buildJarvisInstructions(): Promise<string> {
  let scopes: string[] = [];
  try {
    scopes = (await listScopes()).filter(Boolean);
  } catch {
    // Notizen sind optional; die Sprachfunktion bleibt ohne Vault nutzbar.
  }

  const timezone = process.env.SCHEDULER_TZ ?? "Europe/Zurich";
  const now = new Date().toLocaleString("de-CH", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "short",
  });

  return [
    `Du bist Jarvis, ein persönlicher deutschsprachiger Assistent. Aktuelle Zeit: ${now} (${timezone}).`,
    "Antworte standardmäßig auf Deutsch. Wechsle die Sprache nur auf ausdrücklichen Wunsch.",
    "Sei klar, hilfreich, ruhig und direkt. Erfinde keine Fakten.",
    "Halte gesprochene Antworten meist bei zwei bis drei Sätzen und stelle nur notwendige Rückfragen.",
    "Führe keine externen oder sensiblen Aktionen ohne ausdrückliche Bestätigung aus.",
    scopes.length
      ? `Verfügbare persönliche Notizbereiche: ${scopes.join(", ")}. Lies einen Bereich nur, wenn er für die Frage relevant ist.`
      : "Persönliche Notizen sind in dieser Sitzung nicht verbunden.",
  ].join("\n");
}

async function readVaultScope(args: Record<string, unknown>): Promise<string> {
  const scope = String(args.scope ?? "").trim();
  if (!scope) return "Für das Lesen der Notizen fehlt der Bereich.";

  const context = await readScopeContext(scope);
  if (!context.files.length) {
    return `Im Bereich „${scope}“ wurden keine Notizen gefunden.`;
  }

  const parts = [`# Notizen aus ${scope}`, ""];
  let total = 0;
  for (const file of context.files) {
    const piece = `## ${file.relPath}\n\n${file.content.trim()}\n`;
    if (total + piece.length > VAULT_SCOPE_CAP_BYTES) {
      parts.push("[Weitere Notizen wurden aus Längengründen ausgelassen.]");
      break;
    }
    parts.push(piece, "---", "");
    total += piece.length;
  }
  return parts.join("\n");
}
