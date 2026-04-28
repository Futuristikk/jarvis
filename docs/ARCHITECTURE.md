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
- Centralized orchestrator — one service handles all server-side work
- Research worker: dispatches Claude API + web search, writes results + citations to Convex
- Scheduler: timezone-aware cron-style jobs that spawn research tasks and auto-save to the vault
- Vault reader/writer: reads scopes/files for the PWA browser, writes task output to the synced Obsidian vault on disk
- Owns Google OAuth token refresh and Gmail/Calendar calls
- Persists state to Convex via the Convex TS client
- Exposes WS or SSE for client live updates (tasks completing, schedule runs, etc.)

### Convex (`convex/`)
- Database + queries/mutations (typed schema)
- Scheduled functions for lightweight polling loops (e.g. "every 5 min, flag overdue tasks")
- The backend is the primary Convex client; clients (web/iOS) do not talk to Convex directly

### External services
- **OpenAI Realtime** — client-side WebRTC (browser today, Swift later). Backend mints ephemeral tokens and hydrates the system prompt with current state on session start.
- **Google** — Gmail + Calendar, OAuth tokens stored encrypted in Convex.
- **Claude / web search** — research-task execution path.

### Obsidian bridge
- Vault lives on the Mac filesystem; sync mechanism (Syncthing, iCloud, etc.) propagates the directory to other devices
- Backend writes into the vault under `scope/Inbox`, `scope/Threads/{slug}`, or `scope/Scheduled/{slug}` — research auto-save and explicit promote-to-canonical both go through the same writer
- Backend also reads the vault: lists scopes and files, returns markdown for the PWA's vault browser
- The PWA never touches the filesystem directly; everything goes through the backend

## Schema (first pass)

```ts
projects       { name, status, goal, notes, createdAt }
tasks          { projectId, type: 'research'|'email'|'plan', status, priority, spec, result, createdAt, completedAt }
research       { taskId, source, summary, raw, citations }
schedules      { name, cron, spec, contextScope, active, nextRunAt, lastRunAt, lastTaskId }
messages       { projectId?, taskId?, role, content, createdAt }  // agent activity log
integrations   { provider: 'google'|..., tokens (encrypted), scopes, expiresAt }
```

## Data flow: research task

1. Client → `POST /tasks` on backend (`type=research`, spec)
2. Backend writes `tasks` row in Convex (status `queued`), pushes update down WS
3. Backend worker picks up queued research tasks, calls Claude API / web search
4. Writes to `research`, appends to `messages`, marks task `done`
5. Client gets WS update, renders results

## Data flow: scheduled research

1. User creates a `schedule` from the PWA — name, cron expression, question, optional context scope
2. Backend's scheduler (timezone-aware) computes `nextRunAt`; on each tick, due schedules spawn a research task
3. Task runs the same path as a one-off research task; on completion the result is auto-saved into `scope/Scheduled/{slug}`
4. PWA polls / receives WS updates and shows the latest task per schedule, plus the saved vault path

## Data flow: language tutor

1. PWA loads a leveled dialogue (currently Spanish) and plays it back word-by-word with toggleable translation
2. User taps to capture vocab; client posts to backend, backend writes to the vault under a dedicated scope
3. Future: ephemeral Realtime session for spoken practice, with the system prompt hydrated from saved vocab + recent dialogue

## Data flow: voice session

1. Client requests an ephemeral Realtime token from the backend
2. Backend pulls current projects, active tasks, recent research from Convex and composes a system prompt
3. Returns token + system prompt; client opens WebRTC directly to OpenAI
4. Realtime tools are proxied through the backend (same auth boundary) so the voice agent can read/write state

## Open questions

- **Obsidian sync path** — Syncthing, iCloud, or a small VPS — left to the user. The backend treats the vault as a plain filesystem path.
- **Live updates transport** — WebSocket (persistent) vs SSE (simpler, one-way). Voice sessions may push toward WS.
- **Scheduling split** — Convex scheduled functions for light cron-style checks vs the backend running its own worker loop. Default: Convex for cron, backend for anything that needs >5min or streaming.
- **Tutor scope** — start Spanish-only with hand-curated dialogues, then decide whether to generate dialogues from a target level + topic vs continuing to author them.
