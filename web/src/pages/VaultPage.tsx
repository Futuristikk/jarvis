import { useEffect, useState } from "react";
import { marked } from "marked";
import { Icon, type IconName } from "../components/Icon";
import {
  getVaultFile,
  listSchedules,
  listScopeFilesWithMeta,
  listVaultScopes,
  type ScheduleRow,
  type VaultFile,
  type VaultFileMeta,
} from "../api";

type View =
  | { kind: "browse" }
  | { kind: "group"; group: string }
  | { kind: "files"; scope: string }
  | { kind: "reader"; relPath: string; backScope: string }
  | { kind: "scheduled-list" }
  | { kind: "scheduled-reader"; schedule: ScheduleRow };

type ScopeGroup = {
  name: string;
  scopes: string[]; // full scope paths
  isLeaf: boolean; // true if the group itself is a single scope (e.g. "Admin")
};

function buildGroups(scopes: string[]): ScopeGroup[] {
  const map = new Map<string, string[]>();
  for (const s of scopes) {
    const slash = s.indexOf("/");
    const group = slash >= 0 ? s.slice(0, slash) : s;
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(s);
  }
  const out: ScopeGroup[] = [];
  for (const [name, list] of map.entries()) {
    out.push({
      name,
      scopes: list,
      isLeaf: list.length === 1 && list[0] === name,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function scopeLeafName(scope: string): string {
  const slash = scope.indexOf("/");
  return slash >= 0 ? scope.slice(slash + 1) : scope;
}

function scopeGroupName(scope: string): string {
  const slash = scope.indexOf("/");
  return slash >= 0 ? scope.slice(0, slash) : scope;
}

marked.setOptions({ gfm: true, breaks: false });

export function VaultPage() {
  const [view, setView] = useState<View>({ kind: "browse" });

  // Loaded once.
  const [scopes, setScopes] = useState<string[]>([]);
  const [scopesError, setScopesError] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);

  // Per-scope files cache.
  const [files, setFiles] = useState<VaultFileMeta[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  // Currently rendered file.
  const [file, setFile] = useState<VaultFile | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listVaultScopes(), listSchedules()])
      .then(([s, sch]) => {
        if (cancelled) return;
        setScopes(s.scopes.filter((x) => x !== ""));
        setSchedules(sch.schedules);
      })
      .catch((err) => {
        if (cancelled) return;
        setScopesError("Notizen konnten nicht geladen werden.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (view.kind !== "files") return;
    let cancelled = false;
    setFilesLoading(true);
    setFilesError(null);
    setFiles([]);
    listScopeFilesWithMeta(view.scope)
      .then((res) => {
        if (cancelled) return;
        setFiles(res.files);
        setFilesLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setFilesError("Die Dateien konnten nicht geladen werden.");
        setFilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  useEffect(() => {
    if (view.kind !== "reader") return;
    let cancelled = false;
    setFileLoading(true);
    setFileError(null);
    setFile(null);
    getVaultFile(view.relPath)
      .then((f) => {
        if (cancelled) return;
        setFile(f);
        setFileLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setFileError("Die Notiz konnte nicht geöffnet werden.");
        setFileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  const groups = buildGroups(scopes);

  return (
    <div className="page page-enter">
      <Topbar view={view} setView={setView} />
      {view.kind === "browse" && (
        <BrowseView
          groups={groups}
          scopesError={scopesError}
          scheduleCount={schedules.length}
          onPickGroup={(g) => {
            if (g.isLeaf) setView({ kind: "files", scope: g.scopes[0] });
            else setView({ kind: "group", group: g.name });
          }}
          onPickScheduled={() => setView({ kind: "scheduled-list" })}
        />
      )}
      {view.kind === "group" && (
        <GroupView
          group={view.group}
          scopes={
            groups.find((g) => g.name === view.group)?.scopes ?? []
          }
          onPickScope={(scope) => setView({ kind: "files", scope })}
        />
      )}
      {view.kind === "files" && (
        <FilesView
          scope={view.scope}
          files={files}
          loading={filesLoading}
          error={filesError}
          onPick={(relPath) =>
            setView({ kind: "reader", relPath, backScope: view.scope })
          }
        />
      )}
      {view.kind === "reader" && (
        <ReaderView file={file} loading={fileLoading} error={fileError} />
      )}
      {view.kind === "scheduled-list" && (
        <ScheduledListView
          schedules={schedules}
          onPick={(s) => setView({ kind: "scheduled-reader", schedule: s })}
        />
      )}
      {view.kind === "scheduled-reader" && (
        <ScheduleReader schedule={view.schedule} />
      )}
    </div>
  );
}

function Topbar({ view, setView }: { view: View; setView: (v: View) => void }) {
  if (view.kind === "browse") {
    return (
      <div className="topbar">
        <div className="topbar-title">
          <span className="dot" />
          Notizen
        </div>
        <button className="topbar-action" title="Weitere Optionen">
          <Icon name="more" size={18} />
        </button>
      </div>
    );
  }

  let title = "";
  let onBack: () => void = () => setView({ kind: "browse" });
  if (view.kind === "group") {
    title = view.group;
  } else if (view.kind === "files") {
    title = scopeLeafName(view.scope);
    const parent = scopeGroupName(view.scope);
    if (parent !== view.scope) {
      onBack = () => setView({ kind: "group", group: parent });
    }
  } else if (view.kind === "reader") {
    title = basename(view.relPath);
    onBack = () => setView({ kind: "files", scope: view.backScope });
  } else if (view.kind === "scheduled-list") {
    title = "Geplant";
  } else if (view.kind === "scheduled-reader") {
    title = view.schedule.name;
    onBack = () => setView({ kind: "scheduled-list" });
  }

  return (
    <div className="topbar">
      <div className="topbar-back">
        <button className="back-btn" onClick={onBack} aria-label="Zurück">
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="topbar-title" title={title}>
          {title}
        </div>
      </div>
      <button className="topbar-action" title="Weitere Optionen">
        <Icon name="more" size={18} />
      </button>
    </div>
  );
}

function BrowseView({
  groups,
  scopesError,
  scheduleCount,
  onPickGroup,
  onPickScheduled,
}: {
  groups: ScopeGroup[];
  scopesError: string | null;
  scheduleCount: number;
  onPickGroup: (g: ScopeGroup) => void;
  onPickScheduled: () => void;
}) {
  return (
    <div className="vault-body">
      <div className="file-list">
        {scopesError && <Empty danger>{scopesError}</Empty>}
        {!scopesError && groups.length === 0 && <Empty>Wird geladen…</Empty>}
        {groups.map((g) => (
          <NavRow
            key={g.name}
            icon={iconForGroup(g.name)}
            name={g.name}
            meta={
              g.isLeaf
                ? "Notizbereich"
                : `${g.scopes.length} Bereiche`
            }
            onClick={() => onPickGroup(g)}
          />
        ))}
        <NavRow
          icon="scheduled"
          name="Geplant"
          meta={`${scheduleCount} Zeitpläne`}
          special
          onClick={onPickScheduled}
        />
      </div>
    </div>
  );
}

function GroupView({
  group,
  scopes,
  onPickScope,
}: {
  group: string;
  scopes: string[];
  onPickScope: (scope: string) => void;
}) {
  return (
    <div className="vault-body">
      <div className="file-list">
        {scopes.length === 0 && <Empty>Keine Bereiche in {group}</Empty>}
        {scopes.map((s) => (
          <NavRow
            key={s}
            icon="folder"
            name={scopeLeafName(s)}
            onClick={() => onPickScope(s)}
          />
        ))}
      </div>
    </div>
  );
}

function FilesView({
  scope,
  files,
  loading,
  error,
  onPick,
}: {
  scope: string;
  files: VaultFileMeta[];
  loading: boolean;
  error: string | null;
  onPick: (relPath: string) => void;
}) {
  return (
    <div className="vault-body">
      <div className="file-list">
        {loading && <Empty>{scope} wird geladen…</Empty>}
        {error && <Empty danger>{error}</Empty>}
        {!loading && !error && files.length === 0 && (
          <Empty>Dieser Bereich enthält noch keine Dateien.</Empty>
        )}
        {files.map((f) => (
          <div
            key={f.relPath}
            className="file-row"
            onClick={() => onPick(f.relPath)}
          >
            <div style={{ display: "flex", flex: 1, minWidth: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="file-name">{basename(f.relPath)}</div>
                <div className="file-meta">{formatBytes(f.bytes)}</div>
              </div>
            </div>
            <div className="file-time">{relativeTime(f.mtime)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReaderView({
  file,
  loading,
  error,
}: {
  file: VaultFile | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="reader">
      {loading && <Empty>Wird geladen…</Empty>}
      {error && <Empty danger>{error}</Empty>}
      {file && <FileBody file={file} />}
    </div>
  );
}

function FileBody({ file }: { file: VaultFile }) {
  const fmEntries = Object.entries(file.frontmatter);
  const html = marked.parse(file.body) as string;
  return (
    <>
      {fmEntries.length > 0 && (
        <dl className="frontmatter">
          {fmEntries.map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <h1>{basename(file.relPath)}</h1>
      <div className="subtitle">{file.relPath}</div>
      <div className="reader-actions">
        <button className="btn">
          <Icon name="merge" size={12} /> Als Hauptnotiz übernehmen
        </button>
        <button className="btn ghost">
          <Icon name="more" size={12} /> Aktionen
        </button>
      </div>
      <div
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}

function ScheduledListView({
  schedules,
  onPick,
}: {
  schedules: ScheduleRow[];
  onPick: (s: ScheduleRow) => void;
}) {
  return (
    <div className="vault-body">
      <div className="file-list">
        {schedules.length === 0 && <Empty>Noch keine Zeitpläne vorhanden.</Empty>}
        {schedules.map((s) => (
          <div key={s._id} className="file-row" onClick={() => onPick(s)}>
            <div style={{ display: "flex", flex: 1, minWidth: 0 }}>
              {s.active && <span className="feed-dot" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="file-name">{s.name}</div>
                <div className="file-meta">
                  <span className="tag">{s.cron}</span>
                  {s.contextScope ?? ""}
                </div>
              </div>
            </div>
            <div className="file-time">
              {s.active ? relativeFuture(s.nextRunAt) : "pausiert"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScheduleReader({ schedule }: { schedule: ScheduleRow }) {
  const next = new Date(schedule.nextRunAt);
  const lastRun = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
  return (
    <div className="reader">
      <dl className="frontmatter">
        <dt>cron</dt>
        <dd>{schedule.cron}</dd>
        <dt>Bereich</dt>
        <dd>{schedule.contextScope ?? "(none)"}</dd>
        <dt>Aktiv</dt>
        <dd>{schedule.active ? "yes" : "pausiert"}</dd>
        <dt>Nächster Lauf</dt>
        <dd>{next.toLocaleString()}</dd>
        {lastRun && (
          <>
            <dt>Letzter Lauf</dt>
            <dd>{lastRun.toLocaleString()}</dd>
          </>
        )}
      </dl>
      <h1>{schedule.name}</h1>
      <div className="subtitle">
        geplant · {schedule.type} · Ausgabe nach Geplant/{schedule.slug}/
      </div>
      <div className="reader-actions">
        <button className="btn primary">
          <Icon name="play" size={12} /> Jetzt ausführen
        </button>
        <button className="btn">
          <Icon name={schedule.active ? "pause" : "play"} size={12} />{" "}
          {schedule.active ? "Pausieren" : "Fortsetzen"}
        </button>
        <button className="btn ghost">
          <Icon name="x" size={12} /> Löschen
        </button>
      </div>
      <h2>Auftrag</h2>
      <p>{schedule.spec}</p>
    </div>
  );
}

function NavRow({
  icon,
  name,
  meta,
  special,
  onClick,
}: {
  icon: IconName;
  name: string;
  meta?: string;
  special?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={"nav-row " + (special ? "special" : "")}
      onClick={onClick}
    >
      <div className="nav-icon">
        <Icon name={icon} size={14} stroke={1.8} />
      </div>
      <div className="nav-body">
        <div className="nav-name">{name}</div>
        {meta && <div className="nav-meta">{meta}</div>}
      </div>
      <div className="nav-chev">
        <Icon name="chevron-right" size={16} />
      </div>
    </div>
  );
}

function Empty({
  children,
  danger,
}: {
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        padding: "20px 22px",
        color: danger ? "var(--danger)" : "var(--text-mute)",
        fontFamily: "var(--mono)",
        fontSize: 11,
      }}
    >
      {children}
    </div>
  );
}

function basename(relPath: string): string {
  const slash = relPath.lastIndexOf("/");
  const name = slash >= 0 ? relPath.slice(slash + 1) : relPath;
  return name.endsWith(".md") ? name.slice(0, -3) : name;
}

function iconForGroup(group: string): IconName {
  if (group === "Projects") return "folder";
  if (group === "Knowledge") return "book";
  if (group === "Admin") return "settings";
  return "folder";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "jetzt";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / (7 * 86_400_000))}w`;
  return new Date(ms).toLocaleDateString();
}

function relativeFuture(ms: number): string {
  const diff = ms - Date.now();
  if (diff < 0) return "fällig";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}
