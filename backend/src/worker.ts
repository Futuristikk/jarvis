import Anthropic from "@anthropic-ai/sdk";
import { db, type TaskRow } from "./db.js";

const POLL_INTERVAL_MS = 5_000;
const MODEL = "claude-sonnet-4-6";
const MAX_SEARCHES = 5;

const anthropic = new Anthropic();

let running = false;

export function startWorker() {
  console.log(`[worker] polling every ${POLL_INTERVAL_MS}ms`);
  setInterval(tick, POLL_INTERVAL_MS).unref();
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const queued = await db.tasks.queued();
    const next = queued.find((t) => t.type === "research");
    if (!next) return;
    await processResearch(next);
  } catch (err) {
    console.error("[worker] tick failed:", err);
  } finally {
    running = false;
  }
}

async function processResearch(task: TaskRow) {
  console.log(`[worker] picking up ${task._id} — ${task.spec.slice(0, 60)}`);
  await db.tasks.markRunning(task._id);
  await db.messages.append({
    taskId: task._id,
    role: "user",
    content: task.spec,
  });

  try {
    const { text, citations, raw } = await callClaude(task.spec);

    await db.research.insert({
      taskId: task._id,
      source: "claude+web_search",
      summary: text,
      raw,
      citations,
    });
    await db.messages.append({
      taskId: task._id,
      role: "agent",
      content: text,
    });
    await db.tasks.markDone(task._id, text);
    console.log(
      `[worker] done ${task._id} — ${citations.length} citations, ${text.length} chars`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[worker] failed ${task._id}:`, msg);
    await db.tasks.markFailed(task._id, msg);
  }
}

async function callClaude(question: string) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system:
      "You are Jarvis, a personal research agent. Answer the user's question using web_search when fresh or specific information is needed. Be concise. End with a 'Sources:' section listing the URLs you cited.",
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: MAX_SEARCHES,
      } as unknown as Anthropic.Tool,
    ],
    messages: [{ role: "user", content: question }],
  });

  const textParts: string[] = [];
  const citations = new Set<string>();
  for (const block of response.content) {
    if (block.type === "text") {
      textParts.push(block.text);
    } else if (
      block.type === "web_search_tool_result" &&
      Array.isArray(block.content)
    ) {
      for (const hit of block.content) {
        if (hit && typeof hit === "object" && "url" in hit && hit.url) {
          citations.add(String(hit.url));
        }
      }
    }
  }

  return {
    text: textParts.join("\n").trim(),
    citations: [...citations],
    raw: JSON.stringify(response),
  };
}
