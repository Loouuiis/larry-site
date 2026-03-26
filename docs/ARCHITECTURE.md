# Larry — Architecture

## Monorepo Layout

```
larry-site/
├── apps/
│   ├── api/       Fastify v5 REST API (port 8080)
│   ├── web/       Next.js 16 App Router frontend (port 3000)
│   └── worker/    BullMQ job consumer (async processing + agent lifecycle)
├── packages/
│   ├── ai/        OpenAI extraction, policy engine, risk scoring, action reasoning
│   ├── db/        Postgres client, schema SQL, migration runner, seed
│   ├── shared/    Shared TypeScript domain types and queue contracts
│   └── config/    Zod-validated env schemas (getApiEnv, getWorkerEnv)
├── infrastructure/
│   └── terraform/ Stage 1 skeleton only — no full AWS provisioning yet
├── docs/          All documentation (you are here)
├── DEPLOYMENT.md  Vercel + Railway deployment details
└── running_locally.md
```

## Runtime Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Database | Neon Postgres (prod), Docker Postgres (local) | `DATABASE_URL` |
| Queue | BullMQ on Redis | `REDIS_URL`, queue name: `larry-events` |
| AI | OpenAI `gpt-4o-mini` | provider-abstracted in `packages/ai`; Anthropic/Gemini switchable via `MODEL_PROVIDER` env |
| Frontend | Next.js 16 (App Router) | Deployed to Vercel |
| API | Fastify v5 | Deployed to Railway |
| Worker | BullMQ consumer | Deployed to Railway (service: `diplomatic-vitality`) |

## Package Responsibilities

- **`packages/ai`** — LLM provider abstraction, `extractActions()`, `evaluateActionPolicy()`, confidence thresholds, `buildActionReasoning()`, intervention decision builder.
- **`packages/db`** — `getDb()` pool, `schema.sql`, `migrate.ts` (run from `packages/db/` dir), `seed.ts`.
- **`packages/shared`** — `EVENT_QUEUE_NAME`, `ExtractedAction`, `ActionReasoning`, `InterventionDecision`, `CorrectionFeedback`, canonical event types.
- **`packages/config`** — `getApiEnv()` / `getWorkerEnv()` — all env vars validated at startup; app fails fast on missing required vars.

## Key Entry Points

| Service | File |
|---------|------|
| API server | `apps/api/src/server.ts` |
| API route registration | `apps/api/src/routes/v1/index.ts` |
| Worker entry | `apps/worker/src/worker.ts` |
| DB schema | `packages/db/src/schema.sql` |
| DB migration | `packages/db/src/migrate.ts` |
| Queue publish | `apps/api/src/services/queue.ts` |

## Environment Files

| Service | File | Notes |
|---------|------|-------|
| Frontend | `apps/web/.env.local` | Template: `apps/web/.env.example` |
| API | `apps/api/.env` | Template: `apps/api/.env.example` |
| Worker | `apps/worker/.env` | Template: `apps/worker/.env.example` |

**Critical:** API and Worker must share the same `DATABASE_URL`. Mismatched URLs (e.g. one pointing to Neon, one to Docker) cause worker-written `extracted_actions` to be invisible to the API's Action Centre.

## Root Commands

```bash
npm run api:dev       # Start API with hot reload
npm run api:build     # Compile TypeScript (also builds packages)
npm run api:test      # Run API unit tests
npm run worker:dev    # Start worker with hot reload
npm run worker:build  # Compile worker
npm run web:dev       # Start Next.js dev server
npm run web:build     # Build Next.js for production
npm run db:migrate    # Run schema migrations (must run from packages/db/)
```

## Local Development

See `running_locally.md` for the step-by-step guide. Short version:
```bash
docker compose up -d           # Postgres + Redis
npm run api:build              # Build packages once
cd packages/db && npm run migrate && npm run seed
npm run api:dev                # Terminal 1
npm run worker:dev             # Terminal 2
npm run web:dev                # Terminal 3
# Visit http://localhost:3000 → Dev Login button
```

## Stage 2 Migration Path

Stage 1 uses minimal infra (Neon Postgres, Docker/Railway Redis). Stage 2 will:
- Replace Neon with RDS endpoint (no code changes needed, just `DATABASE_URL`)
- Replace Redis with ElastiCache endpoint (just `REDIS_URL`)
- Optionally bridge to SQS if queue volumes demand it
- Expand Terraform from skeleton to full managed AWS provisioning
