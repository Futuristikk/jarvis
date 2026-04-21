# jarvis-backend

Centralized orchestrator — Hono on Railway, Convex data layer, Pi-Mono coding agents spun up as local jobs.

## Run

```bash
cp .env.example .env
# fill in CONVEX_URL; other keys can stay blank until used

npm install
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

Create a task (after running `npx convex dev` once at repo root so the schema is pushed):

```bash
curl -X POST http://localhost:3000/tasks \
  -H 'content-type: application/json' \
  -d '{"type":"research","spec":"summarize convex vs supabase tradeoffs"}'
```

## Layout

```
src/
  index.ts         — Hono app entry
  convex.ts        — Convex HTTP client
  routes/tasks.ts  — task endpoints
```

## Next

- Swap `"tasks:create" as never` for typed `api.tasks.create` once `convex/_generated/api` exists
- Add WS/SSE endpoint for iOS live updates
- Google OAuth callback + token storage
- Pi-Mono job runner (subprocess-per-job)
- Worker loop that pulls queued tasks and dispatches by type
