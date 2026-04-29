/**
 * HTTP client for the Mac-resident vault service.
 *
 * Why: Railway containers can't read iCloud-synced files. The vault lives on
 * the Mac, exposed by `mac/` over Tailscale. This module mirrors the surface
 * the backend used to call directly when vault.ts was local.
 */

const BASE = process.env.MAC_VAULT_URL ?? "http://localhost:3001";
const SECRET = process.env.MAC_VAULT_SECRET;

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

export type VaultContextFile = {
  relPath: string;
  content: string;
  bytes: number;
};

export type VaultContext = {
  files: VaultContextFile[];
  totalBytes: number;
};

export type VaultFileMeta = {
  relPath: string;
  mtime: number;
  bytes: number;
};

export type VaultFile = {
  relPath: string;
  frontmatter: Record<string, string>;
  body: string;
  mtime: number;
};

export type RawFile = {
  relPath: string;
  content: string;
  mtime: number;
};

export type CanonicalWriteMode = "create" | "overwrite";

export type CanonicalWriteInput = {
  relPath: string;
  content: string;
  mode: CanonicalWriteMode;
};

export type CanonicalWriteResult = {
  relPath: string;
  absPath: string;
};

async function call<T>(
  pathSuffix: string,
  init?: RequestInit & { query?: Record<string, string> },
): Promise<T> {
  let url = `${BASE}${pathSuffix}`;
  if (init?.query) {
    url += `?${new URLSearchParams(init.query).toString()}`;
  }
  const r = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(SECRET ? { "x-mac-auth": SECRET } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(
      `mac-vault ${r.status} ${pathSuffix}: ${text.slice(0, 200)}`,
    );
  }
  return r.json() as Promise<T>;
}

export async function listScopes(): Promise<string[]> {
  const res = await call<{ scopes: string[] }>("/vault/scopes");
  return res.scopes;
}

export async function listScopeFiles(scope: string): Promise<string[]> {
  if (!scope) return [];
  const res = await call<{ files: string[] }>("/vault/scope-files", {
    query: { scope },
  });
  return res.files;
}

export async function listScopeFilesWithMeta(
  scope: string,
): Promise<VaultFileMeta[]> {
  if (!scope) return [];
  const res = await call<{ files: VaultFileMeta[] }>("/vault/scope-files", {
    query: { scope, meta: "1" },
  });
  return res.files;
}

export async function readVaultFile(relPath: string): Promise<VaultFile> {
  return call<VaultFile>("/vault/file", { query: { path: relPath } });
}

export async function readRawFile(relPath: string): Promise<RawFile> {
  return call<RawFile>("/vault/raw", { query: { path: relPath } });
}

export async function readScopeContext(scope: string): Promise<VaultContext> {
  if (!scope) return { files: [], totalBytes: 0 };
  return call<VaultContext>("/vault/context", { query: { scope } });
}

export async function writeVaultNote(
  input: VaultWriteInput,
): Promise<VaultWriteResult> {
  return call<VaultWriteResult>("/vault/write", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function canonicalWrite(
  input: CanonicalWriteInput,
): Promise<CanonicalWriteResult> {
  return call<CanonicalWriteResult>("/vault/canonical-write", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ── Pure helpers, kept here so call-sites only import from one place ──

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
