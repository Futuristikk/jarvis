import Anthropic from "@anthropic-ai/sdk";
import { db, type TaskRow, type ScheduleRow } from "./db.js";
import {
  buildVaultContextBlock,
  readScopeContext,
  slugify,
  todayISO,
  writeVaultNote,
} from "./vault.js";
import { fireDueSchedules } from "./scheduler.js";

const POLL_INTERVAL_MS = 5_000;
const MODEL = "claude-sonnet-4-6";
const MAX_SEARCHES = 5;
const PRIOR_ANSWERS_LIMIT = 3;
const BASE_SYSTEM =
  "You are Jarvis, a personal research agent. Answer the user's question using web_search when fresh or specific information is needed. Be concise. End with a 'Sources:' section listing the URLs you cited.";

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
    await fireDueSchedules();
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
  console.log(
    `[worker] picking up ${task._id}${task.contextScope ? ` [scope=${task.contextScope}]` : ""} — ${task.spec.slice(0, 60)}`,
  );
  await db.tasks.markRunning(task._id);
  await db.messages.append({
    taskId: task._id,
    role: "user",
    content: task.spec,
  });

  try {
    let contextBlock = "";
    let priorAnswersBlock = "";
    let priorCount = 0;
    let contextFilesList: string[] = [];
    if (task.contextScope) {
      const ctx = await readScopeContext(task.contextScope);
      if (ctx.files.length === 0) {
        throw new Error(
          `scope "${task.contextScope}" exists but contains no readable canonical files`,
        );
      }
      contextBlock = buildVaultContextBlock(ctx);
      contextFilesList = ctx.files.map((f) => f.relPath);
      await db.tasks.setContextFiles(task._id, contextFilesList);

      const priors = await db.tasks.recentDoneInScope(
        task.contextScope,
        PRIOR_ANSWERS_LIMIT,
        task._id,
      );
      if (priors.length > 0) {
        priorAnswersBlock = buildPriorAnswersBlock(priors);
        priorCount = priors.length;
        await db.tasks.setPriorAnswersCount(task._id, priorCount);
      }

      console.log(
        `[worker] vault context: ${ctx.files.length} files, ${ctx.totalBytes} bytes; priors: ${priorCount}`,
      );
    }

    const { text, citations, raw, usage } = await callClaude(
      task.spec,
      contextBlock,
      priorAnswersBlock,
    );

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
      `[worker] done ${task._id} — ${citations.length} citations, ${text.length} chars` +
        (usage
          ? ` | tokens in=${usage.input_tokens} out=${usage.output_tokens} cache_create=${usage.cache_creation_input_tokens ?? 0} cache_read=${usage.cache_read_input_tokens ?? 0}`
          : ""),
    );

    if (task.scheduleId) {
      await autoSaveScheduledResult(task, text, citations, contextFilesList);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[worker] failed ${task._id}:`, msg);
    await db.tasks.markFailed(task._id, msg);
  }
}

async function callClaude(
  question: string,
  contextBlock: string,
  priorAnswersBlock: string,
) {
  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: BASE_SYSTEM },
  ];
  if (contextBlock) {
    systemBlocks.push({
      type: "text",
      text: contextBlock,
      cache_control: { type: "ephemeral" },
    });
  }

  const userContent = priorAnswersBlock
    ? `${priorAnswersBlock}\n\n# Question\n\n${question}`
    : question;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemBlocks,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: MAX_SEARCHES,
      } as unknown as Anthropic.Tool,
    ],
    messages: [{ role: "user", content: userContent }],
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
    usage: response.usage,
  };
}

async function autoSaveScheduledResult(
  task: TaskRow,
  summary: string,
  citations: string[],
  contextFiles: string[],
) {
  if (!task.scheduleId) return;
  try {
    const sched = await db.schedules.get(task.scheduleId);
    if (!sched) {
      throw new Error(`schedule ${task.scheduleId} not found`);
    }
    const result = await writeVaultNote({
      dest: {
        scope: sched.contextScope ?? "",
        bucket: "Scheduled",
        thread: sched.slug,
      },
      filename: `${todayISO()}.md`,
      frontmatter: {
        source: "jarvis",
        jarvis_task_id: task._id,
        jarvis_query: task.spec,
        jarvis_scope: sched.contextScope ?? "",
        jarvis_schedule: sched.slug,
        jarvis_schedule_name: sched.name,
        jarvis_context_files: contextFiles.length ? contextFiles : undefined,
        created: todayISO(),
        tags: [
          "jarvis",
          "jarvis/scheduled",
          `jarvis/${slugify(sched.contextScope?.split("/").pop() ?? "top")}`,
        ],
      },
      body: buildScheduledBody(sched, task, summary, citations),
    });
    await db.tasks.setAutoSaveResult({ id: task._id, path: result.relPath });
    console.log(`[worker] auto-saved → ${result.relPath}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[worker] auto-save failed for ${task._id}:`, msg);
    await db.tasks.setAutoSaveResult({ id: task._id, error: msg });
  }
}

function buildScheduledBody(
  sched: ScheduleRow,
  _task: TaskRow,
  summary: string,
  citations: string[],
): string {
  const parts = [
    `# ${sched.name} — ${todayISO()}`,
    "",
    `> Scheduled run of \`${sched.cron}\``,
    "",
    summary,
  ];
  if (citations.length > 0) {
    parts.push("", "## Sources", "");
    for (const c of citations) parts.push(`- ${c}`);
  }
  return parts.join("\n");
}

function buildPriorAnswersBlock(priors: TaskRow[]): string {
  const parts = [
    "# Prior conversation in this scope",
    "",
    "Earlier questions you've answered in this scope and your responses, most recent first. Treat them as conversational context — feel free to reference, refine, or update any prior answer in light of the new question.",
    "",
  ];
  for (const t of priors) {
    parts.push(`## Q: ${t.spec}`, "", t.result ?? "(no answer)", "", "---", "");
  }
  return parts.join("\n");
}
