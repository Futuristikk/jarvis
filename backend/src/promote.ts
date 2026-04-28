import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import { promises as fs } from "node:fs";
import { db, type TaskRow } from "./db.js";

const VAULT_ROOT = process.env.VAULT_PATH;
if (!VAULT_ROOT) {
  throw new Error("VAULT_PATH env var is required");
}
const ROOT_RESOLVED = path.resolve(VAULT_ROOT);

const PROMOTE_MODEL = "claude-sonnet-4-6";
const anthropic = new Anthropic();

export type PromoteInput = {
  sourceTaskId: string;
  scope: string;
  filename: string;
  transformPrompt?: string;
};

export type PromoteResult = {
  absPath: string;
  relPath: string;
  transformed: boolean;
};

function ensureCanonicalPath(relPath: string): string {
  const abs = path.resolve(ROOT_RESOLVED, relPath);
  if (
    abs !== ROOT_RESOLVED &&
    !abs.startsWith(ROOT_RESOLVED + path.sep)
  ) {
    throw new Error(`refuses to write outside vault: ${relPath}`);
  }
  const segments = relPath.split(path.sep);
  if (segments.includes("_jarvis")) {
    throw new Error("promote target cannot be inside _jarvis/");
  }
  if (segments.includes("Archived")) {
    throw new Error("promote target cannot be inside Archived/");
  }
  return abs;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function promoteTask(input: PromoteInput): Promise<PromoteResult> {
  const task = await db.tasks.get(input.sourceTaskId);
  if (!task) throw new Error("source task not found");
  if (task.status !== "done") {
    throw new Error(`source task status is ${task.status}, not done`);
  }
  const summary = task.result ?? "";
  if (!summary) throw new Error("source task has no result to promote");

  let filename = input.filename.trim();
  if (!filename.endsWith(".md")) filename += ".md";

  const relPath = path.join(input.scope, filename);
  const absPath = ensureCanonicalPath(relPath);
  if (await exists(absPath)) {
    throw new Error(`file already exists: ${relPath}`);
  }

  let body = summary;
  let transformed = false;
  if (input.transformPrompt && input.transformPrompt.trim()) {
    body = await transform(summary, input.transformPrompt.trim());
    transformed = true;
  }

  const today = new Date().toISOString().slice(0, 10);
  const projectSlug = scopeToProjectTag(input.scope);
  const fm = formatFrontmatter({
    source: "jarvis-promoted",
    jarvis_source_task: task._id,
    jarvis_promoted_from: task.autoSavePath,
    jarvis_promotion_prompt: input.transformPrompt || undefined,
    created: today,
    updated: today,
    tags: [
      "jarvis-promoted",
      ...(projectSlug ? [`jarvis/${projectSlug}`] : []),
    ],
  });

  const final = `${fm}\n\n${body.trim()}\n`;
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, final, "utf8");
  return { absPath, relPath, transformed };
}

async function transform(source: string, prompt: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: PROMOTE_MODEL,
    max_tokens: 4096,
    system:
      "You are a careful editor. Reshape the source content per the user's instruction. Preserve facts and citations. Output only the reshaped markdown — no preamble, no commentary, no explanation of what you did.",
    messages: [
      {
        role: "user",
        content: `# Instruction\n\n${prompt}\n\n# Source content\n\n${source}`,
      },
    ],
  });
  const parts: string[] = [];
  for (const b of response.content) {
    if (b.type === "text") parts.push(b.text);
  }
  return parts.join("\n").trim();
}

function scopeToProjectTag(scope: string): string {
  if (!scope) return "top";
  const last = scope.split("/").pop() ?? "";
  return last
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function yamlScalar(v: unknown): string {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v);
  if (/^[a-zA-Z0-9_./-]+$/.test(s) && s.length > 0) return s;
  return JSON.stringify(s);
}

function formatFrontmatter(fm: Record<string, unknown>): string {
  const lines: string[] = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${yamlScalar(item)}`);
    } else {
      lines.push(`${k}: ${yamlScalar(v)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

export type _Unused = TaskRow;
