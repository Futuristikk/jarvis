# Architecture

## Components

### iOS app (`ios/`)
- Swift / SwiftUI
- Talks to Convex via HTTP actions for writes, Convex live queries for reads
- Handles OAuth redirect for Google (Gmail + Calendar)
- Holds the WebRTC session with OpenAI Realtime
- TestFlight distribution only

### Convex (`convex/`)
- Database + queries/mutations
- HTTP actions — Swift entrypoints
- Scheduled functions — agent loops, research polling
- Actions — call Claude API, Google APIs, web search, trigger coding agents
- Stores OAuth tokens, task queue, research results, agent activity log

### External runners
- **Pi-Mono coding agents** — Railway / fly.io / EC2. Convex fires an HTTP request with a task spec; runner calls back with results.
- **OpenAI Realtime** — browser/iOS-side WebRTC. Convex hydrates the system prompt with current state on session start.

### Obsidian bridge
- Preserve existing vault (synced via Syncthing + iCloud from Hermes EC2 setup — TBD if we keep the EC2 host or move sync to a lighter path)
- Convex can write notes to a queue; a thin sync worker appends them to the vault

## Schema (first pass)

```ts
projects       { name, status, goal, notes, createdAt }
tasks          { projectId, type: 'research'|'email'|'code'|'plan', status, priority, spec, result, createdAt, completedAt }
research       { taskId, source, summary, raw, citations }
messages       { projectId?, taskId?, role, content, createdAt }  // agent activity log
integrations   { provider: 'google'|'github'|..., tokens, scopes, expiresAt }
coding_jobs    { taskId, spec, runner, repoTarget, status, logs, startedAt, finishedAt }
```

## Data flow: research task

1. iOS app → HTTP action `createTask({ type: 'research', spec })`
2. Mutation inserts into `tasks` (status=`queued`)
3. Scheduled function every N min picks up queued research tasks
4. Action calls Claude API / web search, writes to `research`, appends to `messages`
5. Marks task `done`, iOS live query updates

## Data flow: coding job

1. Agent (or user) creates task of type `code` with repo + spec
2. Action POSTs to runner endpoint (Railway/fly.io), stores job id in `coding_jobs`
3. Runner executes Pi-Mono agent, posts back to Convex HTTP action webhook
4. Webhook updates `coding_jobs.status` + logs, appends to `messages`

## Data flow: voice session

1. iOS app requests ephemeral token from Convex action
2. Convex pulls current projects, active tasks, recent research into a system-prompt payload
3. Action returns token + system prompt; iOS opens WebRTC to OpenAI
4. During session, iOS can call Convex queries/mutations via function-calling tools

## Open questions

- Obsidian sync path once Hermes EC2 is phased out
- Where to host Pi-Mono runners (Railway vs fly.io vs keeping ECS)
- Long-running research: Convex actions cap at ~5min — may need a runner here too
