# Jarvis

Personal AI agent. Vite + React PWA front end, TypeScript backend on Railway, Convex for persistence, OpenAI Realtime over WebRTC for voice. A native Swift iOS client is reserved as a future option.

## What it does

Async operations center. Kick off tasks from phone, live life, come back to results.

- **Projects & tasks** — start a thread, add research questions, it works them in the background
- **Research agent** — Claude API + web search, stores summaries and sources
- **Scheduled research** — cron-style schedules with timezone-aware previews, auto-save to the vault
- **Language tutor** — leveled dialogues, word-by-word playback, vocab capture (Spanish first)
- **Voice** — OpenAI Realtime over WebRTC from the browser, system prompt hydrated from current state
- **Gmail + Calendar** — read, draft, schedule
- **Obsidian bridge** — read and write a synced vault on disk; the PWA browses scopes and renders markdown

## Architecture

```
┌────────────┐    HTTPS    ┌─────────────────────┐ vault r/w ┌─────────────────────┐
│  Web PWA   │ ──────────► │  TS backend         │ ────────► │  Obsidian vault     │
│ (Vite + R) │ ◄─ WS/SSE ─ │  (Railway)          │ ◄──────── │  (filesystem path)  │
└─────┬──────┘             │                     │           │  synced on Mac      │
      │ WebRTC             │  research worker    │           │  (Syncthing/iCloud) │
      │                    │  scheduler          │           └─────────────────────┘
      ▼                    │  vault read / write │
┌────────────┐             │  Google OAuth       │
│  OpenAI    │             │  Claude / search    │
│  Realtime  │             └──────────┬──────────┘
└────────────┘                        │
                                      ▼
                            ┌─────────────────────┐
                            │  Convex             │
                            │  DB + scheduled fns │
                            └─────────────────────┘
```

PWA installs to the home screen on iOS / Android. One centralized backend service. The Obsidian vault lives on your Mac's filesystem; the backend reads it (for the PWA browser) and writes to it (research auto-save, promote-to-canonical), and your existing sync mechanism propagates changes to other devices.

A native Swift iOS client is kept as a future option — same backend, same protocols, lift-and-shift once an Apple Developer account is in play.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for schema and data flows.

## Layout

```
web/       — Vite + React PWA (primary client)
backend/   — TypeScript service (Railway) — research worker, scheduler, vault reader/writer, integrations
convex/    — Convex schema + functions (data layer)
ios/       — reserved for a future Swift client (TestFlight only, no code yet)
docs/      — architecture, decisions, notes
```

## Status

Working slices, running locally. The pieces that are wired end-to-end today:

- **Research worker** — submit a question from the PWA, backend dispatches Claude + web search, results stream back with citations, persisted in Convex
- **Scheduled research** — cron-style schedules with timezone-aware next-run preview, run-now / pause / resume, latest-task readout per schedule
- **Vault writer** — save task output to a synced Obsidian vault under scope/Inbox, scope/Threads/{slug}, or scope/Scheduled/{slug}
- **Promote to canonical** — turn a research result into a project file via create / append / merge modes, with optional Claude transform prompt
- **Google OAuth** — token exchange + refresh + encrypted storage in Convex; Gmail and Calendar surfaces ready to read
- **PWA shell** — Vite + React, installable, talks to the backend over HTTP

In progress: voice (OpenAI Realtime over WebRTC), expanding the language-tutor surface beyond Spanish, Railway deploy.

## License

MIT — see [LICENSE](LICENSE).
