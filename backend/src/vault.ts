import { promises as fs } from "node:fs";
import path from "node:path";

const VAULT_ROOT = process.env.VAULT_PATH;
if (!VAULT_ROOT) {
  throw new Error("VAULT_PATH env var is required");
}
const ROOT_RESOLVED = path.resolve(VAULT_ROOT);

export type VaultBucket = "Inbox" | "Scheduled" | "Threads";

export type VaultDest = {
  scope: string;
  bucket: VaultBucket;
  thread?: string;
};

export type VaultWriteInput = {
  dest: VaultDest;
  filename: string;
  frontmatter: Record<string, unknown>;
  body: string;
};

export type VaultWriteResult = {
  absPath: string;
  relPath: string;
};

function ensureWithinVault(abs: string) {
  const resolved = path.resolve(abs);
  if (
    resolved !== ROOT_RESOLVED &&
    !resolved.startsWith(ROOT_RESOLVED + path.sep)
  ) {
    throw new Error(`refuses to write outside vault: ${abs}`);
  }
}

function bucketDir(dest: VaultDest): string {
  const base = dest.scope ? path.join(dest.scope, "_jarvis") : "Jarvis";
  let p = path.join(base, dest.bucket);
  if (dest.bucket === "Threads" || dest.bucket === "Scheduled") {
    if (!dest.thread) throw new Error(`${dest.bucket} requires thread`);
    p = path.join(p, dest.thread);
  }
  return p;
}

export function resolveVaultPath(
  dest: VaultDest,
  filename: string,
): { abs: string; rel: string } {
  if (filename.includes("/") || filename.includes("\\")) {
    throw new Error(`filename must be a bare basename: ${filename}`);
  }
  const rel = path.join(bucketDir(dest), filename);
  const abs = path.join(ROOT_RESOLVED, rel);
  ensureWithinVault(abs);
  return { abs, rel };
}

export function slugify(text: string, maxLen = 60): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
  return slug || "untitled";
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function pickFreePath(
  abs: string,
  rel: string,
): Promise<{ abs: string; rel: string }> {
  if (!(await exists(abs))) return { abs, rel };
  const ext = path.extname(abs);
  const baseAbs = abs.slice(0, -ext.length);
  const baseRel = rel.slice(0, -ext.length);
  for (let i = 1; i < 1000; i++) {
    const candAbs = `${baseAbs}-${i}${ext}`;
    const candRel = `${baseRel}-${i}${ext}`;
    if (!(await exists(candAbs))) return { abs: candAbs, rel: candRel };
  }
  throw new Error(`could not find free filename near ${abs}`);
}

export async function writeVaultNote(
  input: VaultWriteInput,
): Promise<VaultWriteResult> {
  const { abs, rel } = resolveVaultPath(input.dest, input.filename);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const free = await pickFreePath(abs, rel);
  const content = `${formatFrontmatter(input.frontmatter)}\n\n${input.body.trim()}\n`;
  await fs.writeFile(free.abs, content, "utf8");
  return { absPath: free.abs, relPath: free.rel };
}

export type VaultContextFile = {
  relPath: string;
  content: string;
  bytes: number;
};

export type VaultContext = {
  files: VaultContextFile[];
  totalBytes: number;
};

const EXCLUDED_DIRS = new Set(["_jarvis", "Archived"]);

async function walkMarkdown(rootAbs: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith(".") || EXCLUDED_DIRS.has(e.name)) continue;
        await walk(full);
      } else if (e.isFile()) {
        if (!e.name.endsWith(".md")) continue;
        if (e.name.includes(".sync-conflict-")) continue;
        out.push(full);
      }
    }
  }
  await walk(rootAbs);
  out.sort();
  return out;
}

export async function readScopeContext(scope: string): Promise<VaultContext> {
  if (!scope) return { files: [], totalBytes: 0 };
  const scopeAbs = path.join(ROOT_RESOLVED, scope);
  ensureWithinVault(scopeAbs);
  const fileAbsPaths = await walkMarkdown(scopeAbs);
  const files: VaultContextFile[] = [];
  let total = 0;
  for (const abs of fileAbsPaths) {
    const content = await fs.readFile(abs, "utf8");
    const bytes = Buffer.byteLength(content, "utf8");
    files.push({
      relPath: path.relative(ROOT_RESOLVED, abs),
      content,
      bytes,
    });
    total += bytes;
  }
  return { files, totalBytes: total };
}

export function buildVaultContextBlock(ctx: VaultContext): string {
  if (ctx.files.length === 0) return "";
  const parts: string[] = [
    "# Context from your Obsidian vault",
    "",
    "The following notes are from your personal vault — your own thinking, hypotheses, and prior research. Treat them as authoritative context when answering the question that follows. When the vault and external sources conflict, surface the conflict explicitly rather than silently picking one.",
    "",
  ];
  for (const f of ctx.files) {
    parts.push(`## ${f.relPath}`, "", f.content.trim(), "", "---", "");
  }
  return parts.join("\n");
}

export type VaultFile = {
  relPath: string;
  frontmatter: Record<string, string>;
  body: string;
  mtime: number;
};

function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { frontmatter: {}, body: content };
  const yaml = m[1];
  const fm: Record<string, string> = {};
  for (const line of yaml.split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_.-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return { frontmatter: fm, body: content.slice(m[0].length) };
}

export async function readVaultFile(relPath: string): Promise<VaultFile> {
  if (!relPath || relPath.includes("..")) {
    throw new Error("invalid path");
  }
  const abs = path.join(ROOT_RESOLVED, relPath);
  ensureWithinVault(abs);
  if (!abs.endsWith(".md")) throw new Error("only .md files supported");
  const [content, stat] = await Promise.all([
    fs.readFile(abs, "utf8"),
    fs.stat(abs),
  ]);
  const { frontmatter, body } = parseFrontmatter(content);
  return { relPath, frontmatter, body, mtime: stat.mtimeMs };
}

export async function listScopeFilesWithMeta(
  scope: string,
): Promise<Array<{ relPath: string; mtime: number; bytes: number }>> {
  if (!scope) return [];
  const scopeAbs = path.join(ROOT_RESOLVED, scope);
  ensureWithinVault(scopeAbs);
  const absPaths = await walkMarkdown(scopeAbs);
  const out: Array<{ relPath: string; mtime: number; bytes: number }> = [];
  for (const abs of absPaths) {
    const stat = await fs.stat(abs);
    out.push({
      relPath: path.relative(ROOT_RESOLVED, abs),
      mtime: stat.mtimeMs,
      bytes: stat.size,
    });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

export async function listScopeFiles(scope: string): Promise<string[]> {
  if (!scope) return [];
  const scopeAbs = path.join(ROOT_RESOLVED, scope);
  ensureWithinVault(scopeAbs);
  const absPaths = await walkMarkdown(scopeAbs);
  return absPaths.map((abs) => path.relative(ROOT_RESOLVED, abs));
}

export async function listScopes(): Promise<string[]> {
  const scopes: string[] = [""];
  for (const top of ["Projects", "Knowledge"]) {
    const dir = path.join(ROOT_RESOLVED, top);
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("_")) {
          scopes.push(`${top}/${e.name}`);
        }
      }
    } catch {
      // top-level dir missing — skip
    }
  }
  if (await exists(path.join(ROOT_RESOLVED, "Admin"))) scopes.push("Admin");
  return scopes;
}
