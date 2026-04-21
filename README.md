# Jarvis

Personal AI agent. Swift (iOS) front end, TypeScript backend on Railway, Convex for persistence, OpenAI Realtime over WebRTC for voice.

Replaces [hermes](../hermes) — keeping the Obsidian vault + selected research skills, dropping the Nous harness.

## What it does

Async operations center. Kick off tasks from phone, live life, come back to results.

- **Projects & tasks** — start a side project, add research questions, it works them in the background
- **Research agent** — Claude API + web search, stores summaries and sources
- **Coding agents** — backend holds a GitHub PAT and spins up Pi-Mono agents against Adam's side-project repos
- **Gmail + Calendar** — read, draft, schedule
- **Voice** — OpenAI Realtime over WebRTC, system prompt hydrated from current state
- **Obsidian bridge** — continue writing durable notes to the existing vault

## Architecture

```
┌────────────┐       HTTPS       ┌─────────────────────┐
│  iOS app   │ ────────────────► │  TS backend         │
│  (Swift)   │ ◄── WS / SSE ──── │  (Railway)          │
└─────┬──────┘                   │                     │
      │ WebRTC                   │  orchestrator       │
      │                          │  GitHub PAT         │
      ▼                          │  Pi-Mono spin-up    │
┌────────────┐                   │  Google OAuth       │
│  OpenAI    │                   │  Claude / search    │
│  Realtime  │                   └──────────┬──────────┘
└────────────┘                              │
                                            ▼
                                  ┌─────────────────────┐
                                  │  Convex             │
                                  │  DB + scheduled fns │
                                  └─────────────────────┘
```

One backend service instead of a fleet of single-purpose runners. Pi-Mono coding agents run as jobs under the same Railway service.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for schema and data flows.

## Layout

```
ios/       — Swift app (TestFlight only, not App Store)
backend/   — TypeScript service (Railway) — orchestrator, Pi-Mono runner, integrations
convex/    — Convex schema + functions (data layer)
docs/      — architecture, decisions, notes
```

## Status

Scaffolding. Convex deployment `fastidious-mouse-703` (dev/adam-noonan, us-east, S16). Railway backend not yet provisioned.

Not for distribution. Personal use.
