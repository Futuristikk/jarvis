import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import { promises as fs } from "node:fs";
import { db } from "./db.js";

const VAULT_ROOT = process.env.VAULT_PATH;
if (!VAULT_ROOT) {
  throw new Error("VAULT_PATH env var is required");
}
const ROOT_RESOLVED = path.resolve(VAULT_ROOT);

const PROMOTE_MODEL = "claude-sonnet-4-6";
const anthropic = new Anthropic();

export type PromoteMode = "create" | "append" | "merge";

export type PromoteInput =
  | {
      mode: "create";
      sourceTaskId: string;
      scope: string;
      filename: string;
      transformPrompt?: string;
    }
  | {
      mode: "append";
      sourceTaskId: string;
      targetPath: string;
      transformPrompt?: string;
    }
  | {
      mode: "merge";
      sourceTaskId: string;
      targetPath: string;
      transformPrompt?: string;
    };

export type PromoteResult = {
  absPath: string;
  relPath: string;
  mode: PromoteMode;
  transformed: boolean;
};

function ensureCanonicalRel(relPath: string): string {
  const abs = path.resolve(ROOT_RESOLVED, relPath);
  if (abs !== ROOT_RESOLVED && !abs.startsWith(ROOT_RESOLVED + path.sep)) {
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

async function atomicWrite(abs: string, content: string) {
  const tmp = `${abs}.tmp-${Date.now()}`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, abs);
}

export async function promoteTask(
  input: PromoteInput,
): Promise<PromoteResult> {
  const task = await db.tasks.get(input.sourceTaskId);
  if (!task) throw new Error("source task not found");
  if (task.status !== "done") {
    throw new Error(`source task status is ${task.status}, not done`);
  }
  const summary = task.result ?? "";
  if (!summary) throw new Error("source task has no result to promote");

  if (input.mode === "create") {
    return await promoteCreate(input, task._id, summary);
  }
  if (input.mode === "append") {
    return await promoteAppend(input, task._id, summary);
  }
  return await promoteMerge(input, task._id, summary);
}

async function promoteCreate(
  input: Extract<PromoteInput, { mode: "create" }>,
  taskId: string,
  summary: string,
): Promise<PromoteResult> {
  let filename = input.filename.trim();
  if (!filename.endsWith(".md")) filename += ".md";

  const relPath = path.join(input.scope, filename);
  const absPath = ensureCanonicalRel(relPath);
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
    jarvis_source_task: taskId,
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
  await atomicWrite(absPath, final);
  return { absPath, relPath, mode: "create", transformed };
}

async function promoteAppend(
  input: Extract<PromoteInput, { mode: "append" }>,
  taskId: string,
  summary: string,
): Promise<PromoteResult> {
  const absPath = ensureCanonicalRel(input.targetPath);
  if (!(await exists(absPath))) {
    throw new Error(`target file does not exist: ${input.targetPath}`);
  }

  let body = summary;
  let transformed = false;
  if (input.transformPrompt && input.transformPrompt.trim()) {
    body = await transform(summary, input.transformPrompt.trim());
    transformed = true;
  }

  const original = await fs.readFile(absPath, "utf8");
  const { frontmatter, content } = splitFrontmatter(original);
  const today = new Date().toISOString().slice(0, 10);
  const updatedFm = bumpUpdated(frontmatter, today);

  const appendBlock = [
    "",
    `## ${today} — From Jarvis`,
    `<!-- jarvis_task: ${taskId} -->`,
    "",
    body.trim(),
    "",
  ].join("\n");

  const newContent = `${updatedFm}${content.trimEnd()}\n${appendBlock}`;
  await atomicWrite(absPath, newContent);
  return {
    absPath,
    relPath: input.targetPath,
    mode: "append",
    transformed,
  };
}

async function promoteMerge(
  input: Extract<PromoteInput, { mode: "merge" }>,
  taskId: string,
  summary: string,
): Promise<PromoteResult> {
  const absPath = ensureCanonicalRel(input.targetPath);
  if (!(await exists(absPath))) {
    throw new Error(`target file does not exist: ${input.targetPath}`);
  }

  const original = await fs.readFile(absPath, "utf8");
  const { frontmatter, content: originalBody } = splitFrontmatter(original);
  const today = new Date().toISOString().slice(0, 10);

  const merged = await mergeWithClaude({
    targetFrontmatter: frontmatter,
    targetBody: originalBody,
    sourceContent: summary,
    integrationPrompt: input.transformPrompt?.trim() ?? "",
    today,
  });

  const finalContent = ensureMergedHasFrontmatter(merged, frontmatter, today);
  const sourceFooter = `\n\n<!-- jarvis_merged_from_task: ${taskId} on ${today} -->\n`;
  await atomicWrite(absPath, finalContent.trimEnd() + sourceFooter);
  return {
    absPath,
    relPath: input.targetPath,
    mode: "merge",
    transformed: true,
  };
}

function splitFrontmatter(raw: string): {
  frontmatter: string;
  content: string;
} {
  if (!raw.startsWith("---\n")) {
    return { frontmatter: "", content: raw };
  }
  const end = raw.indexOf("\n---", 4);
  if (end === -1) return { frontmatter: "", content: raw };
  const fm = raw.slice(0, end + 4) + "\n";
  const rest = raw.slice(end + 4).replace(/^\n+/, "\n");
  return { frontmatter: fm, content: rest };
}

function bumpUpdated(frontmatter: string, today: string): string {
  if (!frontmatter) return "";
  if (/^updated:\s*.+$/m.test(frontmatter)) {
    return frontmatter.replace(/^updated:\s*.+$/m, `updated: ${today}`);
  }
  return frontmatter.replace(/\n---\n$/, `\nupdated: ${today}\n---\n`);
}

function ensureMergedHasFrontmatter(
  merged: string,
  originalFrontmatter: string,
  today: string,
): string {
  if (merged.startsWith("---\n") && merged.indexOf("\n---", 4) !== -1) {
    return bumpUpdatedInline(merged, today);
  }
  // model dropped frontmatter — restore from original
  const updated = bumpUpdated(originalFrontmatter, today);
  return `${updated}\n${merged.trimStart()}`;
}

function bumpUpdatedInline(content: string, today: string): string {
  if (!content.startsWith("---\n")) return content;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return content;
  const fm = content.slice(0, end + 4);
  const body = content.slice(end + 4);
  const newFm = /^updated:\s*.+$/m.test(fm)
    ? fm.replace(/^updated:\s*.+$/m, `updated: ${today}`)
    : fm.replace(/\n---$/, `\nupdated: ${today}\n---`);
  return newFm + body;
}

async function mergeWithClaude(args: {
  targetFrontmatter: string;
  targetBody: string;
  sourceContent: string;
  integrationPrompt: string;
  today: string;
}): Promise<string> {
  const system = `You are a careful editor integrating new research into an existing markdown note.

Rules:
- Preserve the existing frontmatter exactly, except update \`updated:\` to ${args.today}.
- Integrate the new content where it structurally fits. Add new sections, extend existing ones, or refine claims as appropriate.
- Do not restate things already present in the note.
- Keep the note's voice and structure.
- Output ONLY the full merged markdown — frontmatter and body. No preamble, no commentary.`;

  const integrationLine = args.integrationPrompt
    ? `# User integration instruction\n\n${args.integrationPrompt}\n\n`
    : "";

  const userMsg = `${integrationLine}# Existing note\n\n${args.targetFrontmatter}${args.targetBody}\n\n# New content to integrate\n\n${args.sourceContent}`;

  const response = await anthropic.messages.create({
    model: PROMOTE_MODEL,
    max_tokens: 8192,
    system,
    messages: [{ role: "user", content: userMsg }],
  });

  const parts: string[] = [];
  for (const b of response.content) {
    if (b.type === "text") parts.push(b.text);
  }
  return parts.join("\n").trim();
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
