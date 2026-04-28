# Architecture

## Components

### Web PWA (`web/`)
- Vite + React + TypeScript, installable PWA (added to home screen on iOS/Android)
- Primary client today
- Speaks only to the TS backend (HTTP for requests, WS or SSE for live updates)
- Handles Google OAuth redirect, then hands tokens to the backend
- Holds the WebRTC session with OpenAI Realtime via the browser's native WebRTC stack
- Service worker for offline shell + Web Push (iOS Safari supports Web Push for installed PWAs since 16.4)

### Future iOS client (`ios/`)
- Swift / SwiftUI, TestFlight distribution only
- Same protocol as the PWA (HTTP + WS/SSE + WebRTC) — lift-and-shift, not rewrite
- Deferred until an Apple Developer account is in play; directory is reserved

### TS backend (`backend/`)
- TypeScript service deployed on Railway
- Single centralized orchestrator — one service instead of many single-purpose runners
- Holds a GitHub Personal Access Token (fine-grained) scoped to your side-project repos
- Spins up Pi-Mono coding agents as jobs (subprocess / container) under the same service
- Owns Google OAuth token refresh and Gmail/Calendar calls
- Calls Claude API + web search for research
- Persists state to Convex via the Convex TS client
- Exposes WS or SSE for client live updates (tasks completing, agent messages, job status)

### Convex (`convex/`)
- Database + queries/mutations (typed schema)
- Scheduled functions for lightweight polling loops (e.g. "every 5 min, flag overdue tasks")
- The backend is the primary Convex client; clients (web/iOS) do not talk to Convex directly

### External services
- **OpenAI Realtime** — client-side WebRTC (browser today, Swift later). Backend mints ephemeral tokens and hydrates the system prompt with current state on session start.
- **Google** — Gmail + Calendar, OAuth tokens stored encrypted in Convex.
- **GitHub** — fine-grained PAT, backend reads/writes side-project repos on your behalf.

### Obsidian bridge
- Preserve an existing Obsidian vault on disk; sync mechanism (Syncthing, iCloud, etc.) is left to the user
- Backend can append notes to a queue in Convex; a thin worker flushes them into the vault

## Schema (first pass)

```ts
projects       { name, status, goal, notes, createdAt }
tasks          { projectId, type: 'research'|'email'|'code'|'plan', status, priority, spec, result, createdAt, completedAt }
research       { taskId, source, summary, raw, citations }
messages       { projectId?, taskId?, role, content, createdAt }  // agent activity log
integrations   { provider: 'google'|'github'|..., tokens (encrypted), scopes, expiresAt }
coding_jobs    { taskId, spec, repoTarget, status, logs, startedAt, finishedAt }
```

## Data flow: research task

1. Client → `POST /tasks` on backend (`type=research`, spec)
2. Backend writes `tasks` row in Convex (status `queued`), pushes update down WS
3. Backend worker picks up queued research tasks, calls Claude API / web search
4. Writes to `research`, appends to `messages`, marks task `done`
5. Client gets WS update, renders results

## Data flow: coding job

1. Task of type `code` created (from agent planner or user)
2. Backend launches a Pi-Mono agent job locally, configured with the fine-grained PAT scoped to `repoTarget`
3. Job streams logs back to the backend, which mirrors them to `messages` + `coding_jobs.logs`
4. On completion, backend updates `coding_jobs.status`, client gets WS update
5. Agent output can be a PR opened via GitHub API on the side-project repo

## Data flow: voice session

1. Client requests an ephemeral Realtime token from the backend
2. Backend pulls current projects, active tasks, recent research from Convex and composes a system prompt
3. Returns token + system prompt; client opens WebRTC directly to OpenAI
4. Realtime tools are proxied through the backend (same auth boundary) so the voice agent can read/write state

## Open questions

- **Obsidian sync path** — Syncthing, iCloud, or a small VPS — left to the user.
- **Live updates transport** — WebSocket (persistent) vs SSE (simpler, one-way). Voice sessions may push toward WS.
- **Scheduling split** — Convex scheduled functions for light cron-style checks vs the backend running its own worker loop. Default: Convex for cron, backend for anything that needs >5min or streaming.
- **Pi-Mono job isolation** — subprocess per job is simplest; containers are safer but add ops. Start with subprocess, revisit if it bites.
