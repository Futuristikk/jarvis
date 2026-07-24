import { Hono } from "hono";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.6";
const MAX_MESSAGES = 20;
const MAX_CONTENT_LENGTH = 4_000;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
};

export const chat = new Hono();

chat.post("/", async (c) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return c.json({ error: "OpenAI ist auf dem Server nicht konfiguriert." }, 503);
  }

  const body = (await c.req.json().catch(() => null)) as {
    messages?: unknown;
  } | null;
  const messages = parseMessages(body?.messages);
  if (!messages) {
    return c.json({ error: "Ungültige Chatnachrichten." }, 400);
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions:
        "Du bist Jarvis, ein persönlicher Assistent. Antworte immer auf Deutsch, klar, hilfreich und knapp. Erfinde keine Fakten. Frage nach, wenn eine wichtige Information fehlt.",
      input: messages,
    }),
  });

  const result = (await response.json().catch(() => ({}))) as OpenAIResponse;
  if (!response.ok) {
    console.error("[chat] OpenAI request failed", response.status, result.error?.message);
    return c.json({ error: "Die KI-Antwort ist momentan nicht verfügbar." }, 502);
  }

  const reply = extractOutputText(result);
  if (!reply) {
    return c.json({ error: "Die KI hat keine Textantwort geliefert." }, 502);
  }

  return c.json({ reply, model: MODEL });
});

function parseMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    return null;
  }

  const messages: ChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Partial<ChatMessage>;
    if (candidate.role !== "user" && candidate.role !== "assistant") return null;
    if (typeof candidate.content !== "string") return null;
    const content = candidate.content.trim();
    if (!content || content.length > MAX_CONTENT_LENGTH) return null;
    messages.push({ role: candidate.role, content });
  }
  return messages;
}

function extractOutputText(result: OpenAIResponse): string {
  if (typeof result.output_text === "string") return result.output_text.trim();
  return (
    result.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("")
      .trim() ?? ""
  );
}
