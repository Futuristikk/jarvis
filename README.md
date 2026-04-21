# Jarvis

Personal AI agent. Swift (iOS) front end, Convex back end, OpenAI Realtime over WebRTC for voice.

Replaces [hermes](../hermes) — keeping the Obsidian vault + selected research skills, dropping the Nous harness.

## What it does

Async operations center. Kick off tasks from phone, live life, come back to results.

- **Projects & tasks** — start a side project, add research questions, it works them in the background
- **Research agent** — Claude API + web search, stores summaries and sources
- **Coding agents** — triggers Pi-Mono jobs (Railway / fly.io / EC2) for implementation work
- **Gmail + Calendar** — read, draft, schedule
- **Voice** — OpenAI Realtime over WebRTC, system prompt hydrated from Convex state
- **Obsidian bridge** — continue writing durable notes to the existing vault

## Architecture

```
┌────────────┐      HTTPS       ┌───────────────────┐
│  iOS app   │ ───────────────► │  Convex HTTP      │
│  (Swift)   │                  │  actions          │
└─────┬──────┘                  └─────────┬─────────┘
      │ WebRTC                            │
      │                                   ▼
      │                        ┌───────────────────┐
      │                        │  Convex functions │
      │                        │  + scheduled jobs │
      │                        └─────┬────────┬────┘
      ▼                              │        │
┌────────────┐                       ▼        ▼
│  OpenAI    │           ┌──────────────┐  ┌──────────────┐
│  Realtime  │           │  Claude API  │  │  Pi-Mono     │
│            │           │  Gmail/Cal   │  │  runners     │
└────────────┘           │  Web search  │  │  (Railway/   │
                         └──────────────┘  │   fly.io)    │
                                           └──────────────┘
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the schema and data flow.

## Layout

```
ios/       — Swift app (TestFlight only, not App Store)
convex/    — Convex functions, schema, scheduled jobs
docs/      — architecture, decisions, notes
```

## Status

Scaffolding. Convex deployment `fastidious-mouse-703` (dev/adam-noonan, us-east, S16).

Not for distribution. Personal use.
