# Jarvis

Personal AI agent. Vite + React PWA front end, TypeScript backend on Railway, Convex for persistence, OpenAI Realtime over WebRTC for voice. A native Swift iOS client is reserved as a future option.

Replaces [hermes](../hermes) — keeping the Obsidian vault + selected research skills, dropping the Nous harness.

## What it does

Async operations center. Kick off tasks from phone, live life, come back to results.

- **Projects & tasks** — start a side project, add research questions, it works them in the background
- **Research agent** — Claude API + web search, stores summaries and sources
- **Coding agents** — backend holds a GitHub PAT and spins up Pi-Mono agents against Adam's side-project repos
- **Gmail + Calendar** — read, draft, schedule
- **Voice** — OpenAI Realtime over WebRTC from the browser, system prompt hydrated from current state
- **Obsidian bridge** — continue writing durable notes to the existing vault

## Architecture

```
┌────────────┐       HTTPS       ┌─────────────────────┐
│  Web PWA   │ ────────────────► │  TS backend         │
│ (Vite + R) │ ◄── WS / SSE ──── │  (Railway)          │
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

PWA installs to the home screen on iOS / Android. One backend service instead of a fleet of single-purpose runners. Pi-Mono coding agents run as jobs under the same Railway service.

A native Swift iOS client is kept as a future option — same backend, same protocols, lift-and-shift once an Apple Developer account is in play.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for schema and data flows.

## Layout

```
web/       — Vite + React PWA (primary client)
backend/   — TypeScript service (Railway) — orchestrator, Pi-Mono runner, integrations
convex/    — Convex schema + functions (data layer)
ios/       — reserved for a future Swift client (TestFlight only, no code yet)
docs/      — architecture, decisions, notes
```

## Status

Scaffolding. Convex deployment `fastidious-mouse-703` (dev/adam-noonan, us-east, S16). Railway backend not yet provisioned. Web shell wired to backend `/health`.

Not for distribution. Personal use.
