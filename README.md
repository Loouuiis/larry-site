# Larry Monorepo (Stage 1)

## Product Scope (Locked 2026-03-16)

- Larry v1 is a standalone PM platform, with Larry Workspace as the system of record.
- Slack, Email, and Calendar are supported as connectors/channels, not the core data model.
- Jira/Asana/ClickUp-style integrations are explicitly post-v1 (optional business decision later).

See [docs/backend/v1-standalone-rebaseline.md](docs/backend/v1-standalone-rebaseline.md) for the scope baseline and [docs/backend/v1-execution-plan.md](docs/backend/v1-execution-plan.md) for sprint-level execution.

## Structure

- `apps/web` - Next.js frontend shell and upcoming Larry Workspace UI
- `apps/api` - Fastify backend API (core product backend)
- `apps/worker` - BullMQ worker service (async processing + agent lifecycle)
- `packages/db` - Postgres client + schema migration
- `packages/shared` - shared domain/queue types
- `packages/ai` - AI extraction + policy/risk logic
- `packages/config` - shared env validation
- `infrastructure/terraform` - minimal Stage 1 Terraform skeleton
- `docs` - architecture and implementation notes

## Stage 1 stack

- Database: Neon Postgres target (`DATABASE_URL`)
- Queue: BullMQ + Redis (`REDIS_URL`)
- Storage: S3 (integrated incrementally)
- Local services: `docker compose` (Postgres + Redis)

## Local quick start

```bash
docker compose up -d
npm install
npm run db:migrate
npm run db:seed
npm run api:dev
npm run worker:dev
npm run web:dev
```

See [running_locally.md](running_locally.md) for the full setup guide.

## Commands (repo root)

- `npm run web:dev`
- `npm run web:build`
- `npm run api:dev`
- `npm run api:build`
- `npm run api:test`
- `npm run worker:dev`
- `npm run worker:build`
- `npm run db:migrate`

## Environment files

- Frontend: `apps/web/.env.local`
- API: `apps/api/.env`
- Worker: `apps/worker/.env`

Templates:
- `apps/web/.env.example`
- `apps/api/.env.example`
- `apps/worker/.env.example`
